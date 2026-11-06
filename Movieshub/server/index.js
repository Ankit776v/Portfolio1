const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });
const mongoose = require('mongoose');
const { createApp } = require('./app');

async function main() {
  for (const name of ['MONGODB_URI','JWT_SECRET','CLIENT_ORIGIN']) if (!process.env[name]) throw new Error(name + ' must be configured.');
  if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET.length < 32 || process.env.JWT_SECRET.includes('replace-with'))) throw new Error('Use a random JWT_SECRET of at least 32 characters.');
  const origin = new URL(process.env.CLIENT_ORIGIN);
  if (origin.origin !== process.env.CLIENT_ORIGIN || !['http:','https:'].includes(origin.protocol)) throw new Error('CLIENT_ORIGIN must be an exact origin without a trailing slash.');
  if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') throw new Error('Production CLIENT_ORIGIN must use HTTPS.');
  const { app, catalogue, Review } = createApp();
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  // Idempotent removal of the legacy index; existing users may have multiple reviews.
  try { await Review.collection.dropIndex('movieId_1_user_1'); } catch (error) { if (error.code !== 27 && error.codeName !== 'IndexNotFound' && error.code !== 26) throw error; }
  const server = app.listen(process.env.PORT || 5000, '0.0.0.0', () => console.info(JSON.stringify({ event: 'listening', port: process.env.PORT || 5000 })));
  catalogue.start();
  let stopping = false;
  async function shutdown(signal) {
    if (stopping) return; stopping = true;
    console.info(JSON.stringify({ event: 'shutdown', signal }));
    catalogue.stop();
    const timer = setTimeout(() => process.exit(1), 10000); timer.unref();
    try { await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve())); await mongoose.disconnect(); clearTimeout(timer); }
    catch { process.exitCode = 1; }
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  server.on('error', () => shutdown('listen-error').finally(() => { process.exitCode = 1; }));
}
main().catch(error => { console.error(JSON.stringify({ event: 'startup_failed', name: error.name, message: error.name === 'MongooseServerSelectionError' ? 'Database unavailable.' : error.message })); process.exit(1); });
