const fail = (message, status = 502) => Object.assign(new Error(message), { status });
const titleKey = title => String(title).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const image = value => {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'media.rawg.io' ? url.href : null; } catch { return null; }
};
function createRAWG({ env = process.env, fetcher = fetch, pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const configured = Boolean(env.RAWG_API_KEY), cache = new Map(), flights = new Map();
  let active = 0, pending = 0;
  const waiters = [];
  function acquire() {
    if (active < 4) { active++; return Promise.resolve(); }
    return new Promise(resolve => waiters.push(resolve));
  }
  function release() {
    const next = waiters.shift();
    if (next) next();
    else active--;
  }
  function request(path, params = {}) {
    if (!configured) return Promise.reject(fail('RAWG images are not configured on this server.', 503));
    const key = path + JSON.stringify(params), saved = cache.get(key);
    if (saved?.until > Date.now()) return Promise.resolve(saved.data);
    if (flights.has(key)) return flights.get(key);
    if (pending >= 48) return Promise.reject(fail('RAWG is busy. Try again shortly.', 429));
    pending++;
    const task = (async () => {
      await acquire();
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
      try {
        const url = new URL('https://api.rawg.io/api/' + path);
        url.search = new URLSearchParams({ ...params, key: env.RAWG_API_KEY });
        let response;
        try { response = await fetcher(url.href, { signal: controller.signal, headers: { Accept: 'application/json' } }); }
        catch { throw fail('RAWG images are temporarily unavailable.'); }
        if (!response.ok) throw fail(response.status === 401 || response.status === 403 ? 'RAWG authentication failed. Check the server API key.' : 'RAWG images are temporarily unavailable.', response.status === 429 ? 429 : 502);
        let data; try { data = await response.json(); } catch { throw fail('RAWG returned an invalid response.'); }
        if (!data || typeof data !== 'object') throw fail('RAWG returned an invalid response.');
        if (cache.size >= 1000) cache.delete(cache.keys().next().value);
        cache.set(key, { data, until: Date.now() + 86400000 });
        return data;
      } finally { clearTimeout(timer); try { await pause(300); } finally { release(); } }
    })();
    flights.set(key, task);
    task.finally(() => { pending--; flights.delete(key); }).catch(() => {});
    return task;
  }
  function media(game) {
    return { id: game.id, title: game.name, image: image(game.background_image), url: /^[a-z0-9-]+$/.test(game.slug || '') ? `https://rawg.io/games/${game.slug}` : 'https://rawg.io/',
      screenshots: (game.short_screenshots || []).map(s => image(s.image)).filter(Boolean).slice(0, 6) };
  }
  async function match(entry) {
    if (entry.rawgId) return media(await request(`games/${entry.rawgId}`));
    const data = await request('games', { search: entry.title, search_precise: 'true', page_size: '20' });
    const options = (data.results || []).filter(g => titleKey(g.name) === titleKey(entry.title) && (!entry.year || !g.released || Math.abs(Number(g.released.slice(0, 4)) - entry.year) <= 1));
    return options.length === 1 ? media(options[0]) : null;
  }
  async function detail(entry) {
    const game = await match(entry);
    if (!game) return null;
    const data = await request(`games/${game.id}/screenshots`, { page_size: '6' });
    return { ...game, screenshots: (data.results || []).filter(s => !s.hidden).map(s => image(s.image)).filter(Boolean) };
  }
  async function library(entries) {
    return Promise.all(entries.map(async entry => {
      try { return { localId: entry.id, game: await match(entry) }; }
      catch { return { localId: entry.id, game: null, unavailable: true }; }
    }));
  }
  return { configured, library, detail };
}
module.exports = { createRAWG };
