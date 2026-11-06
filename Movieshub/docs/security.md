# Security audit and release notes

## Implemented

- Removed embedded TMDB credentials from browser components and the catalogue enrichment script. Browser metadata requests now use an allowlisted server proxy; only `server/.env` needs `TMDB_API_KEY`.
- Browser authentication uses HttpOnly cookies, Secure in production, SameSite=Lax, exact-origin mutation checks and JSON-only mutation bodies. Browser token responses/storage have been removed. Old local-storage tokens are discarded; existing browser users must sign in again once. Bearer authentication remains for API clients and legacy session compatibility.
- Device sessions store token digests, require a live unrevoked session and check password reset version. Logout revokes the session; password changes/reset invalidate earlier sessions. Password changes set a replacement cookie.
- Registration/login validate primitive types, lengths and dates before database access. Duplicate account races return 409. Reviews validate numeric ratings and text lengths. Invalid JSON/body size errors have consistent JSON responses.
- Account/profile queries derive the user from authentication. Watchlists, history, exports, sessions and review writes have two-account isolation coverage. Locked-profile edits/deletion require unlock; PIN reset still requires account password.
- Security headers, bounded rate limits, structured logs without query strings/tokens/bodies, health checks, configuration validation and graceful shutdown were added.
- Root ignore rules, Docker context exclusions and the source ZIP generator exclude environment secrets, dependencies, builds, logs, private-key files and Git metadata. The local `.env` is preserved for development.

## Credentials and history: outstanding external work

This supplied project copy contains no `.git` directory, and Git is not installed on the command path. Therefore earlier commit history and remote exposure could not be audited here. Removing source literals does **not** revoke the previous key. The formerly embedded TMDB key must be rotated by the account owner, and any real previously shared JWT/OAuth/email/database credentials must also be rotated at their providers. No provider rotation has been performed or claimed.

Once the original repository is available, run a history-aware secret scanner such as Gitleaks against every branch/tag, review findings without pasting secret values, rotate exposed credentials first, then coordinate history cleanup with collaborators. Force-pushing rewritten history requires separate review. Rotate JWT_SECRET to invalidate all existing signed tokens when exposure is confirmed. Do not publish the original project ZIP or local `.env`.

## Remaining operational scope

- Use one HTTPS origin in production. The default cookie setup intentionally does not support unrelated cross-site frontend/API domains.
- Limits and metadata cache are in memory; a multi-instance deployment needs a shared limiter/cache.
- Report intake persists a pending queue. Operator moderation UI, moderator roles, automated content filtering and appeals are not implemented. An operator with authorized database access can inspect pending reports; do not expose MongoDB publicly.
- Configure email delivery before enabling production password recovery. Google sign-in needs real client credentials and exact redirect configuration.
- Account deletion spans multiple collections; it is not a multi-document transaction on standalone MongoDB. Replica-set transactions and retry handling are a future reliability improvement.
- Automated integration tests use only randomly named disposable `movieshub_test_*` databases on localhost and remove those databases. They do not read the development `.env` or delete application data.
