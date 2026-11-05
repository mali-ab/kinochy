#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
APP_CONTAINER="${APP_CONTAINER:-kinochy_app}"
DESTINATION="${DESTINATION:-$ROOT_DIR/backend/storage/uploads}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "Docker is not installed"
docker inspect "$APP_CONTAINER" >/dev/null 2>&1 || die "container $APP_CONTAINER was not found"
docker exec "$APP_CONTAINER" test -d /app/storage/uploads \
  || die "container $APP_CONTAINER has no /app/storage/uploads directory"

mkdir -p -- "$DESTINATION"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/kinochy-docker-movies.XXXXXX")"
cleanup() { rm -rf -- "$TEMP_DIR"; }
trap cleanup EXIT

log "Copying Docker files from $APP_CONTAINER:/app/storage/uploads"
log "Destination: $DESTINATION"
docker cp "$APP_CONTAINER:/app/storage/uploads/." "$TEMP_DIR/"

source_count="$(find "$TEMP_DIR" -type f -o -type l | wc -l | tr -d ' ')"
[[ "$source_count" -gt 0 ]] || die "the Docker uploads directory is empty"

# Copy only files that are absent so interrupted copies can be safely resumed.
# Existing paths are checked below and conflicting files are left untouched.
cp -an -- "$TEMP_DIR/." "$DESTINATION/"

while IFS= read -r -d '' source; do
  relative="${source#"$TEMP_DIR"/}"
  target="$DESTINATION/$relative"
  if [[ -L "$source" ]]; then
    [[ -L "$target" && "$(readlink "$source")" == "$(readlink "$target")" ]] \
      || die "destination symlink conflict: $relative"
  else
    [[ -f "$target" ]] || die "copy verification failed: $relative is missing"
    cmp -s -- "$source" "$target" || die "destination file conflict: $relative"
  fi
done < <(find "$TEMP_DIR" \( -type f -o -type l \) -print0)

log "Verified $source_count copied files and links"
log "The original Docker files were left unchanged"
