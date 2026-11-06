const { COOKIE, setSession, clearSession, passwordIsValid } = require('./security');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

module.exports = function installAccounts(app, { User, Review, mongoose, jwtSecret }) {
  const Session = mongoose.model('AccountSession', new mongoose.Schema({
    token: { type: String, unique: true }, userId: { type: mongoose.Schema.Types.ObjectId, index: true },
    revoked: { type: Boolean, default: false }, created: Date, expires: { type: Date, expires: 0 }, agent: String, unlocked: [String],
  }));
  const digest = token => crypto.createHash('sha256').update(token).digest('hex');
  const newProfile = name => ({ id: crypto.randomUUID(), name, kids: false, pin: null, watchlist: [], history: [], ratings: {} });
  const defaults = user => {
    if (!user.account) user.account = { plan: 'Free', membership: 'active', preferences: { language: 'en-US', quality: 'Auto', subtitles: true, autoplay: false, notifications: true }, profiles: [newProfile(user.name)] };
    return user.account;
  };
  const serializeUser = (user, session) => {
    const account = structuredClone(defaults(user));
    account.profiles = account.profiles.map(p => {
      const unlocked = !p.pin || session?.unlocked?.includes(p.id);
      return { ...p, pin: undefined, hasPin: !!p.pin, unlocked, watchlist: unlocked ? p.watchlist : [], history: unlocked ? p.history : [], ratings: unlocked ? p.ratings : {} };
    });
    return { id: user._id.toString(), name: user.name, email: user.email, createdAt: user.createdAt, ...account };
  };
  async function createToken(user) {
    if (!user.account) { defaults(user); user.markModified('account'); await user.save(); }
    const token = jwt.sign({ sub: user._id.toString(), email: user.email, version: user.resetPasswordVersion, jti: crypto.randomUUID() }, jwtSecret, { expiresIn: '7d' });
    await Session.create({ token: digest(token), userId: user._id, created: new Date(), expires: new Date(Date.now() + 7 * 86400000), agent: 'New sign-in', unlocked: [] });
    return token;
  }
  async function requireAuth(req, res, next) {
    try {
      const header = req.headers.authorization;
      if (header && !/^Bearer\s+\S+$/i.test(header)) throw new Error('Invalid authorization');
      const token = header ? header.replace(/^Bearer\s+/i, '') : req.cookies?.[COOKIE];
      if (!token) return res.status(401).json({ message: 'Please sign in to continue.' });
      const payload = jwt.verify(token, jwtSecret);
      if (!payload.sub || payload.type) throw new Error('Invalid token');
      const user = await User.findById(payload.sub);
      if (!user || (payload.version ?? 0) !== user.resetPasswordVersion) throw new Error('Session expired');
      let session = await Session.findOne({ token: digest(token), userId: user._id, expires: { $gt: new Date() } });
      // Existing pre-upgrade JWTs become device sessions on their first request.
      if (!session && !payload.jti) session = await Session.create({ token: digest(token), userId: user._id, created: new Date(payload.iat * 1000), expires: new Date(payload.exp * 1000), unlocked: [] });
      if (!session || session.revoked) throw new Error('Session revoked');
      if (session.agent === 'New sign-in' || !session.agent) { session.agent = String(req.headers['user-agent'] || 'Unknown device').slice(0, 200); await session.save(); }
      if (!user.account) { defaults(user); user.markModified('account'); await user.save(); } req.auth = payload; req.accountUser = user; req.accountSession = session; next();
    } catch (error) { if (error.name === 'MongoServerError' || error.name === 'MongooseError') return next(error); res.status(401).json({ message: 'Your session has expired. Please sign in again.' }); }
  }
  const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
  const clean = (value, max) => { if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, 'Enter a valid value.'); return value.trim(); };
  const validPassword = value => { if (!passwordIsValid(value)) fail(400, 'Password must contain at least 10 characters and at most 72 UTF-8 bytes.'); return value; };
  async function confirmPassword(user, value) { if (typeof value !== 'string' || value.length > 128 || !user.passwordHash || !await bcrypt.compare(value, user.passwordHash)) fail(403, 'Current account password is incorrect. Google accounts must first set a password using password recovery.'); }
  const attempts = new Map();
  function limit(key) { const now = Date.now(); for (const [k, v] of attempts) if (v.until < now) attempts.delete(k); const v = attempts.get(key) || { count: 0, until: now + 900000 }; attempts.set(key, v); if (++v.count > 30) fail(429, 'Too many attempts. Try again in 15 minutes.'); }
  const handler = fn => async (req, res, next) => { try { await fn(req, res); } catch (e) { if (e.status) res.status(e.status).json({ message: e.message }); else next(e); } };
  const save = async (req, res) => { req.accountUser.markModified('account'); await req.accountUser.save(); res.json({ user: serializeUser(req.accountUser, req.accountSession) }); };
  app.get('/api/account', requireAuth, handler(async (req, res) => res.json({ user: serializeUser(req.accountUser, req.accountSession) })));
  app.patch('/api/account', requireAuth, handler(async (req, res) => {
    const user = req.accountUser, input = req.body;
    if (input.name !== undefined) user.name = clean(input.name, 50);
    if (input.email !== undefined || input.newPassword !== undefined) {
      limit(user.id + ':password'); await confirmPassword(user, input.currentPassword);
      if (input.email !== undefined) { const email = clean(input.email, 254).toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.'); if (await User.exists({ email, _id: { $ne: user._id } })) fail(409, 'Email already in use.'); user.email = email; }
      if (input.newPassword !== undefined) {
        user.passwordHash = await bcrypt.hash(validPassword(input.newPassword), 12);
        user.resetPasswordVersion += 1;
        await Session.deleteMany({ userId: user._id }); await user.save();
        const token = await createToken(user); setSession(res, token); return res.json({ ...(req.headers.authorization ? { token } : {}), user: serializeUser(user) });
      }
    }
    await save(req, res);
  }));
  app.post('/api/auth/logout', requireAuth, handler(async (req, res) => { await Session.updateOne({ _id: req.accountSession._id }, { $set: { revoked: true } }); clearSession(res); res.json({ ok: true }); }));
  app.delete('/api/account', requireAuth, handler(async (req, res) => {
    limit(req.auth.sub + ':password'); await confirmPassword(req.accountUser, req.body.password);
    const ownedReviews = await Review.find({ user: req.auth.sub }).select('_id').lean();
    if (mongoose.models.ReviewReport) await mongoose.model('ReviewReport').deleteMany({ $or: [{ user: req.auth.sub }, { review: { $in: ownedReviews.map(r => r._id) } }] });
    await Review.deleteMany({ user: req.auth.sub }); await Session.deleteMany({ userId: req.auth.sub }); await User.deleteOne({ _id: req.auth.sub }); clearSession(res); res.json({ ok: true });
  }));
  app.get('/api/account/export', requireAuth, handler(async (req, res) => {
    // Locked profile data is withheld until that profile has been unlocked.
    res.json({ account: serializeUser(req.accountUser, req.accountSession), reviews: await Review.find({ user: req.auth.sub }).select('-user -__v').lean() });
  }));
  app.patch('/api/account/preferences', requireAuth, handler(async (req, res) => {
    const p = req.accountUser.account.preferences, input = req.body;
    for (const key of ['subtitles', 'autoplay', 'notifications']) if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') fail(400, 'Preference must be true or false.'); p[key] = input[key]; }
    if (input.language !== undefined) { if (!['en-US','hi-IN','es-ES','fr-FR'].includes(input.language)) fail(400, 'Unsupported language.'); p.language = input.language; }
    if (input.quality !== undefined) { if (!['Auto','HD','Full HD','4K'].includes(input.quality)) fail(400, 'Unsupported quality.'); p.quality = input.quality; }
    await save(req, res);
  }));
  app.patch('/api/account/membership', requireAuth, handler(async (req, res) => {
    if (!['Free','Standard','Premium'].includes(req.body.plan) || !['active','cancelled'].includes(req.body.membership)) fail(400, 'Invalid membership.');
    Object.assign(req.accountUser.account, { plan: req.body.plan, membership: req.body.membership }); await save(req, res);
  }));
  app.get('/api/account/sessions', requireAuth, handler(async (req, res) => {
    const sessions = await Session.find({ userId: req.auth.sub, revoked: { $ne: true }, expires: { $gt: new Date() } });
    res.json({ sessions: sessions.map(s => ({ id: s.id, created: s.created, expires: s.expires, agent: s.agent, current: s.id === req.accountSession.id })) });
  }));
  app.delete('/api/account/sessions', requireAuth, handler(async (req, res) => {
    const query = { userId: req.auth.sub, _id: { $ne: req.accountSession._id } };
    if (req.body.allOthers !== undefined && typeof req.body.allOthers !== 'boolean') fail(400, 'Invalid device selection.');
    if (!req.body.allOthers) { if (!mongoose.isValidObjectId(req.body.id)) fail(400, 'Invalid device.'); query._id = { $eq: req.body.id, $ne: req.accountSession._id }; }
    await Session.updateMany(query, { $set: { revoked: true } }); res.json({ ok: true });
  }));
  app.post('/api/account/profiles', requireAuth, handler(async (req, res) => {
    const profiles = req.accountUser.account.profiles;
    if (profiles.length >= 5) fail(400, 'You can create up to five profiles.');
    if (req.body.kids !== undefined && typeof req.body.kids !== 'boolean') fail(400, 'Kids must be true or false.');
    profiles.push({ ...newProfile(clean(req.body.name, 30)), kids: req.body.kids === true }); await save(req, res);
  }));
  app.all('/api/account/profiles/:id/{*action}', requireAuth, profileHandler());
  app.all('/api/account/profiles/:id', requireAuth, profileHandler());
  function profileHandler() { return handler(async (req, res) => {
    const user = req.accountUser, profile = user.account.profiles.find(p => p.id === req.params.id);
    if (!profile) fail(404, 'Profile not found.');
    const action = (req.params.action || []).join('/'), input = req.body || {}, session = req.accountSession;
    if (action === 'unlock' && req.method === 'POST') {
      limit(user.id + ':pin'); if (profile.pin && (typeof input.pin !== 'string' || !/^\d{4}$/.test(input.pin) || !await bcrypt.compare(input.pin, profile.pin))) fail(403, 'Incorrect profile PIN.');
      if (!session.unlocked.includes(profile.id)) session.unlocked.push(profile.id); await session.save(); return save(req, res);
    }
    if (!action && req.method === 'PATCH') {
      if (input.pin !== undefined) { limit(user.id + ':password'); await confirmPassword(user, input.currentPassword); if (typeof input.pin !== 'string' || (input.pin !== '' && !/^\d{4}$/.test(input.pin))) fail(400, 'PIN must be four digits.'); profile.pin = input.pin ? await bcrypt.hash(input.pin, 12) : null; await Session.updateMany({ userId: user._id }, { $pull: { unlocked: profile.id } }); session.unlocked = session.unlocked.filter(id => id !== profile.id); }
      if (input.kids !== undefined && typeof input.kids !== 'boolean') fail(400, 'Kids must be true or false.');
      if (profile.pin && !session.unlocked.includes(profile.id) && input.pin === undefined) fail(403, 'Unlock this profile first.');
      if (input.name !== undefined) profile.name = clean(input.name, 30);
      if (typeof input.kids === 'boolean') profile.kids = input.kids;
    } else if (!action && req.method === 'DELETE') {
      if (profile.pin && !session.unlocked.includes(profile.id)) fail(403, 'Unlock this profile first.');
      if (user.account.profiles.length === 1) fail(400, 'Keep at least one profile.'); user.account.profiles = user.account.profiles.filter(p => p.id !== profile.id);
    } else {
      if (profile.pin && !session.unlocked.includes(profile.id)) fail(403, 'Unlock this profile first.');
      if (action === 'history' && req.method === 'DELETE') profile.history = [];
      else if (['history','watchlist'].includes(action) && req.method === 'POST') {
        const item = input.item;
        if (!item || !Number.isSafeInteger(item.id) || item.id <= 0 || !['movie','tv'].includes(item.type)) fail(400, 'Invalid title.');
        const entry = { id: item.id, type: item.type, title: clean(item.title, 200), poster: typeof item.poster === 'string' && /^\/[\w.-]+$/.test(item.poster) ? item.poster : null };
        if (action === 'history') profile.history = [{ ...entry, viewedAt: new Date().toISOString() }, ...profile.history.filter(i => i.id !== item.id || i.type !== item.type)].slice(0,100);
        else { const index = profile.watchlist.findIndex(i => i.id === item.id && i.type === item.type); if (index >= 0) profile.watchlist.splice(index,1); else { if (profile.watchlist.length >= 500) fail(400,'Watchlist is full.'); profile.watchlist.push(entry); } }
      } else if (action === 'ratings' && req.method === 'POST') { if (typeof input.key !== 'string' || ! /^(movie|tv):[1-9]\d{0,15}$/.test(input.key) || ![0,1,-1].includes(input.rating)) fail(400,'Invalid rating.'); if (!input.rating) delete profile.ratings[input.key]; else profile.ratings[input.key] = input.rating; }
      else fail(405, 'Method not allowed.');
    }
    await save(req,res);
  }); }
  return { createToken, serializeUser, requireAuth, Session };
};
