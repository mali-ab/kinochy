# Kinochy

Kinochy is a movie-based English learning platform with streaming playback, interactive subtitles, word translation, vocabulary saving, user authentication, and an admin panel for managing movies and subtitle files.

## Stack

- Frontend: Next.js + TypeScript
- Styling: Tailwind CSS
- Backend: ASP.NET Core 8 Web API
- Database: PostgreSQL
- Video playback: HLS.js on the client, with direct video streaming from ASP.NET Core
- Email verification: Brevo API/SMTP, Gmail SMTP, or generic SMTP

## Features

- Movie, series, animation, favorites, and vocabulary pages
- Interactive English and Russian subtitles
- Real-time subtitle overlay plus paused subtitle script
- Word lookup with translation and pronunciation
- User signup, login, password reset, and language preferences
- Admin module for movie upload, editing, deletion, and user management

## Project Structure

- `frontend/app/`: Next.js App Router, metadata, and global Tailwind styles
- `frontend/src/`: typed API utilities and feature components
- `frontend/public/`: static assets such as icons and logos
- `backend/Controllers/`: HTTP API and media endpoints grouped by responsibility
- `backend/Services/`: authentication, movies, users, translation, and media logic
- `backend/Data/`: PostgreSQL access and initialization
- `backend/Models/`: API contracts and domain records
- `backend/Infrastructure/`: shared API middleware
- `backend/database/`: PostgreSQL schema and seed data
- `backend/storage/`: uploaded files and runtime data
- `docker-compose.yml`: production-style Docker deployment
- `Dockerfile`: application image build

## Installation Without Docker

These commands use a Unix-style shell (Linux or macOS). Install the .NET 8 SDK, Node.js 22 (including npm), and PostgreSQL 16 or newer. Start the PostgreSQL service and create a database user and database:

```bash
psql -U postgres -c "CREATE USER kinochy WITH PASSWORD 'change-me';"
psql -U postgres -c "CREATE DATABASE kinochy OWNER kinochy;"
```

If PostgreSQL uses local peer authentication (common on Debian/Ubuntu), run `sudo -u postgres psql` instead of `psql -U postgres`. If your installation uses a different administrator account, run the commands as that account. Replace `change-me` with your own password; URL-encode special characters when putting the password in `DATABASE_URL`. The backend applies `backend/database/schema.sql` when it starts.

Install frontend dependencies and restore the backend packages from the repository root:

```bash
npm install
dotnet restore backend/Kinochy.Api.csproj
```

Start the API in terminal 1:

```bash
cd backend
ASPNETCORE_URLS=http://localhost:4000 \
DATABASE_URL=postgresql://kinochy:change-me@localhost:5432/kinochy \
CLIENT_ORIGIN=http://localhost:5173 \
JWT_SECRET=replace-with-a-long-random-secret \
ADMIN_EMAIL=admin@kinochy.local \
ADMIN_PASSWORD=replace-with-a-strong-admin-password \
dotnet run --no-launch-profile
```

Start Next.js from the repository root in terminal 2:

```bash
npm run dev:client
```

Open `http://localhost:5173`. Check the API at `http://localhost:4000/api/health`. The frontend uses `http://localhost:4000` for API requests in development; if you use another API address, set `NEXT_PUBLIC_API_URL` before starting Next.js.

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

3. Edit `.env` and set at least these values:

- `CLIENT_ORIGIN=http://YOUR_DOMAIN_OR_IP:4000`
- `JWT_SECRET=your-long-random-secret`
- `POSTGRES_DB=kinochy`
- `POSTGRES_USER=kinochy`
- `POSTGRES_PASSWORD=strong-db-password`
- `ADMIN_EMAIL=admin@your-domain.com`
- `ADMIN_PASSWORD=strong-admin-password`
- `DEFAULT_USER_NAME=Example User`
- `DEFAULT_USER_EMAIL=user@your-domain.com`
- `DEFAULT_USER_PASSWORD=strong-user-password`
- `BREVO_API_KEY=your-brevo-api-key`
- `BREVO_API_URL=https://api.brevo.com/v3/smtp/email`
- `BREVO_IP_FAMILY=4`
- `BREVO_SENDER_NAME=Allberdov Allberd`
- `BREVO_SENDER_EMAIL=allberdovallberd@gmail.com`

4. Build and start:

```bash
docker compose up -d --build
```

At API startup, Docker Compose seeds an admin account for `/admin` and a verified regular user for the main sign-in page. Their credentials come from `ADMIN_EMAIL`/`ADMIN_PASSWORD` and `DEFAULT_USER_EMAIL`/`DEFAULT_USER_PASSWORD` in `.env`. Set these before the first deployment; the example passwords are public and should not be used on a real server.

With `SEED_SYNC_PASSWORDS=true` (the Docker Compose default), each startup updates the passwords of existing accounts with those seed email addresses to match `.env`. This also repairs seed accounts left in an existing database volume with older passwords. Set `SEED_SYNC_PASSWORDS=false` to preserve existing passwords, or `SEED_ACCOUNTS=false` to disable account seeding entirely.

