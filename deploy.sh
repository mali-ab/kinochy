#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${DEPLOY_ENV_FILE:-$ROOT_DIR/.deploy.env}"
log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }
[[ -f "$ENV_FILE" ]] || die "missing $ENV_FILE (copy .deploy.env.example and configure it)"

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DEPLOY_HOST="${DEPLOY_HOST:-}"
[[ -n "$DEPLOY_HOST" ]] || die "DEPLOY_HOST is not set in $ENV_FILE"
DEPLOY_REPO="${DEPLOY_REPO:-https://github.com/mali-ab/kinochy.git}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_USER="${DEPLOY_USER:-kinochy}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/home/$DEPLOY_USER/kinochy}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"
DEPLOY_STRICT_HOST_KEY_CHECKING="${DEPLOY_STRICT_HOST_KEY_CHECKING:-accept-new}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-}"
DEPLOY_NGINX_SITE_NAME="${DEPLOY_NGINX_SITE_NAME:-kinochy}"
DEPLOY_SERVER_NAME="${DEPLOY_SERVER_NAME:-}"
if [[ -z "$DEPLOY_SERVER_NAME" && "$DEPLOY_HEALTH_URL" =~ ^https?://([^/:]+) ]]; then
  DEPLOY_SERVER_NAME="${BASH_REMATCH[1]}"
fi
DEPLOY_SERVER_NAME="${DEPLOY_SERVER_NAME:-$DEPLOY_HOST}"
DEPLOY_API_PORT="${DEPLOY_API_PORT:-4000}"
DEPLOY_APP_ENV="${DEPLOY_APP_ENV:-}"
POSTGRES_DB="${POSTGRES_DB:-kinochy}"
POSTGRES_USER="${POSTGRES_USER:-kinochy}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"

command -v ssh >/dev/null 2>&1 || die "ssh is not installed"
command -v rsync >/dev/null 2>&1 || die "rsync is not installed"
if [[ "$DEPLOY_SSH_KEY" == "~/"* ]]; then DEPLOY_SSH_KEY="$HOME/${DEPLOY_SSH_KEY#\~/}"; fi

SSH_OPTS=(-p "$DEPLOY_PORT" -o "StrictHostKeyChecking=$DEPLOY_STRICT_HOST_KEY_CHECKING" -o ConnectTimeout=10 -o ServerAliveInterval=20)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  [[ -f "$DEPLOY_SSH_KEY" ]] || die "SSH key not found: $DEPLOY_SSH_KEY"
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes)
fi
SSH=(ssh "${SSH_OPTS[@]}")
if [[ -n "${DEPLOY_SSH_PASSWORD:-}" ]]; then
  command -v sshpass >/dev/null 2>&1 || die "sshpass is required when DEPLOY_SSH_PASSWORD is set"
  export SSHPASS="$DEPLOY_SSH_PASSWORD"
  SSH=(sshpass -e ssh "${SSH_OPTS[@]}")
fi
RSYNC_SSH_CMD="$(printf '%q ' "${SSH[@]}")"
REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"
shell_quote() { printf "'%s'" "${1//\'/\'\\\'\'}"; }
REMOTE_DIR_Q="$(shell_quote "$DEPLOY_PATH")"

log "Preparing release directory on $REMOTE"
"${SSH[@]}" "$REMOTE" "mkdir -p -- $REMOTE_DIR_Q/releases"
log "Cloning $DEPLOY_REPO ($DEPLOY_BRANCH) on the server"
DEPLOY_REPO_Q="$(shell_quote "$DEPLOY_REPO")"
DEPLOY_BRANCH_Q="$(shell_quote "$DEPLOY_BRANCH")"
SOURCE_PATH="$DEPLOY_PATH/source"
SOURCE_PATH_Q="$(shell_quote "$SOURCE_PATH")"
"${SSH[@]}" "$REMOTE" "if [[ -d $SOURCE_PATH_Q/.git ]]; then git -C $SOURCE_PATH_Q fetch --prune origin; else if [[ -e $SOURCE_PATH_Q ]] && [[ -n \$(ls -A $SOURCE_PATH_Q 2>/dev/null) ]]; then echo 'Source path exists and is not a Git checkout: $SOURCE_PATH' >&2; exit 1; fi; git clone --branch $DEPLOY_BRANCH_Q --single-branch $DEPLOY_REPO_Q $SOURCE_PATH_Q; fi; git -C $SOURCE_PATH_Q remote set-url origin $DEPLOY_REPO_Q; git -C $SOURCE_PATH_Q checkout -B $DEPLOY_BRANCH_Q origin/$DEPLOY_BRANCH_Q; git -C $SOURCE_PATH_Q reset --hard origin/$DEPLOY_BRANCH_Q"
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)-$$"
REMOTE_RELEASE="$DEPLOY_PATH/releases/$RELEASE_ID"
REMOTE_RELEASE_Q="$(shell_quote "$REMOTE_RELEASE")"
"${SSH[@]}" "$REMOTE" "mkdir -p -- $REMOTE_RELEASE_Q/api $REMOTE_RELEASE_Q/admin"
"${SSH[@]}" "$REMOTE" "bash -s -- $SOURCE_PATH_Q $REMOTE_RELEASE_Q" <<'BUILD_EOF'
set -euo pipefail
source_path="$1"
release="$2"
command -v npm >/dev/null 2>&1 || { echo 'Node.js/npm is required on the server' >&2; exit 1; }
command -v dotnet >/dev/null 2>&1 || { echo '.NET SDK is required on the server to build the cloned repository' >&2; exit 1; }
if [[ -f "$source_path/admin/package-lock.json" ]]; then npm ci --prefix "$source_path/admin"; else npm install --prefix "$source_path/admin"; fi
npm run build --prefix "$source_path/admin"
dotnet publish "$source_path/backend/Kinochy.Api.csproj" -c Release -o "$release/api"
cp -a "$source_path/admin/dist/." "$release/admin/"
BUILD_EOF

