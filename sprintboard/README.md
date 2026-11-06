# SprintBoard — Team Project Management SaaS

A functional, zero-dependency full-stack project management application with a responsive Kanban UI, authentication, multi-user project memberships, role-based permissions, task management, comments, deadlines, and activity logs.

## Requirements
- Node.js 22.13+ (uses built-in `node:sqlite`)

## Run locally
```bash
cd sprintboard
node server.js
```
Open **http://localhost:3000** and register an account.

## Collaboration demo
1. Register user A and create a project.
2. Open a separate private/incognito browser window and register user B.
3. As A, open the project → Members and add B's email as Editor or Viewer.
4. As B, refresh the dashboard. Both accounts now see the shared project.

## Features
- Passwords hashed with scrypt and random salts; HttpOnly SameSite session cookies
- Persistent SQLite database automatically created on startup
- Create/edit/delete projects, team memberships and roles
- Four-column Kanban task board; task priority, assignee and due date
- Search/filter, task comments, activity feed, assigned-to-me dashboard
- Owner, Editor and Viewer permissions enforced on server
- HTML escaping on user-generated content

## Notes
- Uses the built-in Node.js HTTP server and SQLite to avoid third-party dependencies.
- The project is a working portfolio-ready MVP, not a production-hardened SaaS. Before deploying publicly, add HTTPS, CSRF protection, rate limiting, email invitations, password resets, automated tests, monitoring, backups and deployment-specific security hardening.
- Members must sign up before an owner can add them. There is no email delivery or real-time push; refresh to see changes from teammates.
- Set `COOKIE_SECURE=true` when serving via HTTPS behind a trusted reverse proxy.
- Database file `sprintboard.sqlite` is created next to `server.js`; do not commit production databases to source control.

## Deployment-ready upgrade (v1.1)
- Configurable persistent database path with `DB_PATH`; health endpoint `/healthz`.
- Basic security headers, request Origin checking on writes, and in-memory auth rate limiting.
- Render blueprint `render.yaml` uses a persistent disk and Node runtime. Use a **paid persistent-disk plan**, not an ephemeral free instance.
- `package.json` adds `npm start`, `npm run check` and `npm run demo:seed`.
- `PORTFOLIO.md` contains the recruiter-facing case study and card markup.

### Deploy on Render
1. Push this folder to a **private or public GitHub repository**, excluding `.env` and SQLite files.
2. In Render, create a Blueprint from `render.yaml`, review the paid plan and persistent disk.
3. Set `PUBLIC_ORIGIN` to the exact HTTPS site origin, e.g. `https://sprintboard-xyz.onrender.com` (no trailing slash). The service URL is assigned during setup.
4. Deploy and verify `/healthz`, account registration, login, project/task CRUD and team roles.
5. Enable backups for the disk/database and configure uptime/error monitoring before sharing publicly.

### Recruiter demo
For a **separate local demo database**, first initialize the schema by starting and stopping the server with `DB_PATH=./demo.sqlite`, then run:
```bash
DB_PATH=./demo.sqlite DEMO_PASSWORD='a-unique-long-random-password' npm run demo:seed
```
Do not run the seeder on production data. For public demos, provision a disposable isolated instance with a dedicated demo account, limit access to personal data, and reset its sample database periodically. A shared demo account is not a substitute for proper isolation.

### Security and scale caveats
Origin checking is a baseline CSRF defense, not a complete audited CSRF solution. Set `COOKIE_SECURE=true` **only behind HTTPS**, and `PUBLIC_ORIGIN` to the correct HTTPS origin. In-memory throttling is per process and not sufficient for multi-instance or high-traffic deployments. Add distributed rate limits, password resets, email verification, backup/restore drills, integration tests, logging/alerting, and a security review before handling real customer data. This demo is not a production-certified SaaS.
