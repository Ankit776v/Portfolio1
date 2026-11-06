# Validation record

Local validation, 24 October 2026 (Asia/Kolkata), Node.js 26.12.0, local MongoDB:

- `npm run lint`: passed.
- `npm run build`: passed; secondary routes split into lazy chunks. See [measured build footprint](performance.md).
- `npm test`: database-free suite passed; two database integration cases are intentionally skipped by this command unless opted in.
- `npm run test:integration`: all 12 test cases passed, including both database cases, with no skips. The workflow case exercises actual HTTP endpoints with two accounts, duplicate races, invalid types, profile/PIN isolation, review ownership, sorting/pagination/averages, report idempotence, catalogue boundaries, replacement cookies, password reset replay rejection, session revocation and deletion.
- `npm run demo`: isolated headless Chrome verified login, account review history, security settings and title review rendering at desktop and 390px mobile widths. Captures use disposable accounts and explicitly synthetic movie metadata. Database records are removed afterward.
- `npm run package`: produced a source distribution excluding local secrets, dependencies, builds, logs and Git metadata.

Screenshots: [desktop reviews](screenshots/reviews-desktop.png), [review history](screenshots/review-history.png), [account security](screenshots/account-security.png), [signed-in reviews](screenshots/reviews-signed-in.png), [mobile reviews](screenshots/reviews-mobile.png).

The [short demo](demo.webm) is a 10-second WebM slideshow encoded from actual browser captures, not a narrated live-host recording. Regenerate it with `npm run build` then `npm run demo`; Chrome and local MongoDB are required. `CHROME_PATH` can select the browser executable.

Not verified here: Git history, credential rotation at providers, hosted GitHub Actions, Docker image build (Docker unavailable), actual cloud deployment, production OAuth/email and live-host two-account acceptance. Deployment access to GitHub, Render and MongoDB Atlas remains unconnected. See [deployment](deployment.md) for the acceptance checklist.
