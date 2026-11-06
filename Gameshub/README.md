# Simple editable library

`mlist.jsx` now needs only `{ title: "My Game", year: 2024, franchise: "My Series" }`. Restart after editing. IGDB supplies platforms, genres, developers and release details automatically; RAWG supplies artwork and screenshots. Metadata loads progressively into library cards, search and filters. Missing or ambiguous matches retain the local title/year/franchise, with unknown metadata left empty. A first-release year gives the best match.

Internal IDs are generated automatically from title and year. `identities.json` preserves existing IDs for saved links, discussions, bookmarks and missions; do not edit it during normal library updates. Authored story guides remain in `catalogue.json`. API keys remain in `.env`. Older examples below showing extra fields or provider IDs are optional advanced formats; none are required in `mlist.jsx`.

﻿# Gameshub

Gameshub runs inside the Portfolio SPA at `/gameshub/`. Start everything from
`G:\Portfolio` with `npm start`; no extra server process is needed.

## Edit the game library

**`mlist.jsx` is the library's editable list.** It contains ordinary JavaScript
objects, similar to Movieshub's list. No React code or JSX markup is required.
Append a game inside the existing `mList` array:

```javascript
{
  id: "my-new-game",                 // optional, but recommended: keep it stable
  title: "My New Game",
  platforms: ["Windows", "PlayStation 5"],
  year: 2026,                        // optional
  franchise: "My Series",            // optional
  genre: "Adventure",                // optional
},
```

Only `title` (or `name`) and `platforms` are required:

```javascript
{ title: "Another Game", platforms: ["Nintendo Switch"] },
```

Keep `module.exports = mList;` at the end of the file. The `.jsx` extension is
for the familiar list-editing workflow; the server loads this as a plain
CommonJS data module. Save, restart `npm start`, then refresh the browser.

Platforms can be any names you need, from arcade machines and old consoles to
PC, mobile, and modern consoles. The platform and genre filters automatically
include values from the list. The library has franchise filters, text search,
release-year sorting, and 18 games per page. Search also matches aliases.

Optional fields: `id`, `year`, `franchise`, `genre`, `subseries`, `aliases`,
`developer`, `image`, `source`, `status`, `release`, `tagline`, and `accent`.
Use a unique lowercase/hyphenated ID, especially once people have posted
comments. Without an ID, one is generated from the title; different editions
with the same title need explicit unique IDs. `image` can be a filename in
`public/images/` or an HTTPS image URL. Otherwise, an original franchise-themed
placeholder is used. Use `status: "Upcoming"` for an unreleased game.

## Starter coverage

The list currently includes 342 entries:

- 288 Mario entries: mainline games, Kart, Party, RPG, sports, educational,
  creative, arcade, related spin-offs and selected crossovers, with named
  remakes and reissues represented where useful.
- 26 Contra entries: main games, handheld/mobile games, spin-offs, arcade and
  slot-machine adaptations, and the anniversary collection. Regional names
  such as Gryzor and Probotector are searchable aliases rather than duplicates.
- 25 GTA entries: main games, handheld games, London expansions, story DLC,
  Online, compilations and remasters. GTA VI is marked Upcoming with only its
  announced console platforms.
- The three existing Portal, Portal 2 and Half-Life 2 story dossiers.

Metadata was checked on **28 October 2026**. The scope excludes canceled
prototypes, unlicensed games, promotional browser activities, mere cameos, and
independent Wario/Yoshi/Donkey Kong catalogues outside the Mario-related titles
already listed. Same-name versions can be grouped by year/platform; different
editions may have different gameplay. A historical platform listing does not
mean the game is still sold, its online service is active, or it runs natively
on every newer backward-compatible system. Platform lists are not an exhaustive
list of emulation, subscription or cloud-streaming availability.

Metadata references:

