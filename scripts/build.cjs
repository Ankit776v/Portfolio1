const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const client = path.join(root, 'Movieshub/client');
const clientRequire = createRequire(path.join(client, 'package.json'));
const vite = path.join(path.dirname(clientRequire.resolve('vite/package.json')), 'bin/vite.js');
const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: client, stdio: 'inherit',
  env: { ...process.env, PORTFOLIO_BUILD: '1', VITE_API_URL: '/movieshub' }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
