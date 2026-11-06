const { parseFilters, applyFilters } = require('./catalogue-filters');
const KINDS = ['top-rated', 'popular', 'now-playing', 'upcoming', 'series-top-rated', 'series-popular', 'series-upcoming', 'discover-movies', 'series-discover'];
const PAGE_SIZE = 30;
const PROVIDER_PAGE_SIZE = 20;
const MAX_PAGES = Math.ceil(500 * PROVIDER_PAGE_SIZE / PAGE_SIZE);
const TIMEZONE = 'Asia/Kolkata';
function currentDay(now = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); }
function shiftDay(day, amount) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0,10); }
function makeQuery(kind, day, language = 'en-US', kids = false, page = 1, inputFilters = {}) {
  const params = new URLSearchParams({ language, region: 'IN', include_adult: 'false', page: String(page) });
  let resource;
  if (kind.startsWith('series-')) {
    params.delete('region');
    if (kind === 'series-upcoming') {
      resource = '/discover/tv';
      params.set('first_air_date.gte', shiftDay(day,1));
      params.set('first_air_date.lte', shiftDay(day,180));
      params.set('include_null_first_air_dates','false');
      params.set('sort_by','popularity.desc');
      params.set('timezone',TIMEZONE);
    } else resource = kind === 'series-top-rated' ? '/tv/top_rated' : '/tv/popular';
  } else if (kind === 'now-playing') resource = '/movie/now_playing';
  else if (kind === 'upcoming') {
    resource = '/discover/movie'; params.set('with_release_type','3|2'); params.set('release_date.gte', shiftDay(day,1)); params.set('release_date.lte', shiftDay(day,180)); params.set('sort_by','popularity.desc');
  } else { resource = '/movie/' + (kind === 'top-rated' ? 'top_rated' : 'popular'); }
  // Family filtering applies to every feed below (list endpoints lack genre filters).
  const filters = parseFilters(inputFilters, kind.startsWith('series-') ? 'tv' : 'movie');
  return applyFilters({ resource, params, kids }, { kind, day, kids, filters });
}
function familyTitle(item) { return !item.adult && (item.genre_ids || []).some(id => [10751,10762,16].includes(id)); }
function install(app, { mongoose, requireAuth, fetchRemote = require('./tmdb-request') }) {
  const Record = mongoose.model('CatalogueRecord', new mongoose.Schema({ key: { type: String, unique: true }, day: String, updatedAt: Date, page: Number, totalPages: Number, totalResults: Number, results: [mongoose.Schema.Types.Mixed] }));
  const pending = new Map();
  let refreshTimer;
  const key = process.env.TMDB_API_KEY;
  async function load(kind, language, kids, page = 1, inputFilters = {}) {
    const filters = parseFilters(inputFilters, kind.startsWith('series-') ? 'tv' : 'movie');
    const day = currentDay(), cacheKey = `v4:${PAGE_SIZE}:${kind}:${language}:${kids}:${day}:${page}:${JSON.stringify(filters)}`;
    const existing = await Record.findOne({ key: cacheKey }).lean();
    if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 3600000) return { ...existing, stale: false };
    const stale = existing ? { ...existing, stale: true, warning: 'Refreshing this section in the background.' } : null;
    if (pending.has(cacheKey)) return stale || pending.get(cacheKey);
    const promise = (async () => {
      try {
        if (!key) throw new Error('Set TMDB_API_KEY in server/.env to enable live movie and series listings.');
        const offset = (page - 1) * PAGE_SIZE;
        const firstProviderPage = Math.floor(offset / PROVIDER_PAGE_SIZE) + 1;
        const lastProviderPage = Math.min(500, Math.floor((offset + PAGE_SIZE - 1) / PROVIDER_PAGE_SIZE) + 1);
        async function fetchPage(providerPage) {
          const { resource, params } = makeQuery(kind, day, language, kids, providerPage, filters);
          params.set('api_key',key);
          const response = await fetchRemote(new URL(`https://api.themoviedb.org/3${resource}?${params}`));
          if (!response.ok) throw new Error(response.status === 401 ? 'TMDB rejected the API key. Check server configuration.' : 'Movie provider is temporarily unavailable.');
          const data = await response.json();
          if (!Array.isArray(data.results)) throw new Error('Movie provider returned invalid data.');
          return data;
        }
        const data = await fetchPage(firstProviderPage);
        const providerTotalPages = Math.min(500, Math.max(1, Number(data.total_pages) || 1));
        const remainingPages = [];
        for (let p = firstProviderPage + 1; p <= Math.min(lastProviderPage, providerTotalPages); p++) remainingPages.push(fetchPage(p));
        const following = await Promise.all(remainingPages);
        const combined = [data, ...following].flatMap(result => result.results);
        let results = combined.slice(offset % PROVIDER_PAGE_SIZE, offset % PROVIDER_PAGE_SIZE + PAGE_SIZE).filter(i => !i.adult);
        if (kids) results = results.filter(familyTitle);
        // TMDB supplies regional theatrical dates for discover queries.
        if (kind === 'series-upcoming') results = results.filter(i => i.first_air_date > day && i.first_air_date <= shiftDay(day,180));
        if (kind === 'upcoming') results = results.filter(i => i.release_date > day);
        if (kind === 'now-playing') results = results.filter(i => i.release_date && i.release_date <= day);
        const record = { key: cacheKey, day, updatedAt: new Date(), page, totalPages: Math.max(1, Math.ceil(Math.min(Number(data.total_results) || data.results.length, providerTotalPages * PROVIDER_PAGE_SIZE) / PAGE_SIZE)), totalResults: Math.min(Number(data.total_results) || data.results.length, providerTotalPages * PROVIDER_PAGE_SIZE), results };
        await Record.findOneAndUpdate({ key: cacheKey }, record, { upsert: true, returnDocument: "after" });
        return { ...record, stale: false };
      } catch (error) {
        // Only serve same-day records: yesterday's upcoming titles may have released.
        if (existing) return { ...existing, stale: true, warning: 'Refresh failed; showing the last successful update from today.' };
        throw Object.assign(new Error(error.message === 'The operation was aborted due to timeout' ? 'Movie provider timed out. Please try again.' : error.message), { status: 503 });
      }
    })();
    pending.set(cacheKey,promise);
    promise.finally(() => { if (pending.get(cacheKey) === promise) pending.delete(cacheKey); }).catch(() => {});
    return stale || promise;
  }
  app.get('/api/catalogue/:kind', (req,res,next) => (req.headers.authorization || req.cookies?.movieshub_session) ? requireAuth(req,res,next) : next(), async (req,res) => {
    const kind = req.params.kind;
    if (!KINDS.includes(kind)) return res.status(404).json({ message: 'Unknown catalogue section.' });
    const page = Number(req.query.page ?? 1);
    if (!Number.isInteger(page) || page < 1 || page > MAX_PAGES) return res.status(400).json({ message: `Page must be between 1 and ${MAX_PAGES}.` });
    try {
      const account = req.accountUser?.account;
      const profile = account?.profiles.find(p => p.id === req.query.profile);
      if (req.query.profile && !profile) return res.status(404).json({ message: 'Profile not found.' });
      if (profile?.pin && !req.accountSession.unlocked.includes(profile.id)) return res.status(403).json({ message: 'Unlock this profile first.' });
      const language = account?.preferences.language || 'en-US';
      const filters = parseFilters(req.query, kind.startsWith('series-') ? 'tv' : 'movie');
      const record = await load(kind,language,profile?.kids === true,page,filters);
      res.set('Cache-Control','no-store').json({ kind, mediaType: kind.startsWith('series-') ? 'tv' : 'movie', region: kind.startsWith('series-') ? null : 'IN', timezone: TIMEZONE, date: record.day, page: record.page, pageSize: PAGE_SIZE, totalPages: record.totalPages, totalResults: record.totalResults, updatedAt: record.updatedAt, filters, nextRefreshAt: new Date(new Date(record.updatedAt).getTime() + 3600000), stale: record.stale, warning: record.warning, results: record.results });
    } catch (error) { res.status(error.status || 503).json({ message: error.status ? error.message : 'Catalogue listings could not be refreshed. Please try again.' }); }
  });
  async function refresh() {
    const jobs = KINDS.filter(kind => !kind.includes('discover')).map(kind => load(kind,'en-US',false));
    const results = await Promise.allSettled(jobs);
    if (results.some(r => r.status === 'rejected')) console.error('Some catalogue sections could not refresh. They will retry on the next request or scheduled refresh.');
    await Record.deleteMany({ day: { $lt: shiftDay(currentDay(),-2) } });
  }
  return { start() { if (!key) { console.warn('Live catalogue requires TMDB_API_KEY in server/.env.'); return; } refresh().catch(() => {}); refreshTimer = setInterval(() => refresh().catch(() => {}), 15 * 60000); refreshTimer.unref(); }, stop() { clearInterval(refreshTimer); }, load };
}
module.exports = install;
module.exports.currentDay = currentDay;
module.exports.shiftDay = shiftDay;
module.exports.makeQuery = makeQuery;
module.exports.familyTitle = familyTitle;
