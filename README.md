# ANKITFLIX ? one portfolio, five projects

One Node.js server serves the portfolio and all five full-stack apps on one domain
and port. The portfolio is a single-page application: project cards zoom into
live project views without reloading the document. A persistent toolbar returns
to the portfolio, and browser Back/Forward navigation works between views.

| Page | Path |
| --- | --- |
| Portfolio | `/` |
| ConnectHub | `/connecthub/` |
| Movieshub | `/movieshub/` |
| ShopSphere | `/shopsphere/` |
| SprintBoard | `/sprintboard/` |
| Gameshub | `/gameshub/` |

Gameshub adds a curated game library, release histories, character profiles,
spoiler-free/deep-dive reading modes, and separate persistent discussion boards.
See [Gameshub's content and storage guide](Gameshub/README.md) to expand its library.

## First setup

Use **Node.js 24 LTS** and MongoDB (local or Atlas). From `G:\Portfolio`:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Put the generated value in `JWT_SECRET` in `.env`. Set `MONGODB_URI` and
`TMDB_API_KEY`. Locally use `PUBLIC_ORIGIN=http://localhost:3000`.
The server can reuse credentials from an existing `Movieshub/server/.env`;
root `.env` and hosting environment variables take priority.

You can build Movieshub explicitly after setup or source changes:

```powershell
npm run build
```

## Start everything

```powershell
npm run dev
```

Open **http://localhost:3000/**. No separate app terminals or ports are needed.
The development command watches project source files and restarts the combined
server when they change. Each restart rebuilds the Movieshub frontend, including
JSX, JavaScript, CSS, HTML, images, public assets, and build configuration. Refresh
the browser after a restart. Generated files, databases, and dependencies are
ignored. Changed dependencies still require `npm install`.

Use `npm start` when you want to run the server without automatic restarts.

Backend files and the portfolio, ConnectHub, ShopSphere SprintBoard and Gameshub files
are loaded directly, so restarting and refreshing picks up their saved changes.
Existing database records remain intact; changing a seed file does not replace
data already stored in a database.

Movieshub's `netflix.css` loads after `App.css` and overrides shared styles.
Edit `netflix.css` for the final Netflix theme, or remove the conflicting rule
there when changing the same selector in `App.css`.

With `NODE_ENV=production`, startup uses the deployment build. Run `npm run build`
during deployment before removing build dependencies, then redeploy source changes.
Press Ctrl+C to stop everything. Open through the server, rather than by
opening the HTML file directly. `npm test` checks the combined routes and app
integration using disposable data; Movieshub database workflows need local MongoDB.

## Check on your phone or another device

1. Connect your computer and phone to the same Wi-Fi/LAN.
2. Run `npm start` on your computer and keep it running.
3. Open the **On your Wi-Fi / LAN** URL printed in the terminal on your phone.
   For example, `http://192.168.1.26:3000/`. Use the address printed on your
   computer, since it can change when reconnecting to your network.

The server listens on `0.0.0.0`; local startup automatically accepts this
computer's network addresses for app sessions and API requests. `localhost`
still works on your computer. On your phone, `localhost` refers to the phone,
so use the computer's network address instead.

If Windows Firewall prompts you, allow Node.js on **Private networks**. If the
page cannot connect, check that your Wi-Fi does not isolate devices and that
TCP port 3000 (or your configured `PORT`) is allowed on the private network.
Production keeps its configured HTTPS origin checks.

## Deploy on Render

Deploy the **entire Portfolio repository** as one Render Web Service using the
root `render.yaml` Blueprint, or configure a Web Service to use the included
`Dockerfile`. Static-only hosting such as GitHub Pages cannot run these
backends. In Render, choose **New + → Blueprint**, connect this repository, and
provide `MONGODB_URI` when prompted. The Blueprint generates `JWT_SECRET`, uses
Render's HTTPS service URL automatically, and checks `/healthz`.

For a manually configured Docker Web Service, use the repository root and set
`NODE_ENV=production`, `MONGODB_URI`, and a random `JWT_SECRET` of at least 32
characters. `PUBLIC_ORIGIN` is optional on Render because the server reads
`RENDER_EXTERNAL_URL`; set `PUBLIC_ORIGIN` only when using a custom domain. Add
`TMDB_API_KEY` for live Movieshub catalogues and `RAWG_API_KEY` / IGDB credentials
for Gameshub provider features.

The service listens on Render's injected `PORT` and `0.0.0.0`. Render Free
services have temporary filesystems and no persistent disk, so local SQLite
databases and uploaded files can reset after restarts or sleep. Attach a
persistent disk mounted at `/data` on a plan that supports disks if you need
those files to survive.

Set these hosting environment variables for other providers as needed:

```text
NODE_ENV=production
PUBLIC_ORIGIN=https://your-domain.example
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<random value of at least 32 characters>
TMDB_API_KEY=<your TMDB API key>
# Only when the host provides persistent storage mounted at /data:
PORTFOLIO_DATA_DIR=/data
```

For hosts other than Render, set `PUBLIC_ORIGIN` to the real HTTPS origin
without a trailing slash. The five project links use that domain automatically.
The host must support WebSockets for ConnectHub chat.

For Docker, build with `docker build -t ankitflix .`. Run the image with the same
environment variables, a persistent volume mounted at `/data`, and port 3000
published. Terminate HTTPS at your hosting proxy.

The disk stores separate SQLite databases and uploads for ConnectHub, ShopSphere,
SprintBoard and Gameshub. Movieshub uses MongoDB. Without `PORTFOLIO_DATA_DIR`, local startup
retains the existing project database and upload locations. Back up data before
moving it to a hosting volume. Use a single service instance with the SQLite disk.

Optional Google OAuth callback:
`https://your-domain.example/movieshub/api/auth/google/callback`.
Set `GOOGLE_REDIRECT_URI` to override it. Configure Google credentials and Resend
email credentials as described in each app's README if using those features.
ShopSphere's password-reset links automatically include `/shopsphere`.

## Implementation

The root server mounts the five backends and attaches ConnectHub Socket.IO to
one HTTP server. Browser document requests under each project path return the
SPA shell, including deep-link refreshes. API and asset requests still reach
the project backends. Each app keeps its own accounts.

`portfolio-app.js` loads project modules on demand and renders them in Shadow DOM
containers to isolate their styles and DOM queries. ConnectHub, ShopSphere and
SprintBoard retain their views while switching projects; inactive ConnectHub
chat sockets disconnect and reconnect on return. Movieshub exposes a React mount
entry built by Vite and releases its React tree when leaving. The screenshot zoom
reveals the live view, with shorter fades on return and no animation when reduced
motion is enabled. External OAuth and email links may still navigate normally.

Only the portfolio HTML and portrait are public at the root. Source files,
environment files, databases, and dependencies are not served. The projects
retain standalone start commands. Review each project's README for its existing
demo limitations before accepting real users or data.

<<<<<<< HEAD
One Node.js server serves the portfolio and all five full-stack apps on one domain
and port. The portfolio is a single-page application: project cards zoom into
live project views without reloading the document. A persistent toolbar returns
to the portfolio, and browser Back/Forward navigation works between views.

| Page | Path |
| --- | --- |
| Portfolio | `/` |
| ConnectHub | `/connecthub/` |
| Movieshub | `/movieshub/` |
| ShopSphere | `/shopsphere/` |
| SprintBoard | `/sprintboard/` |
| Gameshub | `/gameshub/` |

Gameshub adds a curated game library, release histories, character profiles,
spoiler-free/deep-dive reading modes, and separate persistent discussion boards.
See [Gameshub's content and storage guide](Gameshub/README.md) to expand its library.

## First setup

Use **Node.js 24 LTS** and MongoDB (local or Atlas). From `G:\Portfolio`:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Put the generated value in `JWT_SECRET` in `.env`. Set `MONGODB_URI` and
`TMDB_API_KEY`. Locally use `PUBLIC_ORIGIN=http://localhost:3000`.
The server can reuse credentials from an existing `Movieshub/server/.env`;
root `.env` and hosting environment variables take priority.

You can build Movieshub explicitly after setup or source changes:

```powershell
npm run build
```

## Start everything

```powershell
npm run dev
```

Open **http://localhost:3000/**. No separate app terminals or ports are needed.
The development command watches project source files and restarts the combined
server when they change. Each restart rebuilds the Movieshub frontend, including
JSX, JavaScript, CSS, HTML, images, public assets, and build configuration. Refresh
the browser after a restart. Generated files, databases, and dependencies are
ignored. Changed dependencies still require `npm install`.

Use `npm start` when you want to run the server without automatic restarts.

Backend files and the portfolio, ConnectHub, ShopSphere SprintBoard and Gameshub files
are loaded directly, so restarting and refreshing picks up their saved changes.
Existing database records remain intact; changing a seed file does not replace
data already stored in a database.

Movieshub's `netflix.css` loads after `App.css` and overrides shared styles.
Edit `netflix.css` for the final Netflix theme, or remove the conflicting rule
there when changing the same selector in `App.css`.

With `NODE_ENV=production`, startup uses the deployment build. Run `npm run build`
during deployment before removing build dependencies, then redeploy source changes.
Press Ctrl+C to stop everything. Open through the server, rather than by
opening the HTML file directly. `npm test` checks the combined routes and app
integration using disposable data; Movieshub database workflows need local MongoDB.

## Check on your phone or another device

1. Connect your computer and phone to the same Wi-Fi/LAN.
2. Run `npm start` on your computer and keep it running.
3. Open the **On your Wi-Fi / LAN** URL printed in the terminal on your phone.
   For example, `http://192.168.1.26:3000/`. Use the address printed on your
   computer, since it can change when reconnecting to your network.

The server listens on `0.0.0.0`; local startup automatically accepts this
computer's network addresses for app sessions and API requests. `localhost`
still works on your computer. On your phone, `localhost` refers to the phone,
so use the computer's network address instead.

If Windows Firewall prompts you, allow Node.js on **Private networks**. If the
page cannot connect, check that your Wi-Fi does not isolate devices and that
TCP port 3000 (or your configured `PORT`) is allowed on the private network.
Production keeps its configured HTTPS origin checks.

## Deploy on Render

Deploy the **entire Portfolio repository** as one Render Web Service using the
root `render.yaml` Blueprint, or configure a Web Service to use the included
`Dockerfile`. Static-only hosting such as GitHub Pages cannot run these
backends. In Render, choose **New + → Blueprint**, connect this repository, and
provide `MONGODB_URI` when prompted. The Blueprint generates `JWT_SECRET`, uses
Render's HTTPS service URL automatically, and checks `/healthz`.

For an existing Render service, open **Dashboard → your service → Environment**
and add or update the key `MONGODB_URI` with the Atlas connection string. Use the
Atlas **Connect → Drivers** URI, replace `<db_password>` with the database user's
password, and set the database name to `movieshub` (for example,
`mongodb+srv://USER:PASSWORD@cluster.example.mongodb.net/movieshub`). Save the
environment change and redeploy/restart the service. Do not commit the Atlas URI
to the repository or put it in `render.yaml`.

In MongoDB Atlas, create a **database user** (this is separate from your Atlas
website login) and allow Render to reach the cluster under **Security → Network
Access**. In Render, open the service's **Connect → Outbound** details and add
the listed IP ranges to the Atlas IP access list. Render's outbound ranges are
region-specific and can change; avoid `0.0.0.0/0` where possible because it
allows attempts from any public IP. Keep the database user's password
URL-encoded in the URI if it contains characters such as `@`, `:`, `/`, `?`, or
`#`.

For a manually configured Docker Web Service, use the repository root and set
`NODE_ENV=production`, `MONGODB_URI`, and a random `JWT_SECRET` of at least 32
characters. `PUBLIC_ORIGIN` is optional on Render because the server reads
`RENDER_EXTERNAL_URL`; set `PUBLIC_ORIGIN` only when using a custom domain. Add
`TMDB_API_KEY` for live Movieshub catalogues and `RAWG_API_KEY` / IGDB credentials
for Gameshub provider features.

The service listens on Render's injected `PORT` and `0.0.0.0`. Render Free
services have temporary filesystems and no persistent disk, so local SQLite
databases and uploaded files can reset after restarts or sleep. Attach a
persistent disk mounted at `/data` on a plan that supports disks if you need
those files to survive.

Set these hosting environment variables for other providers as needed:

```text
NODE_ENV=production
PUBLIC_ORIGIN=https://your-domain.example
MONGODB_URI=<your MongoDB Atlas connection string>
JWT_SECRET=<random value of at least 32 characters>
TMDB_API_KEY=<your TMDB API key>
# Only when the host provides persistent storage mounted at /data:
PORTFOLIO_DATA_DIR=/data
```

For hosts other than Render, set `PUBLIC_ORIGIN` to the real HTTPS origin
without a trailing slash. The five project links use that domain automatically.
The host must support WebSockets for ConnectHub chat.

For Docker, build with `docker build -t ankitflix .`. Run the image with the same
environment variables, a persistent volume mounted at `/data`, and port 3000
published. Terminate HTTPS at your hosting proxy.

The disk stores separate SQLite databases and uploads for ConnectHub, ShopSphere,
SprintBoard and Gameshub. Movieshub uses MongoDB. Without `PORTFOLIO_DATA_DIR`, local startup
retains the existing project database and upload locations. Back up data before
moving it to a hosting volume. Use a single service instance with the SQLite disk.

Optional Google OAuth callback:
`https://your-domain.example/movieshub/api/auth/google/callback`.
Set `GOOGLE_REDIRECT_URI` to override it. Configure Google credentials and Resend
email credentials as described in each app's README if using those features.
ShopSphere's password-reset links automatically include `/shopsphere`.

## Implementation

The root server mounts the five backends and attaches ConnectHub Socket.IO to
one HTTP server. Browser document requests under each project path return the
SPA shell, including deep-link refreshes. API and asset requests still reach
the project backends. Each app keeps its own accounts.

`portfolio-app.js` loads project modules on demand and renders them in Shadow DOM
containers to isolate their styles and DOM queries. ConnectHub, ShopSphere and
SprintBoard retain their views while switching projects; inactive ConnectHub
chat sockets disconnect and reconnect on return. Movieshub exposes a React mount
entry built by Vite and releases its React tree when leaving. The screenshot zoom
reveals the live view, with shorter fades on return and no animation when reduced
motion is enabled. External OAuth and email links may still navigate normally.

Only the portfolio HTML and portrait are public at the root. Source files,
environment files, databases, and dependencies are not served. The projects
retain standalone start commands. Review each project's README for its existing
demo limitations before accepting real users or data.

Gameshub supports IGDB metadata and covers. Add server-only `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` to `.env`, then restart. See [Gameshub setup](Gameshub/README.md#igdb-integration) for matching IDs, spoiler handling, and API endpoints.
=======
Gameshub supports IGDB metadata and covers. Add server-only `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` to `.env`, then restart. See [Gameshub setup](Gameshub/README.md#igdb-integration) for matching IDs, spoiler handling, and API endpoints.
>>>>>>> b19d639fa83cc137745cde98d65237c9121a04cb
