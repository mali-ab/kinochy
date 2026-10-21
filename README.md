# Dilewar

Dilewar is a movie-based English learning platform with streaming playback, interactive subtitles, word translation, vocabulary saving, user authentication, and an admin panel for managing movies and subtitle files.

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
- Movie pages show related titles and signed-in user comments. Series pages also show seasons; admins create playable episodes as movie entries, then link them under **Admin → Series movie → Seasons & episodes**.

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
- `Dockerfile`: application image build

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

Running only the backend provides the JSON API and media endpoints; it does not provide the Dilewar website UI. Uploaded files are kept in `backend/storage/uploads`.

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

The admin SPA runs on `http://localhost:5174/admin` and proxies `/api` and `/media` to `VITE_API_ORIGIN` (default `http://localhost:4000`). In the public site set `NEXT_PUBLIC_ADMIN_URL=http://localhost:5174/admin` (see `frontend/.env.example`) so the Admin nav link points at the dev server.

Open `http://localhost:5173`. Check the API at `http://localhost:4000/api/health`. The Next.js server proxies `/api` and `/media` to `API_ORIGIN` (default `http://localhost:4000`) so browser requests stay same-origin; set `API_ORIGIN` before starting Next.js when the API runs at another address.

For local runs, set the backend variables in the process environment as shown above. `.env` is read by Docker Compose, but the ASP.NET app does not load that file on its own. Uploaded files are kept in `backend/storage/uploads`.

## Docker Deployment

The repo is prepared so the app can build from a clean clone on a server.

1. Clone the repository on the server:

```bash
git clone https://github.com/allberdovallberd/kinochy.git
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

- `http://YOUR_DOMAIN_OR_IP:4000` — public site
- `http://YOUR_DOMAIN_OR_IP:4000/admin` — admin panel

Compose runs three application containers: `edge` (nginx, public on port 4000), `frontend` (Next.js site, internal on 5173) and `app` (ASP.NET Core API, internal on 4000). The edge serves the admin SPA under `/admin`, proxies `/api` and `/media` to the API container, and everything else to the Next.js site, so the browser only talks to port 4000.

## Persistent Data

Docker volumes keep production data between restarts:

- `postgres_data`: PostgreSQL database files
- `app_storage`: uploaded videos, covers, subtitles, and runtime storage

Uploaded movie assets are stored inside the app volume under `/app/storage/uploads`.

Large local HLS bundles can be kept outside the Docker volume in `backend/storage/preloaded/<movie>/`. Add a `movie.json` containing `title` and `playlist`; Compose mounts this directory read-only and startup connects the playlist to the movie with that exact title.

## Environment Variables

Docker Compose reads `.env` from the project root. For a run without Docker, set the variables in the process environment.

Variables kept in `.env`:

- `JWT_SECRET`: JWT signing secret
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: PostgreSQL container settings
- `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`: translation service configuration

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