if [[ -n "$DEPLOY_APP_ENV" ]]; then
  LOCAL_APP_ENV="$ROOT_DIR/$DEPLOY_APP_ENV"
  [[ -f "$LOCAL_APP_ENV" ]] || die "configured DEPLOY_APP_ENV file not found: $LOCAL_APP_ENV"
  log "Uploading $DEPLOY_APP_ENV as the server .env"
  rsync -az -e "$RSYNC_SSH_CMD" "$LOCAL_APP_ENV" "$REMOTE:$DEPLOY_PATH/.env"
fi

log "Installing native API service and host Nginx site"
REMOTE_SCRIPT=$(cat <<'REMOTE_EOF'
set -eu
release="$1"
deploy_path="$2"
service_user="$3"
site_name="$4"
server_name="$5"
api_port="$6"
postgres_db="$7"
postgres_user="$8"
postgres_password="$9"

test -f "$deploy_path/.env" || { echo "Missing $deploy_path/.env; it must define JWT_SECRET and MOVIE_STORAGE_PATH" >&2; exit 1; }
for command in dotnet nginx systemctl apt-get; do command -v "$command" >/dev/null 2>&1 || { echo "Missing server command: $command" >&2; exit 1; }; done
sudo -n -v || { echo "The deploy user needs passwordless sudo for systemd and Nginx setup" >&2; exit 1; }

dotenv_value() {
    sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$deploy_path/.env" | tail -n 1 | sed -e 's/[[:space:]]*#.*$//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"
}
movie_storage_path="$(dotenv_value MOVIE_STORAGE_PATH)"
test -n "$movie_storage_path" || { echo "MOVIE_STORAGE_PATH is missing in $deploy_path/.env" >&2; exit 1; }
test -n "$postgres_db" && test -n "$postgres_user" && test -n "$postgres_password" || { echo "Set POSTGRES_DB, POSTGRES_USER, and POSTGRES_PASSWORD in .deploy.env" >&2; exit 1; }
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
sudo systemctl enable --now postgresql
sudo -u postgres psql -v ON_ERROR_STOP=1 --set=db="$postgres_db" --set=role="$postgres_user" --set=password="$postgres_password" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'role', :'password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')\gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'role', :'password')\gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'db')\gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'db', :'role')\gexec
SQL
quote_conn_value() { printf '"%s"' "$(printf '%s' "$1" | sed 's/"/""/g')"; }
database_url="Host=127.0.0.1;Port=5432;Database=$(quote_conn_value "$postgres_db");Username=$(quote_conn_value "$postgres_user");Password=$(quote_conn_value "$postgres_password")"
printf 'DATABASE_URL="%s"\n' "$(printf '%s' "$database_url" | sed 's/\\/\\\\/g; s/"/\\"/g')" | sudo tee /etc/kinochy-api.env >/dev/null
sudo chmod 0600 /etc/kinochy-api.env

sudo install -d -o "$service_user" -g "$service_user" "$deploy_path/shared"
sudo install -d -o "$service_user" -g "$service_user" -m 2775 "$movie_storage_path"
sudo install -d /var/lib/kinochy
sudo ln -sfn "$movie_storage_path" /var/lib/kinochy/movies
sudo ln -sfn "$release" "$deploy_path/current.new"
sudo mv -Tf "$deploy_path/current.new" "$deploy_path/current"

sudo tee /etc/systemd/system/kinochy-api.service >/dev/null <<UNIT
[Unit]
Description=Kinochy ASP.NET API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$service_user
WorkingDirectory=$deploy_path/current/api
EnvironmentFile=$deploy_path/.env
EnvironmentFile=/etc/kinochy-api.env
Environment=ASPNETCORE_URLS=http://127.0.0.1:$api_port
Environment=ASPNETCORE_ENVIRONMENT=Production
ExecStart=$(command -v dotnet) $deploy_path/current/api/Kinochy.Api.dll
Restart=always
RestartSec=2
KillSignal=SIGINT
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT

cat >"/tmp/$site_name.nginx.conf" <<NGINX
server {
    listen 80;
    server_name $server_name;
    root $deploy_path/current/admin;
    index index.html;
    client_max_body_size 0;
    sendfile on;
    location /api/ {
        proxy_pass http://127.0.0.1:$api_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_request_buffering off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
    location /media/ {
        proxy_pass http://127.0.0.1:$api_port;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering on;
        proxy_max_temp_file_size 0;
        proxy_read_timeout 3600s;
        send_timeout 3600s;
    }
    location ^~ /_protected_media/ {
        internal;
        alias /var/lib/kinochy/movies/;
        sendfile on;
        tcp_nopush on;
        open_file_cache max=10000 inactive=60s;
        open_file_cache_valid 120s;
        open_file_cache_min_uses 2;
    }
    location /assets/ {
        try_files \$uri =404;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
    location / {
        try_files \$uri \$uri/ /index.html;
        add_header Cache-Control "no-store, no-cache, must-revalidate" always;
    }
}
NGINX
sudo install -m 0644 "/tmp/$site_name.nginx.conf" "/etc/nginx/sites-available/$site_name"
sudo ln -sfn "/etc/nginx/sites-available/$site_name" "/etc/nginx/sites-enabled/$site_name"
sudo nginx -t
sudo systemctl daemon-reload
sudo systemctl enable kinochy-api.service
sudo systemctl restart kinochy-api.service
sudo systemctl reload nginx
healthy=0
for attempt in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$api_port/api/health" >/dev/null; then healthy=1; break; fi
    sleep 1
done
test "$healthy" -eq 1 || { sudo systemctl --no-pager --full status kinochy-api.service; exit 1; }
echo "API health check passed"
REMOTE_EOF
)

"${SSH[@]}" "$REMOTE" "bash -s -- $REMOTE_RELEASE_Q $(shell_quote "$DEPLOY_PATH") $(shell_quote "$DEPLOY_USER") $(shell_quote "$DEPLOY_NGINX_SITE_NAME") $(shell_quote "$DEPLOY_SERVER_NAME") $(shell_quote "$DEPLOY_API_PORT") $(shell_quote "$POSTGRES_DB") $(shell_quote "$POSTGRES_USER") $(shell_quote "$POSTGRES_PASSWORD")" <<<"$REMOTE_SCRIPT"

log "Deployment complete (native API service behind host Nginx)"
