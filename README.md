# Kinoçy

Kinoçy is a movie-based English learning platform with streaming playback, interactive subtitles, word translation, vocabulary saving, user authentication, and an admin panel for managing movies and subtitle files.

## Stack

- Frontend: Next.js App Router (React 19) served by a Node.js runtime
- Admin: standalone Vite + React SPA (react-router), built static and served under `/admin`
- Styling: Tailwind CSS
- Backend: ASP.NET Core 10 Web API
- Database: PostgreSQL
- Video playback: HLS.js on the client, with direct video streaming from ASP.NET Core
- Edge proxy: nginx single origin that serves the admin SPA and proxies the site and API

## Features

- Movie, series, animation, favorites, and vocabulary pages
- Interactive English and Russian subtitles
- Real-time subtitle overlay plus paused subtitle script
- Word lookup with translation and pronunciation
- User signup, login, password reset, and language preferences
- Free accounts can preview the first 10 minutes of every movie; Premium accounts have full playback access. Admins manage plans and optional expiry dates from the user editor.
- Admin module for movie upload, editing, deletion, and user management
- Titles have a category (`Movie` or `Cartoon`) and an independent `isSeries` flag. Either category can be a standalone video with multiple qualities or a series with seasons and episodes. In the admin editor choose the category and format, save the title, then add seasons and episode videos on its details page. Episodes have their own qualities and subtitles and stay out of catalog and recommendation cards.
- Existing `Series` titles migrate automatically to `isSeries: true` on API startup. Their category becomes `Cartoon` when their genre includes Cartoon, otherwise `Movie`; IDs, slugs, seasons, and episode links are preserved. Correct the category in the editor if necessary. API consumers must check `isSeries` instead of `type === 'Series'` to display seasons.

### Catalog and playback API

- `GET /api/catalog?category=Cartoon&isSeries=true&page=1&pageSize=24&search=` returns `{ items, page, pageSize, total, hasNextPage }`. Category and format filters are optional; page size is capped at 100. Cards contain catalog metadata and real subtitle-presence flags, without reading playlists during serialization.
- Swagger UI is available at `/api/swagger/` and the OpenAPI document at `/api/swagger/v1/swagger.json` through the Docker edge on port 4000.
- `GET /api/movies` retains the legacy array response but is bounded to 100 titles by default; `page` and `pageSize` are supported. Clients with larger catalogs should use `/api/catalog`. The admin fetches catalog pages automatically.
- `GET /api/movies/{slug}` returns playback details. Episode records retain `type: "Episode"` for compatibility and add `isEpisode`, the Movie/Cartoon `category`, and an `episode` object containing `seriesId`, `seriesSlug`, `seriesTitle`, `category`, `seasonNumber`, and `episodeNumber`. Requesting seasons for an episode resolves its parent series.
- Optional movie-page personalization does not require a session: guests receive `[]` from `/api/users/favorites/ids`, `{ favorite: false }` from favorite status, and `{ entry: null }` from saved-word checks. Saving favorites or vocabulary still requires login. Missing or invalid sessions use free preview access.
- Upload edits stage new immutable bundles and switch the database reference only after a successful transaction. Existing bundles remain available; retained historical bundles require a separate, reference-aware cleanup policy.
- Free/anonymous HLS previews end normally after the last complete segment within ten minutes. Direct videos and byte-range HLS use a cached FFmpeg-encoded preview, never an estimated percentage of the source bytes. The initial encoding request can take longer; subsequent plays reuse the preview. Premium media remains available through the subscription-checked media routes. Raw uploaded video files are not served by the image endpoint.
- Both backend Dockerfiles install FFmpeg. For a local API run, install `ffmpeg` and make it available on `PATH`.

Run `npm run test:catalog` for migration and relationship checks using an isolated PostgreSQL WASM instance. Run `npm run test:media` with .NET 10 and FFmpeg installed for actual HLS/upload/encoding checks. These tests do not modify the application database.

