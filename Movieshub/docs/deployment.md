# Deployment

The Dockerfile serves the built client and API from one process/origin. `render.yaml` prepares a Render web service; MongoDB Atlas supplies the production database. These files prepare deployment; they do not provision hosting or publish this copy by themselves.

## Before publishing

1. Rotate previously embedded/exposed credentials (see [security audit](security.md)).
2. Publish the source to your intended GitHub repository, excluding local secrets and generated files. This copy has no repository history/remote.
3. Connect GitHub, Render and MongoDB Atlas through authorized accounts. Create/select an Atlas cluster, a least-privileged application database user, and appropriate network access. Do not use test credentials in production.
4. Create the Render service from `render.yaml`. Set `MONGODB_URI`, `TMDB_API_KEY` and `CLIENT_ORIGIN` to the exact HTTPS site origin without a trailing slash. The blueprint generates `JWT_SECRET`. `TRUST_PROXY_HOPS=1` assumes the Render proxy; adjust only for verified infrastructure.
5. Optional: set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` to `https://<site>/api/auth/google/callback`, `RESEND_API_KEY` and `EMAIL_FROM`.
6. Build/deploy and check `/api/health`. Confirm real catalogue metadata, email and OAuth work. The Docker image runs as the unprivileged node user and excludes `.env` files.

Vite has no TMDB key. Leave `VITE_API_URL` blank for the same-origin deployment; configure no secret with a `VITE_` prefix. CORS permits only `CLIENT_ORIGIN`; cookies require credentials on browser requests. Production requires HTTPS and a random JWT secret of at least 32 characters.

## Local checks

```sh
npm ci --prefix client
npm ci --prefix server
npm run lint
npm run build
npm test
npm run test:integration
npm run package
```

Integration tests require MongoDB on `127.0.0.1:27017`. They create random test databases, including two independent accounts, and clean up only those databases. `npm test` skips database integration unless `RUN_MONGO_TESTS=1`; CI explicitly runs the integration command with a MongoDB service.

For local container deployment, set `JWT_SECRET` (and optionally `TMDB_API_KEY`) in your shell and run `docker compose up --build`. Visit `http://localhost:5000`. This compose configuration is for local development: MongoDB has no published host port, persists to a named volume and the app uses development cookies. Production should use authenticated Atlas and HTTPS.

`npm run package` writes `artifacts/movieshub-source.zip`. It excludes all dependencies, dist output, local environment files, logs, private keys and `.git`. It preserves `.env.example` templates. CI uploads only that source archive, not a working directory ZIP. The script refuses common literal credential/private-key patterns; it is not a replacement for a history secret scan.

## Live two-account acceptance check

Use two separate browser contexts so cookies are independent. Register A and B with different real test emails; confirm duplicates fail. In A, save a movie, lock/unlock a profile, write/edit/delete a review and open review history. In B, verify A's lists and history are absent, review ownership controls are unavailable and reports work. Confirm sorting, page totals and averages update after changes. Revoke A's second device session, then verify it cannot access the account. Log out and check authenticated routes reject the revoked cookie. Complete an actual password-reset email and test Google OAuth if enabled.

Local automated checks do not certify the live deployment. Record the live URL, commit SHA and acceptance results after hosting is connected. No live deployment or live two-account verification is claimed by these documents.
