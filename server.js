<<<<<<< HEAD
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
// Reuse local credentials without inheriting the standalone port or callback URL.
const legacyEnvPath = path.join(__dirname, 'Movieshub/server/.env');
if (fs.existsSync(legacyEnvPath)) {
  const legacy = require('dotenv').parse(fs.readFileSync(legacyEnvPath));
  for (const key of ['MONGODB_URI', 'JWT_SECRET', 'TMDB_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    if (process.env[key] === undefined && legacy[key] !== undefined) process.env[key] = legacy[key];
  }
}

function scopeCookies(base) {
  return (req, res, next) => {
    const setHeader = res.setHeader;
    res.setHeader = function (name, value) {
      if (name.toLowerCase() === 'set-cookie') {
        const scope = cookie => /;\s*path=/i.test(cookie)
          ? cookie.replace(/;\s*path=[^;]*/i, `; Path=${base}/`)
          : `${cookie}; Path=${base}/`;
        value = Array.isArray(value) ? value.map(scope) : scope(value);
      }
      return setHeader.call(this, name, value);
    };
    next();
  };
}

async function createPortfolio({ database, env = process.env, startCatalogue = true } = {}) {
  const port = Number(env.PORT || 3000);
  // Render provides its own canonical HTTPS URL, so deployments do not need
  // a manually maintained PUBLIC_ORIGIN value. Keep the explicit override for
  // custom domains and localhost for local development.
  const origin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  const networkOrigins = env.NODE_ENV === 'production' ? [] : require('./scripts/local-network.cjs').localOrigins(port);
  if (new URL(origin).origin !== origin) throw new Error('PUBLIC_ORIGIN must be an exact origin without a trailing slash.');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters in .env.');
  if (env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production PUBLIC_ORIGIN must use HTTPS.');
  if (!fs.existsSync(path.join(__dirname, 'Movieshub/client/dist/index.html'))) throw new Error('Run npm run build before starting the portfolio.');

  // One optional persistent volume, with separate files/directories for each app.
  if (env.PORTFOLIO_DATA_DIR) {
    const data = path.resolve(env.PORTFOLIO_DATA_DIR);
    process.env.CONNECTHUB_DATA_DIR = path.join(data, 'connecthub');
    process.env.DATA_DIR = path.join(data, 'shopsphere');
    process.env.DB_PATH = path.join(data, 'sprintboard/sprintboard.sqlite');
    process.env.GAMESHUB_DATA_DIR = path.join(data, 'gameshub');
  }
  process.env.PUBLIC_ORIGIN = origin;
  process.env.PORTFOLIO_LOCAL_ORIGINS = JSON.stringify(networkOrigins);
  process.env.PUBLIC_URL = `${origin}/shopsphere`;
  process.env.COOKIE_SECURE = env.NODE_ENV === 'production' ? 'true' : 'false';

  // Resolve the same mongoose instance used by Movieshub, even with existing nested installs.
  const movieRequire = createRequire(path.join(__dirname, 'Movieshub/server/package.json'));
  const mongoose = database || movieRequire('mongoose');
  if (!database) {
    const mongoUri = env.MONGODB_URI?.trim();
    if (!mongoUri) {
      throw new Error('MONGODB_URI is missing. Add it to the Render service environment (or .env locally), then restart the service.');
    }
    if (!/^mongodb(?:\+srv)?:\/\//i.test(mongoUri)) {
      throw new Error('MONGODB_URI must start with mongodb:// or mongodb+srv://.');
    }
    try {
      await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });
    } catch (error) {
      const reason = error?.message ? ` Details: ${error.message}` : '';
      throw new Error(`Could not connect to MongoDB Atlas. Check the cluster host, database user/password, and Atlas Network Access IP allowlist. If the password contains special characters, URL-encode it.${reason}`);
    }
  }
  let connect, shop, sprint, movies, games;
  try {
    connect = require('./connecthub/server');
    shop = require('./shopsphere/server');
    sprint = require('./sprintboard/server');
    games = require('./Gameshub/server');
    movies = require('./Movieshub/server/app').createApp({ database: mongoose, allowedOrigins: networkOrigins,
      env: { ...env, CLIENT_ORIGIN: origin, MOVIESHUB_BASE_PATH: '/movieshub' } });

    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      // A browser refresh should always pick up local edits and the latest SPA entry.
      if (process.env.NODE_ENV !== 'production' && req.method === 'GET') res.set('Cache-Control', 'no-store');
      next();
    });
    app.get('/healthz', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable', projects: 5 }));
    app.get('/portfolio-app.js', (req, res) => res.sendFile(path.join(__dirname, 'portfolio-app.js')));
    app.get('/movieshub/portfolio-entry.json', (req, res) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'Movieshub/client/dist/.vite/manifest.json'), 'utf8'));
      const entry = manifest['src/portfolio.jsx'];
      const css = new Set();
      const seen = new Set();
      function collect(key) {
        if (seen.has(key)) return;
        seen.add(key);
        const chunk = manifest[key];
        for (const file of chunk?.css || []) css.add(`/movieshub/${file}`);
        for (const imported of chunk?.imports || []) collect(imported);
      }
      collect('src/portfolio.jsx');
      res.json({ entry: `/movieshub/${entry.file}`, css: [...css] });
    });
    const routes = [
      ['/connecthub', connect.app],
      ['/shopsphere', (req, res) => shop.server.emit('request', req, res)],
      ['/sprintboard', (req, res) => sprint.server.emit('request', req, res)],
      ['/movieshub', movies.app],
      ['/gameshub', games.app]
    ];
    for (const [base, handler] of routes) {
      app.get(base, (req, res, next) => req.path.endsWith('/') ? next() : res.redirect(308, `${base}/${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
      // Document requests and refreshes enter the persistent SPA shell. API and
      // asset requests continue to their existing project backends unchanged.
      app.use(base, (req, res, next) => {
        const pathname = req.path;
        const documentRequest = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
        if (documentRequest && !pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(pathname)) {
          return res.sendFile(path.join(__dirname, 'index.html'));
        }
        next();
      });
      app.use(base, scopeCookies(base), handler);
    }
    // Explicit public files only: never expose repositories, secrets or databases.
    app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
    app.get('/ankit-professional.png', (req, res) => res.sendFile(path.join(__dirname, 'ankit-professional.png')));
    app.use('/icons', express.static(path.join(__dirname, 'icons'), { index: false, dotfiles: 'deny' }));
    app.use('/assets/projects', express.static(path.join(__dirname, 'assets/projects'), { index: false, dotfiles: 'deny' }));
    app.use((req, res) => res.status(404).send('Page not found.'));
    const server = http.createServer(app);
    connect.io.path('/connecthub/socket.io');
    connect.io.attach(server);
    if (startCatalogue) movies.catalogue.start();
    async function close() {
      movies.catalogue.stop();
      await new Promise(resolve => connect.io.close(resolve));
      if (server.listening) await new Promise(resolve => server.close(resolve));
      connect.db.close(); shop.db.close(); sprint.db.close();
      games.db.close();
      if (!database) await mongoose.disconnect();
    }
    return { server, close, origin, networkOrigins };
  } catch (error) {
    movies?.catalogue.stop();
    connect?.io.close(); connect?.db.close(); shop?.db.close(); sprint?.db.close();
    games?.db.close();
    if (!database) await mongoose.disconnect();
    throw error;
  }
}

async function main() {
  require('./scripts/ensure-build.cjs').ensureBuild();
  const portfolio = await createPortfolio();
  portfolio.server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log(`Let's Rock it: ${portfolio.origin}`);
    for (const url of portfolio.networkOrigins.filter(url => !url.includes('localhost') && !url.includes('127.0.0.1'))) console.log(`We're on your all devices: ${url}`);
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000); timeout.unref();
    await portfolio.close(); clearTimeout(timeout);
  }
  process.on('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
  process.on('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
  portfolio.server.on('error', error => { console.error(error.message); stop().finally(() => { process.exitCode = 1; }); });
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createPortfolio };
=======
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { createRequire } = require('node:module');
const express = require('express');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
// Reuse local credentials without inheriting the standalone port or callback URL.
const legacyEnvPath = path.join(__dirname, 'Movieshub/server/.env');
if (fs.existsSync(legacyEnvPath)) {
  const legacy = require('dotenv').parse(fs.readFileSync(legacyEnvPath));
  for (const key of ['MONGODB_URI', 'JWT_SECRET', 'TMDB_API_KEY', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    if (process.env[key] === undefined && legacy[key] !== undefined) process.env[key] = legacy[key];
  }
}

function scopeCookies(base) {
  return (req, res, next) => {
    const setHeader = res.setHeader;
    res.setHeader = function (name, value) {
      if (name.toLowerCase() === 'set-cookie') {
        const scope = cookie => /;\s*path=/i.test(cookie)
          ? cookie.replace(/;\s*path=[^;]*/i, `; Path=${base}/`)
          : `${cookie}; Path=${base}/`;
        value = Array.isArray(value) ? value.map(scope) : scope(value);
      }
      return setHeader.call(this, name, value);
    };
    next();
  };
}

async function createPortfolio({ database, env = process.env, startCatalogue = true } = {}) {
  const port = Number(env.PORT || 3000);
  // Render provides its own canonical HTTPS URL, so deployments do not need
  // a manually maintained PUBLIC_ORIGIN value. Keep the explicit override for
  // custom domains and localhost for local development.
  const origin = env.PUBLIC_ORIGIN || env.RENDER_EXTERNAL_URL || `http://localhost:${port}`;
  const networkOrigins = env.NODE_ENV === 'production' ? [] : require('./scripts/local-network.cjs').localOrigins(port);
  if (new URL(origin).origin !== origin) throw new Error('PUBLIC_ORIGIN must be an exact origin without a trailing slash.');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) throw new Error('Set JWT_SECRET to a random value of at least 32 characters in .env.');
  if (env.NODE_ENV === 'production' && !origin.startsWith('https://')) throw new Error('Production PUBLIC_ORIGIN must use HTTPS.');
  if (!fs.existsSync(path.join(__dirname, 'Movieshub/client/dist/index.html'))) throw new Error('Run npm run build before starting the portfolio.');

  // One optional persistent volume, with separate files/directories for each app.
  if (env.PORTFOLIO_DATA_DIR) {
    const data = path.resolve(env.PORTFOLIO_DATA_DIR);
    process.env.CONNECTHUB_DATA_DIR = path.join(data, 'connecthub');
    process.env.DATA_DIR = path.join(data, 'shopsphere');
    process.env.DB_PATH = path.join(data, 'sprintboard/sprintboard.sqlite');
    process.env.GAMESHUB_DATA_DIR = path.join(data, 'gameshub');
  }
  process.env.PUBLIC_ORIGIN = origin;
  process.env.PORTFOLIO_LOCAL_ORIGINS = JSON.stringify(networkOrigins);
  process.env.PUBLIC_URL = `${origin}/shopsphere`;
  process.env.COOKIE_SECURE = env.NODE_ENV === 'production' ? 'true' : 'false';

  // Resolve the same mongoose instance used by Movieshub, even with existing nested installs.
  const movieRequire = createRequire(path.join(__dirname, 'Movieshub/server/package.json'));
  const mongoose = database || movieRequire('mongoose');
  if (!database) {
    if (!env.MONGODB_URI) throw new Error('Set MONGODB_URI in .env (local MongoDB or MongoDB Atlas).');
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  }
  let connect, shop, sprint, movies, games;
  try {
    connect = require('./connecthub/server');
    shop = require('./shopsphere/server');
    sprint = require('./sprintboard/server');
    games = require('./Gameshub/server');
    movies = require('./Movieshub/server/app').createApp({ database: mongoose, allowedOrigins: networkOrigins,
      env: { ...env, CLIENT_ORIGIN: origin, MOVIESHUB_BASE_PATH: '/movieshub' } });

    const app = express();
    app.disable('x-powered-by');
    app.use((req, res, next) => {
      // A browser refresh should always pick up local edits and the latest SPA entry.
      if (process.env.NODE_ENV !== 'production' && req.method === 'GET') res.set('Cache-Control', 'no-store');
      next();
    });
    app.get('/healthz', (req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503)
      .json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'unavailable', projects: 5 }));
    app.get('/portfolio-app.js', (req, res) => res.sendFile(path.join(__dirname, 'portfolio-app.js')));
    app.get('/movieshub/portfolio-entry.json', (req, res) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'Movieshub/client/dist/.vite/manifest.json'), 'utf8'));
      const entry = manifest['src/portfolio.jsx'];
      const css = new Set();
      const seen = new Set();
      function collect(key) {
        if (seen.has(key)) return;
        seen.add(key);
        const chunk = manifest[key];
        for (const file of chunk?.css || []) css.add(`/movieshub/${file}`);
        for (const imported of chunk?.imports || []) collect(imported);
      }
      collect('src/portfolio.jsx');
      res.json({ entry: `/movieshub/${entry.file}`, css: [...css] });
    });
    const routes = [
      ['/connecthub', connect.app],
      ['/shopsphere', (req, res) => shop.server.emit('request', req, res)],
      ['/sprintboard', (req, res) => sprint.server.emit('request', req, res)],
      ['/movieshub', movies.app],
      ['/gameshub', games.app]
    ];
    for (const [base, handler] of routes) {
      app.get(base, (req, res, next) => req.path.endsWith('/') ? next() : res.redirect(308, `${base}/${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`));
      // Document requests and refreshes enter the persistent SPA shell. API and
      // asset requests continue to their existing project backends unchanged.
      app.use(base, (req, res, next) => {
        const pathname = req.path;
        const documentRequest = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
        if (documentRequest && !pathname.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(pathname)) {
          return res.sendFile(path.join(__dirname, 'index.html'));
        }
        next();
      });
      app.use(base, scopeCookies(base), handler);
    }
    // Explicit public files only: never expose repositories, secrets or databases.
    app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
    app.get('/ankit-professional.png', (req, res) => res.sendFile(path.join(__dirname, 'ankit-professional.png')));
    app.use('/assets/projects', express.static(path.join(__dirname, 'assets/projects'), { index: false, dotfiles: 'deny' }));
    app.use((req, res) => res.status(404).send('Page not found.'));
    const server = http.createServer(app);
    connect.io.path('/connecthub/socket.io');
    connect.io.attach(server);
    if (startCatalogue) movies.catalogue.start();
    async function close() {
      movies.catalogue.stop();
      await new Promise(resolve => connect.io.close(resolve));
      if (server.listening) await new Promise(resolve => server.close(resolve));
      connect.db.close(); shop.db.close(); sprint.db.close();
      games.db.close();
      if (!database) await mongoose.disconnect();
    }
    return { server, close, origin, networkOrigins };
  } catch (error) {
    movies?.catalogue.stop();
    connect?.io.close(); connect?.db.close(); shop?.db.close(); sprint?.db.close();
    games?.db.close();
    if (!database) await mongoose.disconnect();
    throw error;
  }
}

async function main() {
  require('./scripts/ensure-build.cjs').ensureBuild();
  const portfolio = await createPortfolio();
  portfolio.server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
    console.log(`Let's Rock it: ${portfolio.origin}`);
    for (const url of portfolio.networkOrigins.filter(url => !url.includes('localhost') && !url.includes('127.0.0.1'))) console.log(`We're on your all devices: ${url}`);
  });
  let stopping = false;
  async function stop() {
    if (stopping) return;
    stopping = true;
    const timeout = setTimeout(() => process.exit(1), 10000); timeout.unref();
    await portfolio.close(); clearTimeout(timeout);
  }
  process.on('SIGINT', () => stop().catch(() => { process.exitCode = 1; }));
  process.on('SIGTERM', () => stop().catch(() => { process.exitCode = 1; }));
  portfolio.server.on('error', error => { console.error(error.message); stop().finally(() => { process.exitCode = 1; }); });
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { createPortfolio };
>>>>>>> b19d639fa83cc137745cde98d65237c9121a04cb
