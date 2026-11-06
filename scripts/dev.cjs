const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set([
  '.git', '.aws', '.codex', '.agents', '.vscode', 'node_modules', 'dist', 'build',
  'coverage', 'data', 'uploads', 'product-images', 'artifacts', '.cache',
]);
const watchedExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.jsx', '.json', '.mjs', '.png', '.jpg',
  '.jpeg', '.svg', '.ts', '.tsx', '.webp', '.yaml', '.yml',
]);

const watchers = [];
const watchedDirectories = new Set();
let child = null;
let restartTimer = null;
let restartAfterExit = false;
let stopping = false;

function isIgnored(relativePath) {
  return relativePath.split(path.sep).some(part => ignoredDirectories.has(part));
}

function isWatchedFile(filename) {
  return filename === '.env' || filename.startsWith('.env.') || watchedExtensions.has(path.extname(filename).toLowerCase());
}

function watchTree(directory) {
  const normalizedDirectory = path.resolve(directory);
  if (watchedDirectories.has(normalizedDirectory)) return;
  watchedDirectories.add(normalizedDirectory);
  let entries;
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      watchTree(path.join(directory, entry.name));
    }
  }

  try {
    const watcher = fs.watch(directory, (event, filename) => {
      if (!filename || stopping) return;
      const changed = filename.toString();
      const absolute = path.resolve(directory, changed);
      const relative = path.relative(root, absolute);
      if (isIgnored(relative)) return;

      try {
        if (fs.statSync(absolute).isDirectory()) watchTree(absolute);
      } catch {
        // A deleted or renamed source file still needs to trigger a restart.
      }

      if (isWatchedFile(path.basename(changed))) scheduleRestart(relative);
    });
    watchers.push(watcher);
  } catch (error) {
    console.warn(`Could not watch ${path.relative(root, directory)}: ${error.message}`);
  }
}

function startServer() {
  if (stopping) return;
  console.log('\nStarting portfolio server...');
  child = spawn(process.execPath, ['server.js'], { cwd: root, env: process.env, stdio: 'inherit' });
  child.on('error', error => console.error(`Could not start portfolio server: ${error.message}`));
  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) return;
    if (restartAfterExit) {
      restartAfterExit = false;
      startServer();
    } else {
      console.log(`Portfolio server stopped${signal ? ` (${signal})` : ` (exit ${code})`}. Save a source file to start it again.`);
    }
  });
}

function scheduleRestart(relativePath) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`\nChange detected: ${relativePath}`);
    restartAfterExit = true;
    if (child) child.kill('SIGINT');
    else {
      restartAfterExit = false;
      startServer();
    }
  }, 300);
}

function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(restartTimer);
  for (const watcher of watchers) watcher.close();
  if (child) child.kill('SIGINT');
  else process.exit(0);
}

watchTree(root);
console.log('Watching project source files. Press Ctrl+C to stop.');
startServer();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
