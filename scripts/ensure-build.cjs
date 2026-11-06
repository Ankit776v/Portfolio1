const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function ensureBuild() {
  const root = path.resolve(__dirname, '..');
  const client = path.join(root, 'Movieshub/client');
  const outputs = ['index.html', '.vite/manifest.json'].map(file => path.join(client, 'dist', file));
  // Production images build during deployment and may omit Vite/dev dependencies.
  if (process.env.NODE_ENV === 'production' && outputs.every(file => fs.existsSync(file))) return;
  // Rebuild on every local restart, including deleted/renamed files and config
  // changes. Timestamp checks cannot reliably detect all of these cases.
  console.log('Building the latest Movieshub frontend before starting the portfolio...');
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs')], { cwd: root, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Movieshub build failed. Install build dependencies and run npm run build before starting the server.');
}

if (require.main === module) {
  try { ensureBuild(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { ensureBuild };
