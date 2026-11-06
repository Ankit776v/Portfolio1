/**
 * Enrich mlist.jsx using The Movie Database (TMDB), add genres/release dates,
 * and write a chronologically sorted JSON copy without overwriting the source.
 *
 * Usage:
 *   TMDB_API_KEY="your_tmdb_v3_api_key" node enrichMList.mjs
 *   (PowerShell) $env:TMDB_API_KEY="your_tmdb_v3_api_key"; node .\enrichMList.mjs
 *
 * Put this script beside mlist.jsx. Requires Node.js 18+.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, 'mlist.jsx');
const OUTPUT_FILE = path.join(__dirname, 'mlist.enriched.json');
const API_KEY = process.env.TMDB_API_KEY;
const API_BASE = 'https://api.themoviedb.org/3';

if (!API_KEY) {
  throw new Error('Set TMDB_API_KEY to your TMDB API Read Access Token/API key before running.');
}

// The uploaded mlist.jsx is a JavaScript array literal. Extract and evaluate only
// that literal (not the export statement), preserving the existing item fields.
const source = await fs.readFile(INPUT_FILE, 'utf8');
const match = source.match(/const\s+mList\s*=\s*(\[[\s\S]*?\]);\s*\n\s*export\s+default\s+mList\s*;/);
if (!match) throw new Error('Could not find the expected `const mList = [...]` in mlist.jsx.');
const mList = Function(`"use strict"; return (${match[1]});`)();

async function tmdb(pathname, params = {}) {
  const url = new URL(`${API_BASE}${pathname}`);
  url.searchParams.set('api_key', API_KEY);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  }

  // TMDB connections can be reset temporarily. Retry transient network errors,
  // rate limits, and server errors with exponential backoff before giving up.
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(25000) });
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(`Network request to TMDB failed after ${maxAttempts} attempts (${error.cause?.code || error.message}). Check internet access, firewall/VPN, and that https://api.themoviedb.org is reachable.`);
      }
      const delay = Math.min(30000, 1000 * (2 ** (attempt - 1)));
      console.warn(`TMDB network error on ${pathname} (attempt ${attempt}/${maxAttempts}); retrying in ${delay / 1000}s...`);
      await sleep(delay);
      continue;
    }

    if (response.ok) return response.json();
    const body = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`TMDB ${response.status} for ${pathname}: ${body}`);
    }
    const retryAfter = Number(response.headers.get('retry-after'));
    const delay = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(60000, retryAfter * 1000)
      : Math.min(30000, 1000 * (2 ** (attempt - 1)));
    console.warn(`TMDB returned HTTP ${response.status} for ${pathname} (attempt ${attempt}/${maxAttempts}); retrying in ${delay / 1000}s...`);
    await sleep(delay);
  }
  throw new Error(`TMDB request failed for ${pathname}`);
}

const [movieGenres, tvGenres] = await Promise.all([
  tmdb('/genre/movie/list', { language: 'en-US' }),
  tmdb('/genre/tv/list', { language: 'en-US' }),
]);
const movieGenreMap = new Map(movieGenres.genres.map(g => [g.id, g.name]));
const tvGenreMap = new Map(tvGenres.genres.map(g => [g.id, g.name]));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const cache = new Map();

function titleAndYear(title = '') {
  const match = title.match(/\s*\((\d{4})\)\s*$/);
  return {
    query: title.replace(/\s*\(\d{4}\)\s*$/, '').trim(),
    year: match ? Number(match[1]) : undefined,
  };
}
function normalize(value = '') {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
function isTv(item) {
  return /show|series|short-series|tv/i.test(item.categories || '');
}
function candidateScore(result, query, year, tv) {
  const resultTitle = tv ? result.name : result.title;
  const resultDate = tv ? result.first_air_date : result.release_date;
  let score = 0;
  if (normalize(resultTitle) === normalize(query)) score += 100;
  else if (normalize(resultTitle).includes(normalize(query)) || normalize(query).includes(normalize(resultTitle))) score += 30;
  if (year && resultDate) {
    const resultYear = Number(resultDate.slice(0, 4));
    if (resultYear === year) score += 50;
    else score -= Math.min(40, Math.abs(resultYear - year) * 5);
  }
  score += Math.min(10, (result.popularity || 0) / 10);
  return score;
}

async function lookup(item) {
  const { query, year } = titleAndYear(item.title);
  const tv = isTv(item);
  const key = `${tv ? 'tv' : 'movie'}|${normalize(query)}|${year || ''}`;
  if (cache.has(key)) return cache.get(key);

  const searchTypes = tv ? ['tv', 'movie'] : ['movie', 'tv'];
  const results = [];
  let successfulSearches = 0;
  for (const type of searchTypes) {
    try {
      const data = await tmdb(`/search/${type}`, {
        query,
        include_adult: false,
        language: 'en-US',
        ...(year ? (type === 'movie' ? { primary_release_year: year } : { first_air_date_year: year }) : {}),
      });
      successfulSearches++;
      for (const result of (data.results || [])) results.push({ ...result, _type: type });
    } catch (error) {
      console.warn(`Search failed for "${item.title}": ${error.message}`);
    }
  }

  if (successfulSearches === 0) {
    throw new Error(`All TMDB searches failed for "${item.title}"; this is a connection/API error, not a confirmed no-match.`);
  }

  results.sort((a, b) => candidateScore(b, query, year, b._type === 'tv') - candidateScore(a, query, year, a._type === 'tv'));
  const best = results[0];
  if (!best) {
    console.log(`Skipping "${item.title}": no TMDB match found.`);
    cache.set(key, null);
    return null;
  }

  const tvResult = best._type === 'tv';
  const genreMap = tvResult ? tvGenreMap : movieGenreMap;
  const genres = (best.genre_ids || []).map(id => genreMap.get(id)).filter(Boolean);
  const enriched = {
    ...item,
    tmdb_id: best.id,
    tmdb_media_type: best._type,
    release_date: (tvResult ? best.first_air_date : best.release_date) || null,
    genres,
    genre: genres.join(', '),
    tmdb_found: true,
  };
  cache.set(key, enriched);
  return enriched;
}

const enrichedList = [];
for (let i = 0; i < mList.length; i++) {
  const item = mList[i];
  try {
    const enriched = await lookup(item);
    if (enriched) enrichedList.push(enriched);
  } catch (error) {
    console.warn(`Could not enrich "${item.title}": ${error.message}`);
    // Skip items that could not be verified on TMDB or whose lookup failed.
    // Network/API failures are logged so they can be retried on a later run.
  }
  if ((i + 1) % 25 === 0 || i === mList.length - 1) {
    console.log(`Processed ${i + 1}/${mList.length}`);
  }
  // Be polite to the API. Duplicate title/year/media lookups are cached.
  await sleep(120);
}

// Sort by actual TMDB date (earliest first). Unknown dates are kept at the end;
// stable tie-breaker retains the original order for items sharing a date.
const sorted = enrichedList
  .map((item, index) => ({ item, index }))
  .sort((a, b) => {
    const da = a.item.release_date || '9999-12-31';
    const db = b.item.release_date || '9999-12-31';
    return da.localeCompare(db) || a.index - b.index;
  })
  .map(({ item }) => item);

await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`Done. Kept ${sorted.length} titles with a TMDB match; unmatched/failed titles were skipped.`);
console.log(`Output: ${OUTPUT_FILE}`);