5. Check status:

```bash
docker compose ps
docker compose logs -f app
```

6. Open:

- `http://YOUR_DOMAIN_OR_IP:4000`

## Persistent Data

Docker volumes keep production data between restarts:

- `postgres_data`: PostgreSQL database files
- `app_storage`: uploaded videos, covers, subtitles, and runtime storage

Uploaded movie assets are stored inside the app volume under `/app/storage/uploads`.

## Environment Variables

Docker Compose reads `.env` from the project root. For a run without Docker, set the variables in the process environment.

Important variables:

- `ASPNETCORE_URLS`: API listen address when running without Docker, for example `http://localhost:4000`
- `APP_PORT`: host port exposed by Docker Compose
- `APP_BASE_PATH`: public mount path for subpath deployments, for example `/kinochy`
- `CLIENT_ORIGIN`: allowed browser origin for CORS
- `JWT_SECRET`: JWT signing secret
- `UPLOAD_MAX_BYTES`: maximum size for each uploaded file, default `8589934592` bytes
- Uploaded videos are streamed directly. The ASP.NET backend currently does not transcode uploads or generate HLS segments.
- `DATABASE_URL`: required PostgreSQL connection string for database-backed API routes
- `NEXT_PUBLIC_API_URL`: optional frontend API address; defaults to `http://localhost:4000` in development
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: PostgreSQL container settings
- `NODE_IMAGE`, `POSTGRES_IMAGE`: container image overrides if needed
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: seeded admin sign-in at `/admin`
- `DEFAULT_USER_NAME`, `DEFAULT_USER_EMAIL`, `DEFAULT_USER_PASSWORD`: seeded verified user for the main sign-in page
- `SEED_ACCOUNTS`, `SEED_SYNC_PASSWORDS`: control startup account seeding and whether configured passwords replace existing seed-account passwords
- `TRANSLATE_PROVIDER`, `LIBRETRANSLATE_URL`, `LIBRETRANSLATE_API_KEY`: translation service config
- `EMAIL_PROVIDER`: `brevo`, `gmail`, or `smtp`
- `BREVO_API_KEY` or `BREVO_SMTP_KEY`: Brevo verification email provider config
- `BREVO_API_URL`, `BREVO_API_URLS`, `BREVO_TIMEOUT_MS`, `BREVO_IP_FAMILY`: Brevo API endpoint fallback list, timeout, and IP family. Keep `BREVO_IP_FAMILY=4` on servers where IPv6 or Cloudflare routes time out.
- `BREVO_SMTP_KEY`, `BREVO_SMTP_PASSWORD`, or `SMTP_PASSWORD`: Brevo SMTP key aliases used when API delivery times out or SMTP is preferred
- `GMAIL_SMTP_USER`, `GMAIL_APP_PASSWORD`: Google/Gmail SMTP verification email config. Use a Google app password, not the normal account password.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`: generic SMTP verification email config

## Production Notes

- `.env` is intentionally ignored by git and should not be committed.
- Use a reverse proxy such as Nginx if you want HTTPS and a domain.
- Set `COOKIE_SECURE=true` when serving behind HTTPS.
- Set `TRUST_PROXY=true` when running behind Nginx, Caddy, Traefik, or another proxy.
- Run backups for both Docker volumes if the server will host real user data.

## Useful Commands

```bash
npm run build
dotnet build backend/Kinochy.Api.csproj
dotnet run --project backend/Kinochy.Api.csproj
dotnet tool restore
npm run format
npm run format:check
docker compose down
docker compose up -d --build
docker compose logs -f app
docker compose logs -f postgres
```

Prettier formats frontend and repository text files using `.prettierrc.json`. CSharpier formats C# and project files using `backend/.csharpierrc.json`; its version is pinned in `.config/dotnet-tools.json`. Run `npm install` and `dotnet tool restore` before using the format commands.

In VS Code, install the recommended extensions when prompted after opening this repository. The workspace selects Prettier for frontend files and CSharpier for C# and project XML files, so **Format Document** works after installing the extensions and restoring the .NET tool.

## Troubleshooting

- If signup email fails, verify that Brevo transactional sending is enabled and the sender is approved. If the error says Brevo is unreachable, test outbound HTTPS from the server and keep `BREVO_IP_FAMILY=4`.
- If Docker cannot pull images, try again or override `NODE_IMAGE` and `POSTGRES_IMAGE` in `.env` with registry mirrors reachable from your server.
- If the browser gets CORS errors, make sure `CLIENT_ORIGIN` exactly matches the URL you open in the browser.
- If large uploads reset near completion, check the reverse proxy body-size and timeout limits; ASP.NET request-body limits are disabled for the upload API.
- If media playback buffers, verify the uploaded file exists in `app_storage` and inspect `docker compose logs -f app`.
- If media uploads work but playback fails, check `docker compose logs -f app` and verify uploaded files exist in `app_storage`.