## Project Structure

- `frontend/app/`: Next.js App Router routes, layouts, metadata, and global Tailwind styles
- `frontend/src/`: typed API utilities, site views, movie player, and UI providers
- `frontend/public/`: static assets such as icons and logos
- `admin/`: standalone admin SPA (Vite + React + react-router) with its own API client, translations, and nginx config
- `backend/Controllers/`: HTTP API and media endpoints grouped by responsibility
- `backend/Services/`: authentication, movies, users, translation, and media logic
- `backend/Data/`: PostgreSQL access and initialization
- `backend/Models/`: API contracts and domain records
- `backend/Infrastructure/`: shared API middleware
- `backend/database/`: PostgreSQL schema and seed data
- `backend/storage/`: uploaded files and runtime data
- `docker-compose.yml`: production-style Docker deployment
- `admin/Dockerfile`: admin SPA image build (Vite build + nginx runtime)
- `backend/Dockerfile`: backend API image build (ASP.NET Core)

## Run Only the Backend Without Docker

The API can run without Docker and without installing Node.js or starting the frontend. Install the .NET 10 SDK and PostgreSQL 16 or newer, then start PostgreSQL:

```bash
sudo systemctl enable --now postgresql
```

Create the local development user and database once:

```bash
psql -U postgres -c "CREATE USER kinochy WITH PASSWORD 'kinochy';"
psql -U postgres -c "CREATE DATABASE kinochy OWNER kinochy;"
```

If PostgreSQL uses local peer authentication (common on Debian/Ubuntu), use these commands instead:

```bash
sudo -u postgres psql -c "CREATE USER kinochy WITH PASSWORD 'kinochy';"
sudo -u postgres psql -c "CREATE DATABASE kinochy OWNER kinochy;"
```

Restore and run the backend from the repository root:

```bash
dotnet restore backend/Kinochy.Api.csproj
dotnet run --project backend/Kinochy.Api.csproj
```

The Development profile listens on `http://0.0.0.0:5000`, connects to the local `kinochy` database, applies `backend/database/schema.sql`, and seeds the default admin and user accounts. Verify it with:

```bash
curl http://localhost:5000/api/health
```

Local defaults live in `backend/appsettings.Development.json` and are used only when `ASPNETCORE_ENVIRONMENT=Development`. To use different credentials without editing that file, override them for one run:

```bash
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE \
JWT_SECRET=your-local-secret \
dotnet run --project backend/Kinochy.Api.csproj
```

Running only the backend provides the JSON API and media endpoints; it does not provide the Kinoçy website UI. Uploaded files are kept in `MOVIE_STORAGE_PATH`, or `backend/storage/uploads` when it is unset.

## Run the Full Application Without Docker

After the backend is running, install Node.js 22 and start Next.js in another terminal:

```bash
npm install
npm run dev:client
```

To work on the admin panel, install its dependencies once and start its own dev server in another terminal:

```bash
npm install --prefix admin
npm run dev:admin
```

The admin SPA runs on `http://localhost:5174/admin` and proxies `/api` and `/media` to `VITE_API_ORIGIN` (default `http://localhost:5000`, the local Development API). To manage movies already uploaded to another server, set `VITE_API_ORIGIN` in `admin/.env` to that server's API origin before starting Vite, then restart the dev server. In the public site set `NEXT_PUBLIC_ADMIN_URL=http://localhost:5174/admin` (see `frontend/.env.example`) so the Admin nav link points at the dev server.

Open `http://localhost:5173`. Check the API at `http://localhost:4000/api/health`. The Next.js server proxies `/api` and `/media` to `API_ORIGIN` (default `http://localhost:4000`) so browser requests stay same-origin; set `API_ORIGIN` before starting Next.js when the API runs at another address.

