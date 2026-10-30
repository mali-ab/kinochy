#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy.env}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE (cp .deploy.env.example .deploy.env, then fill it in)"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DEPLOY_HOST="${DEPLOY_HOST:-}"
[[ -n "$DEPLOY_HOST" ]] || die "DEPLOY_HOST is not set in $ENV_FILE"

DEPLOY_USER="${DEPLOY_USER:-kinochy}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
if [[ -z "${DEPLOY_PATH:-}" ]]; then
  if [[ "$DEPLOY_USER" == "root" ]]; then
    DEPLOY_PATH="/root/kinochy"
  else
    DEPLOY_PATH="/home/$DEPLOY_USER/kinochy"
  fi
fi
DEPLOY_COMPOSE_FILE="${DEPLOY_COMPOSE_FILE:-docker-compose.yml}"
DEPLOY_COMPOSE_CMD="${DEPLOY_COMPOSE_CMD:-docker compose}"
DEPLOY_APP_ENV="${DEPLOY_APP_ENV:-.env}"
DEPLOY_DELETE="${DEPLOY_DELETE:-0}"
DEPLOY_STRICT_HOST_KEY_CHECKING="${DEPLOY_STRICT_HOST_KEY_CHECKING:-accept-new}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
if [[ "$DEPLOY_SSH_KEY" == "~/"* ]]; then
  DEPLOY_SSH_KEY="$HOME/${DEPLOY_SSH_KEY#\~/}"
fi

command -v rsync >/dev/null 2>&1 || die "rsync is not installed"
command -v ssh >/dev/null 2>&1 || die "ssh is not installed"
command -v docker >/dev/null 2>&1 || die "Docker is not installed locally"
docker compose version >/dev/null 2>&1 || die "Docker Compose is not available locally"
[[ "$DEPLOY_COMPOSE_FILE" == "docker-compose.yml" ]] ||
  die "local image deployment currently supports docker-compose.yml (app and edge)"

SSH_OPTS=(-p "$DEPLOY_PORT" -o "StrictHostKeyChecking=$DEPLOY_STRICT_HOST_KEY_CHECKING")
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  [[ -f "$DEPLOY_SSH_KEY" ]] || die "SSH key not found: $DEPLOY_SSH_KEY"
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
fi

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
SSH=(ssh "${SSH_OPTS[@]}")
RSYNC_SSH=(ssh "${SSH_OPTS[@]}")

if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  command -v sshpass >/dev/null 2>&1 || die "DEPLOY_SSH_PASSWORD is set but sshpass is not installed"
  export SSHPASS="$DEPLOY_SSH_PASSWORD"
  SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
  RSYNC_SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
fi

RSYNC_SSH_CMD="$(printf '%q ' "${RSYNC_SSH[@]}")"

shell_quote() { printf "'%s'" "${1//\'/\'\\\'\'}"; }
REMOTE_DIR_Q="$(shell_quote "$DEPLOY_PATH")"

log "Deploying $ROOT_DIR to $REMOTE:$DEPLOY_PATH"
LOCAL_PLATFORM="$(docker info --format '{{.OSType}}/{{.Architecture}}')"
REMOTE_PLATFORM="$("${SSH[@]}" "$REMOTE" "docker info --format '{{.OSType}}/{{.Architecture}}'")"
[[ "$LOCAL_PLATFORM" == "$REMOTE_PLATFORM" ]] ||
  die "local Docker platform $LOCAL_PLATFORM does not match server Docker platform $REMOTE_PLATFORM"

log "Building app and edge images locally"
(cd "$ROOT_DIR" && docker compose -f "$DEPLOY_COMPOSE_FILE" build app edge)

"${SSH[@]}" "$REMOTE" "mkdir -p -- $REMOTE_DIR_Q"

RSYNC_ARGS=(
  -az
  -s
  --human-readable
  --info=progress2
  --exclude='/.git/'
  --exclude='/.deploy.env'
  --exclude='/.env'
  --exclude='node_modules/'
  --exclude='.next/'
  --exclude='/frontend/out/'
  --exclude='/admin/dist/'
  --exclude='/backend/bin/'
  --exclude='/backend/obj/'
  --exclude='/backend/wwwroot/'
  --exclude='/backend/storage/uploads/'
  --exclude='/backend/storage/preloaded/'
  --exclude='/puzzle_movies_output/'
  --exclude='/internet_archive_output/'
  --exclude='__pycache__/'
  --exclude='.venv/'
  --exclude='*.log'
  --exclude='*.tar'
)
[[ "$DEPLOY_DELETE" == "1" ]] && RSYNC_ARGS+=(--delete)

rsync "${RSYNC_ARGS[@]}" -e "$RSYNC_SSH_CMD" "$ROOT_DIR/" "$REMOTE:$DEPLOY_PATH/"

if [[ -n "$DEPLOY_APP_ENV" ]]; then
  LOCAL_APP_ENV="$ROOT_DIR/$DEPLOY_APP_ENV"
  if [[ -f "$LOCAL_APP_ENV" ]]; then
    log "Uploading $DEPLOY_APP_ENV as $DEPLOY_PATH/.env"
    rsync -az -s -e "$RSYNC_SSH_CMD" "$LOCAL_APP_ENV" "$REMOTE:$DEPLOY_PATH/.env"
  else
    log "No local $DEPLOY_APP_ENV found; keeping the server's existing .env"
    "${SSH[@]}" "$REMOTE" "test -f $REMOTE_DIR_Q/.env" ||
      die "no .env on server: create $DEPLOY_PATH/.env (see .env.example)"
  fi
fi

REMOTE_COMPOSE_Q="$(shell_quote "$DEPLOY_PATH/$DEPLOY_COMPOSE_FILE")"
log "Uploading locally built Docker images"
docker image save kinochy-app:deploy kinochy-edge:deploy | "${SSH[@]}" "$REMOTE" "docker image load"

REMOTE_CMD="cd -- $REMOTE_DIR_Q && $DEPLOY_COMPOSE_CMD -f $REMOTE_COMPOSE_Q up -d --no-build"

log "Running on server: $REMOTE_CMD"
"${SSH[@]}" "$REMOTE" "$REMOTE_CMD"

if [[ -n "${DEPLOY_HEALTH_URL:-}" ]]; then
  log "Waiting for $DEPLOY_HEALTH_URL"
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "$DEPLOY_HEALTH_URL" >/dev/null; then
      log "Health check passed"
      break
    fi
    sleep 2
  done
fi

log "Done."
