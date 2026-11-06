const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');

test('one server hosts all five projects without route or session collisions', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'portfolio-test-'));
  process.env.PORTFOLIO_DATA_DIR = directory;
  process.env.NODE_ENV = 'development';
  process.env.IGDB_CLIENT_ID = '';
  process.env.IGDB_CLIENT_SECRET = '';
  process.env.RAWG_API_KEY = '';
  const movieRequire = createRequire(path.resolve('Movieshub/server/package.json'));
  const database = new (movieRequire('mongoose').Mongoose)();
  const dbName = 'movieshub_test_' + crypto.randomBytes(8).toString('hex');
  let mongoAvailable = true;
  try { await database.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 3000 }); }
  catch { mongoAvailable = false; }
  const { createPortfolio } = require('../server');
  const portfolio = await createPortfolio({ database, startCatalogue: false,
    env: { ...process.env, JWT_SECRET: crypto.randomBytes(48).toString('hex'), PUBLIC_ORIGIN: 'http://localhost:3000' } });
  await new Promise(resolve => portfolio.server.listen(0, '0.0.0.0', resolve));
  const origin = `http://127.0.0.1:${portfolio.server.address().port}`;
  t.after(async () => {
    await portfolio.close();
    if (mongoAvailable) { assert.match(database.connection.name, /^movieshub_test_[a-f0-9]{16}$/); await database.connection.dropDatabase(); }
    await database.disconnect();
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    assert.ok(path.basename(resolved).startsWith('portfolio-test-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  const get = url => fetch(origin + url);
  async function json(url, body, cookie = '', method = 'POST') {
    return fetch(origin + url, { method, headers: { 'Content-Type': 'application/json', Origin: url.startsWith('/sprintboard') ? 'http://localhost:3000' : origin, Cookie: cookie }, body: JSON.stringify(body) });
  }
  const session = response => response.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

  await t.test('local network access permits device sessions and rejects unrelated origins', async () => {
    const { localOrigins } = require('../scripts/local-network.cjs');
    const sample = localOrigins(3000, { WiFi: [{ family: 'IPv4', internal: false, address: '192.168.1.20' }], Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1' }] });
    assert.ok(sample.includes('http://192.168.1.20:3000'));
    const networkOrigin = portfolio.networkOrigins.find(url => !url.includes('localhost') && !url.includes('127.0.0.1')) || 'http://127.0.0.1:3000';
    const networkPage = await fetch(`http://${new URL(networkOrigin).hostname}:${portfolio.server.address().port}/`, { signal: AbortSignal.timeout(5000) });
    assert.equal(networkPage.status, 200);
    const apps = [
      ['connecthub', '/api/signup', '/api/logout'],
      ['sprintboard', '/api/register', '/api/logout'],
      ['shopsphere', '/api/auth/register', '/api/auth/logout'],
      ...(mongoAvailable ? [['movieshub', '/api/auth/register', '/api/auth/logout']] : []),
    ];
    for (const [slug, register, logout] of apps) {
      const headers = { 'Content-Type': 'application/json', Origin: networkOrigin, Host: new URL(networkOrigin).host };
      const signedUp = await fetch(origin + '/' + slug + register, { method: 'POST', headers,
        body: JSON.stringify({ name: 'LAN Tester', email: `lan-${slug}@test.example`, password: 'TestPassword123!' }) });
      assert.ok([200, 201].includes(signedUp.status), `${slug}: ${await signedUp.clone().text()}`);
      assert.doesNotMatch(signedUp.headers.get('set-cookie'), /;\s*Secure/i);
      const cookie = session(signedUp);
      const signedOut = await fetch(origin + '/' + slug + logout, { method: 'POST', headers: { ...headers, Cookie: cookie }, body: '{}' });
      assert.equal(signedOut.status, 200, `${slug} LAN session mutation`);
    }
    for (const slug of ['sprintboard', 'movieshub']) {
      const denied = await fetch(origin + '/' + slug + '/api/' + (slug === 'movieshub' ? 'auth/' : '') + 'register', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example' }, body: '{}',
      });
      assert.equal(denied.status, 403);
    }
  });

  await t.test('portfolio cards, app pages, assets, deep links and private files', async () => {
    const home = await get('/'); assert.equal(home.status, 200);
    const html = await home.text();
    for (const name of ['connecthub', 'shopsphere', 'sprintboard', 'movieshub', 'gameshub']) {
      assert.ok(html.includes(`href="/${name}/"`));
      const redirect = await fetch(origin + '/' + name, { redirect: 'manual' });
      assert.equal(redirect.status, 308); assert.equal(redirect.headers.get('location'), `/${name}/`);
      const page = await get(`/${name}/`); assert.equal(page.status, 200);
      const body = await page.text();
      const assets = [...body.matchAll(/(?:src|href)="([^"#]+\.(?:js|css|svg))"/g)].map(m => m[1]);
      for (const asset of assets.filter(a => !a.startsWith('http'))) {
        const assetPath = new URL(asset, origin + `/${name}/`).pathname;
        const response = await get(assetPath); assert.equal(response.status, 200, assetPath);
        assert.match(response.headers.get('content-type'), /javascript|css|svg/);
      }
    }
    assert.equal((await get('/movieshub/login')).status, 200);
    assert.equal((await get('/movieshub/movie/0')).status, 200);
    for (const route of ['/connecthub/', '/shopsphere/', '/sprintboard/', '/movieshub/login', '/movieshub/movie/0', '/gameshub/']) {
      const response = await fetch(origin + route, { headers: { Accept: 'text/html' } });
      assert.equal(response.status, 200);
      assert.ok((await response.text()).includes('data-portfolio-spa'), route);
    }
    const shellModule = await get('/portfolio-app.js');
    assert.match(shellModule.headers.get('content-type'), /javascript/);
    const entry = await (await get('/movieshub/portfolio-entry.json')).json();
    assert.ok(entry.entry.startsWith('/movieshub/assets/'));
    assert.match(await (await get(entry.entry)).text(), /mountProject/);
    assert.ok(entry.css.length > 0);
    for (const file of ['/.env', '/server.js', '/package.json', '/connecthub/server.js', '/shopsphere/data/shopsphere.sqlite', '/api/me']) {
      assert.equal((await get(file)).status, 404, file);
    }
  });

  await t.test('Gameshub separates spoilers, game dossiers and persistent discussion replies', async () => {
    const catalogue = require('../Gameshub/catalogue.json');
    const listing = await (await get('/gameshub/api/games')).json();
    const editableList = require('../Gameshub/mlist.jsx');
    assert.equal(listing.games.length, editableList.length);
    assert.equal(new Set(listing.games.map(game => game.id)).size, listing.games.length);
    assert.ok(listing.games.every(game => Array.isArray(game.platforms)));
    assert.ok(editableList.every(game => Object.keys(game).sort().join(',') === 'franchise,title,year'));
    assert.equal(listing.games.find(game=>game.title==='Portal').id,'portal');
    for (const title of ['Super Mario Bros.', 'Mario Kart World', 'Mario Tennis Fever', 'Contra', 'Contra: Operation Galuga', 'Contra Burst', 'Grand Theft Auto: San Andreas', 'Grand Theft Auto VI']) {
      assert.ok(listing.games.some(game => game.title === title), title);
    }
    assert.ok(listing.games.find(game => game.title === 'Grand Theft Auto VI'));
    const { createLibrary } = require('../Gameshub/library.cjs');
    const minimal = createLibrary([{ title: 'A New Game', year: 2000, franchise: 'Test' }], [])[0];
    assert.equal(minimal.id, 'a-new-game-2000');
    assert.equal(minimal.hasDossier, false);
    assert.deepEqual(minimal.platforms, []);
    assert.throws(() => createLibrary([{ year: 2000 }], []), /title/);
    assert.equal(new Set(createLibrary([{title:'Same',year:2000},{title:'Same',year:2001}],[]).map(g=>g.id)).size,2);
    assert.throws(() => createLibrary([{ title: 'Same', platforms: ['PC'] }, { title: 'Same', platforms: ['PC'] }], []), /duplicate/);
    const mario = listing.games.find(game => game.title === 'Super Mario Bros.' && game.year === 1985);
    const marioDetail = await (await get('/gameshub/api/games/' + mario.id)).json();
    assert.equal(marioDetail.title, mario.title);
    assert.equal(marioDetail.hasDossier, false);
    assert.deepEqual(marioDetail.characters, []);
    assert.equal(marioDetail.story, undefined);
    for (const franchise of ['Mario', 'Contra', 'GTA']) {
      const artwork = await get(listing.games.find(game => game.franchise === franchise).image);
      assert.equal(artwork.status, 200);
      assert.match(artwork.headers.get('content-type'), /svg/);
    }
    for (const original of catalogue) {
      const safe = await (await get('/gameshub/api/games/' + original.id)).json();
      assert.equal(safe.mode, 'spoiler-free');
      assert.equal(safe.story, undefined);
      assert.deepEqual(safe.characters.map(character => character.bio), original.characters.map(character => character.safe));
      assert.ok(safe.sources.every(source => !source.label.includes('spoilers')));
      const deep = await (await get('/gameshub/api/games/' + original.id + '?mode=deep-dive')).json();
      assert.deepEqual(deep.story, original.story);
      assert.ok(deep.characters[0].bio.includes(original.characters[0].deep));
    }
    assert.equal((await get('/gameshub/api/games/unknown')).status, 404);
    assert.equal((await get('/gameshub/api/games/portal?mode=invalid')).status, 400);
    assert.equal((await get('/gameshub/catalogue.json')).status, 404);
    const write = body => fetch(origin + '/gameshub/api/games/portal/discussions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify(body),
    });
    const safePost = await write({ author: 'Test Reader', body: 'How did the spatial puzzles change your approach?', mode: 'spoiler-free' });
    assert.equal(safePost.status, 201);
    const parent = (await safePost.json()).id;
    assert.equal((await write({ author: 'Another Reader', body: 'I started looking at every surface differently.', mode: 'spoiler-free', parentId: parent })).status, 201);
    assert.equal((await write({ author: 'Story Reader', body: 'DEEP_DISCUSSION_SENTINEL ending discussion.', mode: 'deep-dive' })).status, 201);
    assert.equal((await write({ author: 'Wrong Board', body: 'Cannot reply across spoiler boundaries.', mode: 'deep-dive', parentId: parent })).status, 400);
    const safeBoard = await (await get('/gameshub/api/games/portal/discussions')).json();
    assert.equal(safeBoard.threads.length, 1);
    assert.equal(safeBoard.threads[0].replies.length, 1);
    assert.ok(!JSON.stringify(safeBoard).includes('DEEP_DISCUSSION_SENTINEL'));
    const deepBoard = await (await get('/gameshub/api/games/portal/discussions?mode=deep-dive')).json();
    assert.ok(deepBoard.threads[0].body.includes('DEEP_DISCUSSION_SENTINEL'));
    assert.equal(require('../Gameshub/server').db.prepare('SELECT count(*) n FROM discussions').get().n, 3);
    const denied = await fetch(origin + '/gameshub/api/games/portal/discussions', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://unrelated.example' }, body: '{}' });
    assert.equal(denied.status, 403);
  });

  await t.test('ShopSphere registration, session, cart and upload use their own prefix', async () => {
    const response = await json('/shopsphere/api/auth/register', { name: 'Test Seller', email: 'seller@test.example', password: 'TestPassword123!', role: 'seller' });
    assert.equal(response.status, 201, await response.clone().text());
    assert.match(response.headers.get('set-cookie'), /Path=\/shopsphere\//);
    const cookie = session(response);
    const products = await (await get('/shopsphere/api/products')).json();
    assert.ok(products.products.length);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
    const upload = await json('/shopsphere/api/images', { data: png }, cookie);
    assert.equal(upload.status, 201, await upload.clone().text());
    const { image_url } = await upload.json();
    assert.equal((await get('/shopsphere' + image_url)).status, 200);
  });

  await t.test('SprintBoard registration and project creation stay isolated', async () => {
    const response = await json('/sprintboard/api/register', { name: 'Test Member', email: 'member@test.example', password: 'TestPassword123!' });
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get('set-cookie'), /Path=\/sprintboard\//);
    const created = await json('/sprintboard/api/projects', { name: 'Shared hosting test', description: 'Integration', color: '#e50914' }, session(response));
    assert.equal(created.status, 200, await created.clone().text());
  });

  await t.test('ConnectHub session, uploads and authenticated Socket.IO polling', async () => {
    const response = await json('/connecthub/api/signup', { name: 'Test Networker', email: 'network@test.example', password: 'TestPassword123!' });
    assert.equal(response.status, 200, await response.clone().text());
    assert.match(response.headers.get('set-cookie'), /Path=\/connecthub\//);
    const cookie = session(response);
    const form = new FormData();
    form.append('image', new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64')], { type: 'image/png' }), 'test.png');
    const uploaded = await fetch(origin + '/connecthub/api/upload', { method: 'POST', headers: { Cookie: cookie }, body: form });
    assert.equal(uploaded.status, 200);
    assert.equal((await get('/connecthub' + (await uploaded.json()).url)).status, 200);
    const transport = '/connecthub/socket.io/?EIO=4&transport=polling';
    const handshake = await (await fetch(origin + transport, { headers: { Cookie: cookie } })).text();
    assert.ok(handshake.startsWith('0'), handshake);
    const { sid } = JSON.parse(handshake.slice(1));
    const opened = await fetch(origin + transport + '&sid=' + sid, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '40' });
    assert.equal(opened.status, 200);
    const connected = await (await fetch(origin + transport + '&sid=' + sid, { headers: { Cookie: cookie } })).text();
    assert.ok(connected.includes('40{'), connected);
    await fetch(origin + transport + '&sid=' + sid, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'text/plain' }, body: '1' });
  });

  await t.test('Movieshub registration, scoped session and Google redirect', { skip: !mongoAvailable && 'Local MongoDB is not running' }, async () => {
    // Movieshub enforces the configured public origin for cookie-authenticated writes.
    const response = await fetch(origin + '/movieshub/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3000' }, body: JSON.stringify({ name: 'Test Movie Fan', email: 'fan@test.example', password: 'TestPassword123!' }) });
    assert.equal(response.status, 201, await response.clone().text());
    assert.match(response.headers.get('set-cookie'), /Path=\/movieshub\//);
    const me = await fetch(origin + '/movieshub/api/auth/me', { headers: { Cookie: session(response) } });
    assert.equal(me.status, 200);
    const failedCallback = await fetch(origin + '/movieshub/api/auth/google/callback?error=access_denied', { redirect: 'manual' });
    assert.ok(failedCallback.headers.get('location').startsWith('http://localhost:3000/movieshub/login'));
  });
});
