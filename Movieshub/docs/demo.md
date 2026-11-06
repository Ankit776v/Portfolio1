# Product demo and interview walkthrough

Suggested 90-second walkthrough:

1. **Discover (15 seconds):** show the curated catalogue and TMDB feeds, 30-title pagination and family profile filters.
2. **Review (30 seconds):** open a title, write a 1–5 star review, show the whole-title average/count, change sort and paginate. Edit the review, then show that a second account cannot edit it.
3. **Personal account (20 seconds):** open Reviews, My List and device sessions. Explain profile-specific watchlists versus account-wide authored reviews. Revoke another session.
4. **Engineering (25 seconds):** show the architecture diagram, passing CI checks, cookie/ownership tests, safe source ZIP and health endpoint. Explain the 20-provider/30-display pagination boundary, stable TV identities and cache rollover.

Interview talking points:

- Extended existing review CRUD instead of duplicating it; preserved historical movie/season identities.
- Kept credentials on the server and moved browser sessions out of localStorage, including CSRF protection and device revocation.
- Tested cross-user actions through actual HTTP requests and disposable MongoDB databases, including duplicate-registration races.
- Separated startup from application construction, making real endpoint tests possible without importing production configuration.
- Added deployment artifacts and operating documentation; distinguish verified local behavior from work requiring connected hosting/provider accounts.
- No fabricated performance numbers: pagination bounds payloads, and indexes should be assessed with representative execution plans before claiming speedups.

Screenshots and a recording should be captured from the implemented app, using clearly labeled demo data and no private account details. See `scripts/demo.cjs` when available. The live-host acceptance checklist is in [deployment](deployment.md).