- [Mario game catalogue](https://www.mariowiki.com/Games_by_System)
- [Early Mario appearances and platforms](https://en.wikipedia.org/wiki/List_of_video_games_featuring_Mario)
- [Contra series list](https://en.wikipedia.org/wiki/Contra_(series))
- [Contra Operation Galuga platforms](https://www.konami.com/games/eu/en/products/contra_og/)
- [Contra Anniversary Collection](https://www.konami.com/games/ca/en/products/contra_anniversary_collection/)
- [Contra Burst announcement](https://www.konami.com/videonews/movie_view.html?movie_url=6375728310112)
- [GTA release and platform list](https://en.wikipedia.org/wiki/Grand_Theft_Auto)
- [GTA VI official page](https://www.rockstargames.com/VI)
- [Mario Tennis Fever](https://www.nintendo.com/en-gb/Games/Nintendo-Switch-2-games/Mario-Tennis-Fever-2915160.html)

## Add a story dossier

Listing a game does **not** invent a story, history, or character profiles.
Library-only pages show their known metadata and offer discussions, with clear
messages where written guides are not yet available.

To expand a game, add an object in `catalogue.json` whose `id` matches its
`mlist.jsx` entry (or specify `dossier` in the library entry). Include:

- Spoiler-free `setting`, `history`, and `timeline`.
- `characters`: `name`, `role`, `safe` introduction and `deep` revelations.
- `story`: original chapter/title pairs covering the complete story and ending.
- `sources`: `[label, httpsURL, "safe" | "deep"]` references.

Names and roles must not reveal hidden identities in spoiler-free mode. Write
original summaries rather than copying game scripts or wiki articles.
The default API omits story chapters, deep character text, and spoiler-heavy
links. Readers explicitly confirm before deep-dive content is fetched.

The original three guides contain 23 notable-character/entity profiles. They
are condensed story summaries, not walkthroughs or complete NPC encyclopedias.
Game names and existing cover artwork belong to their owners. Original abstract
franchise placeholders are not official game covers.

## Discussions and storage

Each game has separate spoiler-free and deep-dive boards with threaded replies.
Guest display names are unverified. Mode separation does not automatically
recognise a spoiler that someone posts on the wrong board.

Posts persist in `data/gameshub.sqlite`, or in a separate `gameshub` subdirectory
of `PORTFOLIO_DATA_DIR` when using the shared server's persistent volume.
Keep IDs stable and back up the database. Restarting does not reset conversations.

Standalone: `npm start` in this folder serves port 3004 using the shared root
dependencies. Portfolio mode keeps the existing single port and LAN URL.

### IGDB integration

Set `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in the root `.env` (or `Gameshub/.env` for standalone use), then restart the server. Never put real credentials in `.env.example` or browser code. The server obtains and renews Twitch app tokens automatically. The same setup works through the unified Portfolio server and on your LAN.

`mlist.jsx` remains your editable library. IGDB supplies matching covers and metadata, with batches of up to 18 visible games, a one-hour in-memory cache, request deduplication, and a serial queue below IGDB's four-requests-per-second limit. When IGDB is unavailable, the local library and discussions still work. Covers may require internet access on the viewing device.

For an ambiguous or missing match, add the numeric `igdbId` to its entry, for example `igdbId: 72`. Find IDs with `GET /gameshub/api/igdb/search?q=Portal%202`; results include IDs and IGDB source links. Matching without an ID requires the exact title and a compatible first-release year. Not every historical entry is guaranteed to exist in IGDB.

Endpoints: `GET /api/igdb/status`, `/api/igdb/search?q=...`, `/api/igdb/library?ids=local-id,...`, and `/api/games/:id/igdb?mode=spoiler-free`. Prefix these with `/gameshub` when using the Portfolio server. Only deep-dive mode requests IGDB plot summaries, storylines, and character descriptions. IGDB overviews are supplemental and are not guaranteed to contain the complete story. Authored dossiers remain available separately.

Provider documentation: https://api-docs.igdb.com/ and https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/


## October 2026 feature expansion

- Added spoiler-protected mission archive endpoint (`missions.json` is initially empty; add only verified mission narratives).
- Added cross-game character match candidates and Connections tab; matches are not verified identities.
- Added bookmark and chapter progress API, stored in SQLite using a browser-generated reader ID. This is **not authenticated cross-device sync**; the reader ID is a convenience identifier, not a secure account.
- Added low-data mode, browser speech narration, language preference (English/Hindi voice only), and correction submission queue. Written translations and multilingual story content still require licensed/verified source material.
- Existing discussions are unchanged. Public moderation and anti-spam controls need strengthening before large-scale launch.
- No store integration, trailer licensing, full mission importer, or verified story-generation pipeline has been added yet.

### Missions data

Populate `missions.json` with an object keyed by local game ID, each containing an array of `{ "title": "...", "story": "...", "consequence": "..." }` records. Only deep-dive requests expose the mission data.

### Run

`npm install` then `npm start`. Uses built-in `node:sqlite` on supported Node versions. IGDB requires `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET` in `.env`.

### RAWG images + IGDB details

Add `RAWG_API_KEY` to the root `.env` (or `Gameshub/.env`), keeping the existing IGDB credentials. Restart the server. RAWG now supplies library/featured/banner images and an expandable gameplay screenshot gallery; IGDB supplies metadata, storylines and character descriptions. IGDB images are no longer requested. Local artwork remains the fallback when RAWG is unavailable or no unique match is found. Low-data mode skips external image lookups.

RAWG title matching uses the title and first-release year. For ambiguous titles or editions, set a positive numeric `rawgId` in `mlist.jsx`; this is independent of `igdbId`. The server caches RAWG requests for 24 hours in memory, deduplicates requests, and bounds its queue. Gameplay galleries are collapsed by default because screenshots can contain visual spoilers. RAWG may only provide landscape artwork rather than a portrait poster for some games.

Endpoints: `/api/rawg/status`, `/api/rawg/library?ids=local-id,...` (up to 18), and `/api/games/:id/media`. Prefix with `/gameshub` in the unified server. Responses contain only selected image URLs and public source links; API keys stay server-side. Pages display RAWG attribution links as required by the provider. API docs: https://rawg.io/apidocs and https://api.rawg.io/docs/.
