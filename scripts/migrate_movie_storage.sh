#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
APP_CONTAINER="${APP_CONTAINER:-kinochy_app}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-kinochy_postgres}"
APP_IMAGE="${APP_IMAGE:-kinochy-app:deploy}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed"
[[ -f "$ENV_FILE" ]] || die "missing environment file: $ENV_FILE"

# Read only MOVIE_STORAGE_PATH instead of sourcing the whole dotenv file. This
# also supports an unquoted path containing spaces.
MOVIE_STORAGE_PATH="$(sed -n 's/^[[:space:]]*MOVIE_STORAGE_PATH[[:space:]]*=[[:space:]]*//p' "$ENV_FILE" | tail -n 1)"
MOVIE_STORAGE_PATH="${MOVIE_STORAGE_PATH%$'\r'}"
if [[ "$MOVIE_STORAGE_PATH" == \"*\" && "$MOVIE_STORAGE_PATH" == *\" ]]; then
  MOVIE_STORAGE_PATH="${MOVIE_STORAGE_PATH:1:${#MOVIE_STORAGE_PATH}-2}"
elif [[ "$MOVIE_STORAGE_PATH" == \'*\' && "$MOVIE_STORAGE_PATH" == *\' ]]; then
  MOVIE_STORAGE_PATH="${MOVIE_STORAGE_PATH:1:${#MOVIE_STORAGE_PATH}-2}"
fi

[[ -n "$MOVIE_STORAGE_PATH" ]] || die "MOVIE_STORAGE_PATH is not set in $ENV_FILE"
[[ "$MOVIE_STORAGE_PATH" == /* ]] || die "MOVIE_STORAGE_PATH must be an absolute path"
[[ "$MOVIE_STORAGE_PATH" != "/" ]] || die "MOVIE_STORAGE_PATH cannot be /"

docker inspect "$APP_CONTAINER" >/dev/null 2>&1 || die "container $APP_CONTAINER was not found"
docker inspect "$POSTGRES_CONTAINER" >/dev/null 2>&1 || die "container $POSTGRES_CONTAINER was not found"

OLD_VOLUME="$(docker inspect "$APP_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/app/storage"}}{{.Name}}{{end}}{{end}}')"
[[ -n "$OLD_VOLUME" ]] || die "could not find the old /app/storage Docker volume on $APP_CONTAINER"

log "Old Docker volume: $OLD_VOLUME"
log "New server directory: $MOVIE_STORAGE_PATH"
mkdir -p -- "$MOVIE_STORAGE_PATH"

# Copy only. A separate database-aware migration maps these folders to slugs.
log "Copying old uploaded movies and covers"
docker run --rm --entrypoint sh \
  --mount "type=volume,source=$OLD_VOLUME,target=/source,readonly" \
  --mount "type=bind,source=$MOVIE_STORAGE_PATH,target=/destination" \
  "$APP_IMAGE" -c '
    set -eu
    [ -d /source/uploads ] || { echo "old /app/storage/uploads directory was not found" >&2; exit 1; }
    # Make interrupted migrations resumable without overwriting anything that
    # is already in external storage.
    cp -a --no-clobber /source/uploads/. /destination/
    find /source/uploads -type f -exec sh -c '\''
      for source do
        relative=${source#/source/uploads/}
        cmp -s "$source" "/destination/$relative" || {
          echo "destination conflict: $relative" >&2
          exit 1
        }
      done
    '\'' sh {} +
    find /source/uploads -type l -exec sh -c '\''
      for source do
        relative=${source#/source/uploads/}
        [ -L "/destination/$relative" ] &&
          [ "$(readlink "$source")" = "$(readlink "/destination/$relative")" ] || {
            echo "destination symlink conflict: $relative" >&2
            exit 1
          }
      done
    '\'' sh {} +
    source_count=$(find /source/uploads -type f -o -type l | wc -l)
    printf "Verified %s copied files and links\n" "$source_count"
  '

log "Updating movies.video_path in PostgreSQL"
docker exec -i "$POSTGRES_CONTAINER" sh -c \
  'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v new_root="$1"' \
  sh "$MOVIE_STORAGE_PATH" <<'SQL'
BEGIN;
UPDATE movies
SET video_path = :'new_root' || substring(video_path FROM char_length('/app/storage/uploads') + 1),
    updated_at = now()
WHERE video_path = '/app/storage/uploads'
   OR video_path LIKE '/app/storage/uploads/%';
COMMIT;
SQL

log "Removing migrated movie files from the old Docker volume"
docker run --rm --entrypoint sh \
  --mount "type=volume,source=$OLD_VOLUME,target=/source" \
  "$APP_IMAGE" -c '
    set -eu
    [ -d /source/uploads ] || { echo "old /app/storage/uploads directory was not found" >&2; exit 1; }
    find /source/uploads -mindepth 1 -delete
    [ -z "$(find /source/uploads -mindepth 1 -print -quit)" ] || {
      echo "old movie cleanup verification failed" >&2
      exit 1
    }
  '

log "Migration complete"
log "Old movie files were removed; other runtime data remains in: $OLD_VOLUME"
log "Restart the app with: docker compose up -d --force-recreate app"
