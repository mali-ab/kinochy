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

# Refuse to merge automatically. This prevents an existing movie bundle from
# being silently overwritten. The old volume is retained as a rollback copy.
if find "$MOVIE_STORAGE_PATH" -mindepth 1 -print -quit | grep -q .; then
  die "destination is not empty: $MOVIE_STORAGE_PATH"
fi

log "Copying old uploaded movies and covers"
docker run --rm --entrypoint sh \
  --mount "type=volume,source=$OLD_VOLUME,target=/source,readonly" \
  --mount "type=bind,source=$MOVIE_STORAGE_PATH,target=/destination" \
  "$APP_IMAGE" -c '
    set -eu
    [ -d /source/uploads ] || { echo "old /app/storage/uploads directory was not found" >&2; exit 1; }
    cp -a /source/uploads/. /destination/
    source_count=$(find /source/uploads -type f -o -type l | wc -l)
    destination_count=$(find /destination -type f -o -type l | wc -l)
    [ "$source_count" -eq "$destination_count" ] || {
      echo "copy verification failed: source=$source_count destination=$destination_count" >&2
      exit 1
    }
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

log "Migration complete"
log "The old Docker volume was not deleted: $OLD_VOLUME"
log "Restart the app with: docker compose up -d --force-recreate app"
