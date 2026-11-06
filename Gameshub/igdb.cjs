const FIELDS = 'name,slug,first_release_date,platforms.name,genres.name,involved_companies.developer,involved_companies.company.name';
const failure = (message, status = 502) => Object.assign(new Error(message), { status });
const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
function createIGDB({ env = process.env, fetcher = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const configured = Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET);
  let token, expires = 0, authentication, queue = Promise.resolve(), pending = 0;
  const cache = new Map(), flights = new Map();
  async function send(url, options) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try { return await fetcher(url, { ...options, signal: controller.signal }); }
    catch { throw failure('IGDB is temporarily unavailable. Try again later.'); }
    finally { clearTimeout(timer); }
  }
  async function authorize() {
    if (token && Date.now() < expires) return token;
    if (!authentication) authentication = (async () => {
      const response = await send('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID, client_secret: env.IGDB_CLIENT_SECRET, grant_type: 'client_credentials' }).toString() });
      if (!response.ok) throw failure('IGDB authentication failed. Check the server credentials.', 503);
      const data = await response.json();
      if (!data.access_token || !Number.isFinite(data.expires_in)) throw failure('IGDB authentication returned an invalid response.');
      token = data.access_token; expires = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
      return token;
    })().finally(() => { authentication = null; });
    return authentication;
  }
  function query(endpoint, body) {
    if (!configured) return Promise.reject(failure('IGDB is not configured on this server.', 503));
    const key = endpoint + body, saved = cache.get(key);
    if (saved && saved.until > Date.now()) return Promise.resolve(saved.data);
    if (flights.has(key)) return flights.get(key);
    if (pending >= 32) return Promise.reject(failure('IGDB is busy. Please try again shortly.', 429));
    pending++;
    const task = queue.then(async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          const access = await authorize();
          const response = await send(`https://api.igdb.com/v4/${endpoint}`, { method: 'POST', headers: { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${access}`, 'Content-Type': 'text/plain', Accept: 'application/json' }, body });
          if (response.status === 401 && attempt === 0) { token = null; await pause(300); continue; }
          if (!response.ok) throw failure(response.status === 429 ? 'IGDB request limit reached. Try again shortly.' : 'IGDB could not load game information.', response.status === 429 ? 429 : 502);
          const data = await response.json();
          if (!Array.isArray(data)) throw failure('IGDB returned an invalid response.');
          if (cache.size >= 500) cache.delete(cache.keys().next().value);
          cache.set(key, { data, until: Date.now() + 3600000 });
          return data;
        }
      } finally { await pause(300); }
    });
    queue = task.catch(() => {});
    flights.set(key, task);
    task.finally(() => { pending--; flights.delete(key); }).catch(() => {});
    return task;
  }
  function metadata(game) {
    return { id: game.id, title: game.name, release: game.first_release_date ? new Date(game.first_release_date * 1000).toISOString().slice(0,10) : null, year: game.first_release_date ? new Date(game.first_release_date * 1000).getUTCFullYear() : null,
      platforms: (game.platforms || []).map(p => p.name), genres: (game.genres || []).map(g => g.name),
      developers: (game.involved_companies || []).filter(c => c.developer).map(c => c.company?.name).filter(Boolean),
      url: /^[a-z0-9-]+$/.test(game.slug || '') ? `https://www.igdb.com/games/${game.slug}` : 'https://www.igdb.com/' };
  }
  async function search(text) {
    if (typeof text !== 'string' || text.trim().length < 2 || text.length > 120 || /[\x00-\x1f]/.test(text)) throw failure('Enter a game title between 2 and 120 characters.', 400);
    return (await query('games', `search ${JSON.stringify(text.trim())}; fields ${FIELDS}; limit 20;`)).map(metadata);
  }
  async function match(entries) {
    const titles = [...new Set(entries.map(e => e.title))];
    const ids = entries.map(e => e.igdbId).filter(Boolean);
    const where = `name = (${titles.map(t => JSON.stringify(t)).join(',')})${ids.length ? ` | id = (${ids.join(',')})` : ''}`;
    const candidates = await query('games', `fields ${FIELDS}; where ${where}; limit 100;`);
    return entries.map(entry => {
      const options = candidates.filter(g => entry.igdbId ? g.id === entry.igdbId : normalize(g.name) === normalize(entry.title) && (!entry.year || !g.first_release_date || Math.abs(new Date(g.first_release_date * 1000).getUTCFullYear() - entry.year) <= 1));
      return { localId: entry.id, game: options.length === 1 ? metadata(options[0]) : null };
    });
  }
  async function detail(entry, deep = false) {
    const matched = (await match([entry]))[0].game;
    if (!matched || !deep) return matched;
    const [game] = await query('games', `fields summary,storyline; where id = ${matched.id}; limit 1;`);
    const characters = await query('characters', `fields name,description; where games = (${matched.id}); limit 50;`);
    return { ...matched, summary: game?.summary || '', storyline: game?.storyline || '', characters: characters.map(c => ({ name: c.name, bio: c.description || '' })) };
  }
  return { configured, search, match, detail };
}
module.exports = { createIGDB };
