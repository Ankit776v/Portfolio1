// Compatibility adapter for ConnectHub's original better-sqlite3-style calls.
// Uses SQLite bundled with Node.js (no native npm addon or build tools required).
const { DatabaseSync } = require('node:sqlite');
class Database {
  constructor(filename) { this.connection = new DatabaseSync(filename); }
  pragma(statement) { return this.connection.exec(`PRAGMA ${statement}`); }
  exec(sql) { return this.connection.exec(sql); }
  prepare(sql) {
    const stmt = this.connection.prepare(sql);
    return {
      get: (...params) => stmt.get(...params),
      all: (...params) => stmt.all(...params),
      run: (...params) => {
        const result = stmt.run(...params);
        return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
      }
    };
  }
  close() { this.connection.close(); }
}
module.exports = Database;
