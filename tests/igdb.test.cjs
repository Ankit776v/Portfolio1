const test = require('node:test');
const assert = require('node:assert/strict');
const { createIGDB } = require('../Gameshub/igdb.cjs');
const env = { IGDB_CLIENT_ID: 'test-client', IGDB_CLIENT_SECRET: 'test-secret' };
const response = (body, status = 200) => ({ ok: status === 200, status, json: async () => body });
test('IGDB keeps credentials server-side, caches searches and gates plot fields', async () => {
  const calls = [];
  const client = createIGDB({ env, pause: async () => {}, fetcher: async (url, options) => {
    calls.push({ url, ...options });
    if (url.includes('oauth2')) return response({ access_token: 'private-token', expires_in: 3600 });
    if (url.endsWith('/characters')) return response([{ name: 'Character', description: 'Spoiler biography' }]);
    if (options.body.includes('fields summary')) return response([{ summary: 'Plot spoiler' }]);
    return response([{ id: 72, name: 'Portal 2', slug: 'portal-2', cover: { image_id: 'abc' }, first_release_date: 1303171200 }]);
  }});
  await Promise.all([client.search('Portal 2'), client.search('Portal 2')]);
  assert.equal(calls.length, 2);
  await client.search('Portal 2'); assert.equal(calls.length, 2);
  const entry = { id: 'portal-2', title: 'Portal 2', year: 2011 };
  const safe = await client.detail(entry);
  assert.equal(safe.summary, undefined);
  assert.equal(safe.characters, undefined);
  assert.ok(!calls.some(c => /summary|storyline|description/.test(c.body)));
  const deep = await client.detail(entry, true);
  assert.equal(deep.summary, 'Plot spoiler');
  assert.equal(deep.characters[0].bio, 'Spoiler biography');
  assert.ok(!JSON.stringify(deep).includes('private-token'));
  assert.ok(calls[0].body.includes('client_secret=test-secret'));
  assert.ok(!calls[0].url.includes('test-secret'));
});
test('IGDB handles missing config, validates searches and refuses ambiguous matches', async () => {
  const offline = createIGDB({ env: {}, fetcher: () => { throw Error('Must not fetch'); } });
  await assert.rejects(offline.search('Portal'), { status: 503 });
  await assert.rejects(offline.search('x'), { status: 400 });
  const client = createIGDB({ env, pause: async () => {}, fetcher: async url => url.includes('oauth2') ? response({ access_token: 'token', expires_in: 3600 }) : response([{ id: 1, name: 'Mario' }, { id: 2, name: 'Mario' }]) });
  assert.equal((await client.match([{ id: 'mario', title: 'Mario' }]))[0].game, null);
  assert.equal((await client.match([{ id: 'mario', title: 'Mario', igdbId: 2 }]))[0].game.id, 2);
});
test('IGDB renews rejected tokens and sanitizes provider failures', async () => {
  let auth = 0, requests = 0;
  const client = createIGDB({ env, pause: async () => {}, fetcher: async url => {
    if (url.includes('oauth2')) { auth++; return response({ access_token: 'token'+auth, expires_in: 3600 }); }
    requests++; return requests === 1 ? response({}, 401) : response([]);
  }});
  await client.search('Portal'); assert.equal(auth, 2);
  const failed = createIGDB({ env, fetcher: async () => response({ secret: 'do not expose' }, 400) });
  await assert.rejects(failed.search('Portal'), error => error.status === 503 && !error.message.includes('do not expose'));
});
