# Movie/series filtering and remote episodes

Choose **Movies** or **Shows** in the navigation to discover titles with these filters:

- Original production language (including Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Punjabi, English, Japanese and Korean).
- Media-specific genre, release year/first-air year, minimum TMDB rating and sort order.
- Filter state and page numbers are preserved in the URL. Changing/clearing a filter resets to page 1. Pages still contain up to 30 titles, combining 20-item provider pages.

Filters also appear on existing Top Rated, Popular, Upcoming and theatrical browse pages. Language filters the title's **original language**, not available audio/dub tracks or translated description language. Minimum rating and highest-rated sorting use a vote-count floor (300 for movies, 100 for TV) to avoid ranking barely rated titles first. Filtered theatrical discovery covers India theatrical releases in the last 60 days. Upcoming sections retain their future-release window; profile family filtering remains enforced.

The Movies/Shows category pages now query TMDB discovery, rather than trying to infer missing language/genre metadata from `mlist.jsx`. **Browse curated collection** opens the existing local collection; its existing search and pagination remain intact. The home page keeps its feed previews. All provider requests still use the server-side TMDB key.

When a TV series is not in `mlist.jsx`, its detail page displays TMDB's seasons (including specials). Expand a season to load episode names, descriptions, air dates and runtimes. Episode cards open stable routes like `/title/tv/123/season/1/episode/2`, with previous/next episode navigation. Existing curated season mappings and episode links are preserved. Missing seasons/episodes show loading, empty or retry states, and direct episode detail pages respect the active family profile filter. Showing episode metadata does not add playback sources.

Cache keys include normalized filters, preventing one language/genre combination from serving another combination's cached results. Invalid filters return 400 before provider access.

Verification: lint and production build pass; all 17 server tests pass with MongoDB enabled. Isolated Chrome checks exercised movie/TV filters, reset-to-first-page behavior, 30-card pagination, non-catalogued seasons, individual episode details, next-episode navigation and a 390px mobile layout without horizontal overflow. Metadata was stubbed during these checks; live provider behavior requires a valid server `TMDB_API_KEY`.

Provider references: [movie discovery](https://developer.themoviedb.org/reference/discover-movie), [TV discovery](https://developer.themoviedb.org/reference/discover-tv).