In Development, the ASP.NET app loads the project-root `.env` file; process environment variables take precedence. `MOVIE_STORAGE_PATH=backend/storage/uploads` stores uploads in the repository's persistent storage directory when starting the backend from the repository root. On deployment, `deploy.sh` anchors that relative path under `DEPLOY_PATH` so releases share the same storage folder.

## Docker Deployment

The repo is prepared so the app can build from a clean clone on a server.

1. Clone the repository on the server:

```bash
git clone https://github.com/mali-ab/kinochy.git
cd kinochy
```

2. Create `.env` on the server:

```bash
cp .env.example .env
```

3. Edit `.env` and set these values:

- `JWT_SECRET=your-long-random-secret`
- `POSTGRES_DB=kinochy`
- `POSTGRES_USER=kinochy`
- `POSTGRES_PASSWORD=strong-db-password`

4. Build and start:

```bash
docker compose up -d --build
```

At API startup, the backend creates or refreshes these built-in accounts:

- Admin: `admin@example.com` / `Salam@123`
- User: `user@example.com` / `Salam@123`

The credentials are defined in `backend/Data/AccountSeeder.cs`, not `.env`. Change those constants before a public deployment and rebuild the app.

5. Check status:

```bash
docker compose ps
docker compose logs -f app
```

6. Open:

- `http://YOUR_DOMAIN_OR_IP:4000` — admin panel
- `http://YOUR_DOMAIN_OR_IP:4000/api/swagger/` — API documentation

Compose runs PostgreSQL, `app` (ASP.NET Core API), and `edge` (nginx, public on port 4000). The edge serves the admin SPA and proxies `/api` and `/media` to the API. The separate Next.js frontend is not included in this Compose stack.

### Deploy the API and admin without Docker

Copy `.deploy.env.example` to `.deploy.env` and set the SSH host, user, authentication, `DEPLOY_SERVER_NAME`, and a strong `POSTGRES_PASSWORD`. Set `DEPLOY_SUDO_PASSWORD` in the ignored `.deploy.env` if the SSH user needs a sudo password; alternatively, configure passwordless sudo for that user. Point the domain at the server and allow inbound ports 80 and 443. Nginx redirects HTTP to HTTPS using the existing ZeroSSL certificate at `/etc/nginx/ssl/zehinli.biz/`; the certificate must cover `DEPLOY_SERVER_NAME`. `DEPLOY_API_PORT` is private and used only between Nginx and the API. Run `./deploy.sh` from your local checkout on a machine with Node.js/npm, the .NET 10 SDK, SSH, and rsync. The script builds the admin SPA and publishes the API locally, then syncs those release artifacts to the server. It installs PostgreSQL on Debian/Ubuntu, creates the configured database and role, switches a `current` symlink, installs/restarts a systemd API service, and configures host Nginx. PostgreSQL and the app both run directly on the server, outside Docker. Set `JWT_SECRET` in the app `.env`; the script anchors `MOVIE_STORAGE_PATH=backend/storage/uploads` at `$DEPLOY_PATH`, copies existing files into that folder, and updates stored movie paths during migration. It builds the API's local `DATABASE_URL` from `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` in `.deploy.env`.

This repository snapshot does not contain the separate Next.js public frontend source. The deployed site root serves the admin SPA; add the frontend build artifact and its Nginx route when that source is available.

## Persistent Data

Docker volumes keep production data between restarts:

- `postgres_data`: PostgreSQL database files
- `app_storage`: generated preview and other runtime storage

Uploaded movie assets are stored at `MOVIE_STORAGE_PATH` (default `backend/storage/uploads`). Compose bind-mounts that host folder at `/movie_storage` inside the app container. Each movie's master playlist path is saved in the database `movies.video_path` column.

After setting `MOVIE_STORAGE_PATH`, migrate assets from the former Docker volume before uploading new movies:

```bash
./scripts/migrate_movie_storage.sh
docker compose up -d --force-recreate app
```

