const Database = require("better-sqlite3");

const db = new Database("./data/shopsphere.sqlite");

const tables = db.prepare(`
  SELECT name FROM sqlite_master
  WHERE type = 'table'
`).all();

console.log("Tables:", tables);

const columns = db.prepare(`
  PRAGMA table_info(products)
`).all();

console.log("Product columns:", columns);

db.close();