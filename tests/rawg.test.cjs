const test = require('node:test');
const assert = require('node:assert/strict');
const { createRAWG } = require('../Gameshub/rawg.cjs');
const entry = { id: 'portal-2', title: 'Portal 2', year: 2011 };
const game = { id: 4200, name: 'Portal 2', slug: 'portal-2', released: '2011-04-18', background_image: 'https://media.rawg.io/media/games/cover.jpg', description: 'Do not expose provider plots' };
const response = data => ({ ok: true, json: async () => data });
test('RAWG matches images, caches requests and excludes plots, hidden screenshots and keys', async () => {
  let calls = 0;
  const api = createRAWG({ env: { RAWG_API_KEY: 'private-key' }, pause: async () => {}, fetcher: async url => {
    calls++; assert.equal(new URL(url).searchParams.get('key'), 'private-key');
    return response(url.includes('/screenshots') ? { results: [{ image: 'https://media.rawg.io/media/screenshots/one.jpg' }, { image: 'https://media.rawg.io/hidden.jpg', hidden: true }, { image: 'javascript:alert(1)' }] } : { results: [game] });
  }});
  const [first, second] = await Promise.all([api.library([entry]), api.library([entry])]);
  assert.equal(calls, 1); assert.equal(first[0].game.image, game.background_image); assert.deepEqual(first, second);
  const detail = await api.detail(entry); assert.equal(calls, 2); assert.equal(detail.screenshots.length, 1);
  assert.equal(detail.description, undefined); assert.ok(!JSON.stringify(detail).includes('private-key'));
});
test('RAWG refuses ambiguous matches and supports manual IDs', async () => {
  const api = createRAWG({ env: { RAWG_API_KEY: 'key' }, pause: async () => {}, fetcher: async url => response(url.includes('/games/4200') ? (url.includes('screenshots') ? { results: [] } : game) : { results: [game, { ...game, id: 99 }] }) });
  assert.equal((await api.library([entry]))[0].game, null);
  assert.equal((await api.detail({ ...entry, rawgId: 4200 })).id, 4200);
});
test('RAWG missing keys and transport failures are sanitized', async () => {
  await assert.rejects(createRAWG({ env: {} }).detail(entry), { status: 503 });
  const api = createRAWG({ env: { RAWG_API_KEY: 'secret' }, pause: async () => {}, fetcher: async () => { throw Error('request with secret'); } });
  await assert.rejects(api.detail(entry), error => !error.message.includes('secret'));
  assert.equal((await api.library([entry]))[0].unavailable, true);
});
