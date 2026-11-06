const crypto = require('node:crypto');

const COOKIE = 'movieshub_session';
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' });
function setSession(res, token) { res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: 7 * 86400000 }); }
function clearSession(res) { res.clearCookie(COOKIE, cookieOptions()); }
function passwordIsValid(value) { return typeof value === 'string' && value.length >= 10 && value.length <= 128 && Buffer.byteLength(value, 'utf8') <= 72; }

function rateLimit({ max = 120, windowMs = 60000, key = req => req.ip } = {}) {
  const buckets = new Map();
  const cleanup = setInterval(() => { for (const [k, v] of buckets) if (v.reset <= Date.now()) buckets.delete(k); }, windowMs);
  cleanup.unref();
  return (req, res, next) => {
    const now = Date.now(), id = key(req);
    let bucket = buckets.get(id);
    if (!bucket || bucket.reset <= now) {
      if (buckets.size >= 10000) return res.status(503).json({ message: 'Server is busy. Please retry shortly.' });
      bucket = { count: 0, reset: now + windowMs }; buckets.set(id, bucket);
    }
    if (++bucket.count > max) {
      res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({ message: 'Too many requests. Please retry shortly.' });
    }
    next();
  };
}

function installSecurity(app, { clientOrigin, allowedOrigins = [], logger = console }) {
  const trustedOrigins = new Set([clientOrigin, ...allowedOrigins]);
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY_HOPS) {
    const hops = Number(process.env.TRUST_PROXY_HOPS);
    if (!Number.isInteger(hops) || hops < 1 || hops > 5) throw new Error('TRUST_PROXY_HOPS must be between 1 and 5.');
    app.set('trust proxy', hops);
  }
  app.use((req, res, next) => {
    const started = Date.now(), requestId = crypto.randomUUID();
    res.set({ 'X-Request-Id': requestId, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
    if (process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
    res.on('finish', () => {
      if (req.path.startsWith('/api/')) logger.info(JSON.stringify({ event: 'request', requestId, method: req.method, route: req.route?.path || 'unmatched', status: res.statusCode, durationMs: Date.now() - started }));
    });
    if (req.path.startsWith('/api/auth') || req.path.startsWith('/api/account')) res.set('Cache-Control', 'no-store');
    if (!req.path.startsWith('/api/') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Exact origin checking plus JSON-only mutations prevents cookie-based CSRF.
    if (req.headers.origin && !trustedOrigins.has(req.headers.origin)) return res.status(403).json({ message: 'Request origin is not allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ message: 'Cross-site requests are not allowed.' });
    if (req.cookies?.[COOKIE] && !req.headers.authorization && !trustedOrigins.has(req.headers.origin)) return res.status(403).json({ message: 'A trusted request origin is required.' });
    if (!req.is('application/json')) return res.status(415).json({ message: 'Use application/json for API changes.' });
    next();
  });
  app.use('/api', rateLimit({ max: 600 }));
  const authLimit = rateLimit({ max: 30, windowMs: 15 * 60000 });
  app.use('/api/auth', (req, res, next) => req.method === 'GET' ? next() : authLimit(req, res, next));
  app.use('/api', (req, res, next) => {
    if (req.body === null || (req.body !== undefined && (typeof req.body !== 'object' || Array.isArray(req.body)))) return res.status(400).json({ message: 'A JSON object is required.' });
    req.body ??= {};
    next();
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const requestId = res.getHeader('X-Request-Id');
  if (error.code === 11000) return res.status(409).json({ message: 'That account or record already exists.' });
  if (error.name === 'VersionError') return res.status(409).json({ message: 'Your account changed in another request. Refresh and try again.' });
  if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Request body is too large.' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body.' });
  if (['ValidationError', 'CastError'].includes(error.name)) return res.status(400).json({ message: 'Please check the supplied values.' });
  if (error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message });
  console.error(JSON.stringify({ event: 'request_error', requestId, name: error.name, code: error.code }));
  res.status(500).json({ message: 'Something went wrong. Please try again.', requestId });
}
module.exports = { COOKIE, setSession, clearSession, passwordIsValid, rateLimit, installSecurity, errorHandler };
