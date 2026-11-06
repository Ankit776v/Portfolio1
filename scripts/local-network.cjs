const os = require('node:os');

function localOrigins(port, interfaces = os.networkInterfaces()) {
  const origins = new Set([`http://localhost:${port}`, `http://127.0.0.1:${port}`]);
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal && entry.address !== '0.0.0.0') origins.add(`http://${entry.address}:${port}`);
    }
  }
  return [...origins];
}
module.exports = { localOrigins };
