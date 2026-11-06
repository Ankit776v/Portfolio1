const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const igdb = require('./igdb.cjs').createIGDB();
const rawg = require('./rawg.cjs').createRAWG();
const { DatabaseSync } = require('node:sqlite');
const catalogue = require('./library.cjs').createLibrary();
function applyMetadata(item, metadata) {
  if (!metadata) return;
  if (metadata.platforms.length) item.platforms = metadata.platforms;
  if (metadata.genres.length) item.genre = metadata.genres.join(', ');
  if (metadata.developers.length) item.developer = metadata.developers.join(', ');
  if (metadata.release) { item.release = metadata.release; item.status = metadata.release > new Date().toISOString().slice(0,10) ? 'Upcoming' : 'Released'; }
}
const app = express();
const missionCatalog = require('./missions.json');
const directory = process.env.GAMESHUB_DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(path.join(directory, 'gameshub.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
  CREATE TABLE IF NOT EXISTS discussions(
    id INTEGER PRIMARY KEY, game_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK(mode IN ('spoiler-free','deep-dive')),
    parent_id INTEGER REFERENCES discussions(id), author TEXT NOT NULL,
    body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS discussion_scope ON discussions(game_id,mode,parent_id,id);`);
db.exec(`
 CREATE TABLE IF NOT EXISTS correction_reports (
 id INTEGER PRIMARY KEY, game_id TEXT NOT NULL, section TEXT NOT NULL,
 description TEXT NOT NULL, source_url TEXT, status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS reading_progress (
 reader_id TEXT NOT NULL, game_id TEXT NOT NULL, chapter_index INTEGER NOT NULL DEFAULT 0,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(reader_id,game_id));
 CREATE TABLE IF NOT EXISTS bookmarks (
 reader_id TEXT NOT NULL, game_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(reader_id,game_id));
 CREATE INDEX IF NOT EXISTS corrections_game ON correction_reports(game_id,status);
`);
const readerPattern = /^[a-zA-Z0-9_-]{20,90}$/;
function readerId(req,res,next){
 const id=req.get('X-Gameshub-Reader');
 if(!id || !readerPattern.test(id)) return res.status(400).json({error:'Missing reader identifier.'});
 req.readerId=id; next();
}
const correctionsLimit = new Map();
app.disable('x-powered-by');
app.use(express.json({ limit: '12kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
  if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
  next();
});
const modes = new Set(['spoiler-free', 'deep-dive']);
const buckets = new Map();
function game(req, res, next) {
  req.game = catalogue.find(item => item.id === req.params.id);
  if (!req.game) return res.status(404).json({ error: 'Game not found.' });
  next();
}
function mode(req, res, next) {
  req.mode = req.query.mode || 'spoiler-free';
  if (!modes.has(req.mode)) return res.status(400).json({ error: 'Choose spoiler-free or deep-dive mode.' });
  next();
}
const summary = item => ({ id: item.id, title: item.title, year: item.year, developer: item.developer,
  genre: item.genre, franchise: item.franchise, subseries: item.subseries || '', platforms: item.platforms,
  status: item.status, hasDossier: item.hasDossier, aliases: item.aliases || [],
  tagline: item.tagline, image: /^https:\/\//i.test(item.image) ? item.image : `/gameshub/images/${item.image}`, accent: item.accent,
  characters: item.characters.length, chapters: item.story.length });
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.get('/api/games', (req, res) => res.json({ games: catalogue.map(summary), igdb: { configured: igdb.configured }, rawg: { configured: rawg.configured } }));
const upstream = handler => async (req, res) => {
  try { await handler(req, res); }
  catch (error) { res.status([400,429,503].includes(error.status) ? error.status : 502).json({ error: error.status ? error.message : 'IGDB is temporarily unavailable.' }); }
};
app.get('/api/igdb/status', (req, res) => res.json({ configured: igdb.configured }));
app.get('/api/rawg/status', (req, res) => res.json({ configured: rawg.configured }));
app.get('/api/rawg/library', upstream(async (req, res) => {
  if (!rawg.configured) return res.status(503).json({ error: 'RAWG images are not configured on this server.' });
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(','))] : [];
  if (!ids.length || ids.length > 18 || ids.some(id => !catalogue.some(g => g.id === id))) return res.status(400).json({ error: 'Choose 1 to 18 library game IDs.' });
  res.json({ matches: await rawg.library(ids.map(id => catalogue.find(g => g.id === id))) });
}));
app.get('/api/games/:id/media', game, upstream(async (req, res) => res.json({ media: await rawg.detail(req.game) })));
app.get('/api/igdb/search', upstream(async (req, res) => res.json({ games: await igdb.search(req.query.q) })));
app.get('/api/igdb/library', upstream(async (req, res) => {
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(','))] : [];
  if (!ids.length || ids.length > 18 || ids.some(id => !catalogue.some(g => g.id === id))) return res.status(400).json({ error: 'Choose 1 to 18 library game IDs.' });
  res.json({ matches: await igdb.match(ids.map(id => catalogue.find(g => g.id === id))) });
}));
app.get('/api/metadata', upstream(async (req, res) => {
  const ids = typeof req.query.ids === 'string' ? [...new Set(req.query.ids.split(','))] : [];
  if (!ids.length || ids.length > 18 || ids.some(id => !catalogue.some(g => g.id === id))) return res.status(400).json({ error: 'Choose 1 to 18 library game IDs.' });
  const matches = await igdb.match(ids.map(id => catalogue.find(g => g.id === id)));
  for (const match of matches) applyMetadata(catalogue.find(g => g.id === match.localId), match.game);
  res.json({ games: ids.map(id => summary(catalogue.find(g => g.id === id))) });
}));
app.get('/api/games/:id/igdb', game, mode, upstream(async (req, res) => res.json({ game: await igdb.detail(req.game, req.mode === 'deep-dive') })));
app.get('/api/games/:id', game, mode, async (req, res) => {
  const item = req.game;
  // Keep the authored dossier fast; optional provider metadata loads through /api/games/:id/igdb.
  const deep = req.mode === 'deep-dive';
  res.json({ ...summary(item), mode: req.mode, release: item.release, tone: item.tone,
    setting: item.setting, history: item.history, timeline: item.timeline,
    characters: item.characters.map(character => ({ name: character.name, role: character.role,
      bio: deep ? `${character.safe} ${character.deep}` : character.safe })),
    ...(deep ? { story: item.story } : {}),
    sources: item.sources.filter(source => deep || source[2] === 'safe').map(([label, url]) => ({ label, url })),
  });
});
app.get('/api/games/:id/missions', game, mode, (req,res) => {
 const missions = missionCatalog[req.game.id] || [];
 res.json({gameId:req.game.id, coverage:missions.length?'curated':'unavailable',
  missions:req.mode==='deep-dive'?missions:[], total:req.mode==='deep-dive'?missions.length:0});
});
app.get('/api/games/:id/relationships', game, mode, (req,res) => {
 const people=req.game.characters.map(c=>c.name);
 const links=[];
 for(const other of catalogue){if(other.id===req.game.id)continue;
  for(const name of people){if(other.characters.some(c=>c.name.toLowerCase()===name.toLowerCase()))
   links.push({character:name,gameId:other.id,gameTitle:other.title});}}
 res.json({links:req.mode==='deep-dive'?links:[],notice:'Shared names are candidate cross-game appearances, not verified identity matches.'});
});
app.get('/api/me/library', readerId, (req,res)=>{
 const bookmarks=db.prepare('SELECT game_id FROM bookmarks WHERE reader_id=?').all(req.readerId).map(x=>x.game_id);
 const progress=db.prepare('SELECT game_id,chapter_index,updated_at FROM reading_progress WHERE reader_id=?').all(req.readerId);
 res.json({bookmarks,progress});
});
app.put('/api/me/bookmarks/:id', readerId, game, (req,res)=>{
 db.prepare('INSERT OR IGNORE INTO bookmarks(reader_id,game_id) VALUES(?,?)').run(req.readerId,req.game.id);
 res.json({bookmarked:true});
});
app.delete('/api/me/bookmarks/:id', readerId, game, (req,res)=>{
 db.prepare('DELETE FROM bookmarks WHERE reader_id=? AND game_id=?').run(req.readerId,req.game.id);
 res.json({bookmarked:false});
});
app.put('/api/me/progress/:id', readerId, game, (req,res)=>{
 const index=req.body?.chapterIndex;
 if(!Number.isSafeInteger(index)||index<0||index>=req.game.story.length) return res.status(400).json({error:'Invalid story chapter.'});
 db.prepare(`INSERT INTO reading_progress(reader_id,game_id,chapter_index) VALUES(?,?,?)
 ON CONFLICT(reader_id,game_id) DO UPDATE SET chapter_index=excluded.chapter_index,updated_at=CURRENT_TIMESTAMP`).run(req.readerId,req.game.id,index);
 res.json({saved:true,chapterIndex:index});
});
app.post('/api/games/:id/corrections', game, (req,res)=>{
 const origin=req.get('origin');
 const allowed=process.env.PUBLIC_ORIGIN || `${req.protocol}://${req.get('host')}`;
 if(origin!==allowed) return res.status(403).json({error:'Open GamesHub on this server to report a correction.'});
 const {section,description,sourceUrl=''}=req.body||{};
 if(typeof section!=='string'||!['world','history','characters','story','missions','sources'].includes(section)||typeof description!=='string'||description.trim().length<15||description.length>2000||typeof sourceUrl!=='string'||sourceUrl.length>500|| (sourceUrl && !/^https:\/\//.test(sourceUrl))) return res.status(400).json({error:'Provide a section and a description of 15–2000 characters, with an optional HTTPS source.'});
 const key=req.socket.remoteAddress||'local',now=Date.now(),recent=correctionsLimit.get(key)||[];
 const active=recent.filter(t=>now-t<3600000);
 if(active.length>=5) return res.status(429).json({error:'Correction report limit reached. Try again later.'});
 active.push(now);correctionsLimit.set(key,active);
 db.prepare('INSERT INTO correction_reports(game_id,section,description,source_url) VALUES(?,?,?,?)').run(req.game.id,section,description.trim(),sourceUrl);
 res.status(201).json({submitted:true,status:'pending'});
});
app.get('/api/games/:id/discussions', game, mode, (req, res) => {
  const threads = db.prepare('SELECT * FROM discussions WHERE game_id=? AND mode=? AND parent_id IS NULL ORDER BY id DESC LIMIT 30').all(req.game.id, req.mode);
  const replies = db.prepare('SELECT * FROM discussions WHERE parent_id=? AND game_id=? AND mode=? ORDER BY id LIMIT 50');
  res.json({ mode: req.mode, threads: threads.map(thread => ({ ...thread, replies: replies.all(thread.id, req.game.id, req.mode) })) });
});
app.post('/api/games/:id/discussions', game, (req, res) => {
  const trusted = new Set([process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`,
    ...(process.env.NODE_ENV === 'production' ? [] : JSON.parse(process.env.PORTFOLIO_LOCAL_ORIGINS || '[]'))]);
  if (!trusted.has(req.headers.origin)) return res.status(403).json({ error: 'Open Gameshub on this server to post.' });
  if (!req.is('application/json')) return res.status(415).json({ error: 'Use JSON to post a discussion.' });
  const { author, body, mode: readingMode, parentId = null } = req.body || {};
  if (!modes.has(readingMode) || typeof author !== 'string' || typeof body !== 'string' || author.trim().length < 2 || author.trim().length > 40 || body.trim().length < 3 || body.trim().length > 2000) {
    return res.status(400).json({ error: 'Use a name of 2–40 characters and a message of 3–2,000 characters.' });
  }
  if (parentId !== null && (!Number.isSafeInteger(parentId) || !db.prepare('SELECT id FROM discussions WHERE id=? AND game_id=? AND mode=? AND parent_id IS NULL').get(parentId, req.game.id, readingMode))) {
    return res.status(400).json({ error: 'That discussion does not belong to this game and reading mode.' });
  }
  const now = Date.now();
  for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key);
  const key = req.socket.remoteAddress || 'local';
  const bucket = buckets.get(key) || { count: 0, until: now + 60000 };
  if (bucket.count >= 10 || (!buckets.has(key) && buckets.size >= 10000)) return res.status(429).json({ error: 'A few too many posts. Please try again in a minute.' });
  bucket.count += 1; buckets.set(key, bucket);
  const result = db.prepare('INSERT INTO discussions(game_id,mode,parent_id,author,body) VALUES(?,?,?,?,?)').run(req.game.id, readingMode, parentId, author.trim(), body.trim());
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});
app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html', dotfiles: 'deny' }));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  res.status(error.status === 413 ? 413 : error instanceof SyntaxError ? 400 : 500).json({ error: error.status === 413 ? 'Message too large.' : error instanceof SyntaxError ? 'Invalid JSON.' : 'Gameshub could not complete the request.' });
});
if (require.main === module) app.listen(process.env.PORT || 3004, '0.0.0.0', () => console.log(`Gameshub: http://localhost:${process.env.PORT || 3004}`));
module.exports = { app, db };