To copy the Docker app's uploaded movie files into `backend/storage/uploads` without changing database paths or deleting the Docker originals, run:

```bash
./scripts/copy_docker_movies_to_storage.sh
```

The copy can be resumed safely. Existing destination files are kept and verified against the Docker source; conflicts stop the script.

The migration can resume into a non-empty destination without overwriting files. It verifies that existing files match, updates existing `movies.video_path` values, and then removes only the old volume's uploaded movie files. Runtime previews and other volume data remain intact.

Large local HLS bundles can be kept outside the Docker volume in `backend/storage/preloaded/<movie>/`. Add a `movie.json` containing `title` and `playlist`; Compose mounts this directory read-only and startup connects the playlist to the movie with that exact title.

## Environment Variables

Docker Compose reads `.env` from the project root. For a run without Docker, set the variables in the process environment.

Variables kept in `.env`:

- `JWT_SECRET`: JWT signing secret
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: PostgreSQL container settings
- `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`: translation service configuration
- `MOVIE_STORAGE_PATH`: writable folder for uploaded movie bundles and covers (default `backend/storage/uploads`)

Docker uses port `4000`, the root path `/`, an 8 GiB upload limit, PostgreSQL 16 Alpine, and Node.js 22 Alpine as project defaults. `DATABASE_URL` is assembled by Docker Compose from the three PostgreSQL values. When running without Docker, supply `ASPNETCORE_URLS`, `DATABASE_URL`, `CLIENT_ORIGIN`, and `JWT_SECRET` directly to the backend process as shown above.

- Uploaded video files are streamed directly. The ASP.NET backend does not transcode uploads or generate HLS segments.
- For an adaptive HLS movie, choose **HLS bundle** and upload a ZIP containing `master.m3u8` plus its rendition folders. ZIP paths and playlist references are validated before extraction. A flat `.m3u8` playlist with separately selected media files is also supported.
- Subtitle uploads accept separate SRT/VTT files or one ZIP bundle. Include `en`/`english` and `ru`/`russian` in filenames, for example `movie.en.srt` and `movie.ru.srt`; archive paths, file count, and extracted size are validated.
- To convert an existing video into this format, see the [local movie tools](scripts/local_movies/README.md).
- `API_ORIGIN`: address the Next.js server proxies `/api` and `/media` requests to; defaults to `http://localhost:5000` outside Docker and is set to `http://app:4000` by Compose

## Production Notes

- `.env` is intentionally ignored by git and should not be committed.
- Use a reverse proxy such as Nginx if you want HTTPS and a domain.
- Run backups for both Docker volumes if the server will host real user data.

## Useful Commands

```bash
npm run build
npm run build:admin
dotnet build backend/Kinochy.Api.csproj
dotnet run --project backend/Kinochy.Api.csproj
dotnet tool restore
npm run format
npm run format:check
docker compose down
docker compose up -d --build
docker compose logs -f app
docker compose logs -f frontend
docker compose logs -f edge
docker compose logs -f postgres
```

Prettier formats frontend and repository text files using `.prettierrc.json`. CSharpier formats C# and project files using `backend/.csharpierrc.json`; its version is pinned in `.config/dotnet-tools.json`. Run `npm install` and `dotnet tool restore` before using the format commands.

In VS Code, install the recommended extensions when prompted after opening this repository. The workspace selects Prettier for frontend files and CSharpier for C# and project XML files, so **Format Document** works after installing the extensions and restoring the .NET tool.

## Troubleshooting

- If Docker cannot pull images, retry after checking that Docker Hub and Microsoft Container Registry are reachable from the server.
- If large uploads reset near completion, check the reverse proxy body-size and timeout limits; ASP.NET request-body limits are disabled for the upload API.
- If media playback buffers, verify the uploaded file exists in `app_storage` and inspect `docker compose logs -f app`.
- If media uploads work but playback fails, check `docker compose logs -f app` and verify uploaded files exist in `app_storage`.
