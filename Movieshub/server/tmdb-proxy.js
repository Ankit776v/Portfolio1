const { rateLimit } = require('./security');
const allowed = /^(?:search\/(?:movie|tv|multi)|(?:movie|tv)\/\d+(?:\/(?:credits|videos|recommendations|similar))?|tv\/\d+\/season\/\d+(?:\/videos|\/credits|\/episode\/\d+(?:\/credits)?)?|person\/\d+(?:\/combined_credits)?)$/;
module.exports = function installTmdbProxy(app, { fetchRemote = require('./tmdb-request') } = {}) {
  const cache = new Map(), pending = new Map();
  app.get('/api/tmdb/{*resource}', rateLimit({ max: 300 }), async (req, res, next) => {
    try {
      const resource = (req.params.resource || []).join('/');
      if (!allowed.test(resource)) return res.status(404).json({ message: 'Unknown metadata resource.' });
      if (!process.env.TMDB_API_KEY) return res.status(503).json({ message: 'Movie metadata is not configured.' });
      const params = new URLSearchParams();
      for (const name of ['query','language','year','first_air_date_year','page']) {
        const value = req.query[name];
        if (value !== undefined) {
          if (typeof value !== 'string' || value.length > 240) return res.status(400).json({ message: 'Invalid metadata query.' });
          params.set(name, value);
        }
      }
      params.set('include_adult','false');
      const cacheKey = `${resource}?${params}`, cached = cache.get(cacheKey);
      if (cached && cached.until > Date.now()) return res.json(cached.data);
      if (!pending.has(cacheKey)) {
        params.set('api_key',process.env.TMDB_API_KEY);
        pending.set(cacheKey, (async () => {
          const response = await fetchRemote(new URL(`https://api.themoviedb.org/3/${resource}?${params}`));
          if (!response.ok) throw Object.assign(new Error('Movie metadata is temporarily unavailable.'), { status: response.status === 404 ? 404 : 503 });
          const data = await response.json();
          if (cache.size >= 500) cache.delete(cache.keys().next().value);
          cache.set(cacheKey,{ data, until: Date.now() + 15 * 60000 });
          return data;
        })());
      }
      try { res.json(await pending.get(cacheKey)); } finally { pending.delete(cacheKey); }
    } catch (error) { if (error.status) return res.status(error.status).json({ message: error.message }); next(error); }
  });
};
