// SQLite data layer (via Node's built-in node:sqlite — no server, no
// separate install, just a local file). Every caller in this project talks to
// the database only through query/one/tx/iso/toSql/inList/nextId, so this is
// the one place that knows it's SQLite.
//
// Conventions carried over from the original design:
//   - DATETIME values are stored as "YYYY-MM-DD HH:MM:SS" (UTC) strings — see
//     toSql()/iso(). SQLite's own datetime('now') produces the same format,
//     so plain string comparison and ordering both work correctly.
//   - query() returns an array of row objects for SELECT/PRAGMA/WITH
//     statements, or { affectedRows, insertId } for INSERT/UPDATE/DELETE —
//     matching the shape the rest of the app already expects.

const fs = require('fs');
const path = require('path');
const config = require('../config');

// Loaded through an indirect require so bundlers (Turbopack/webpack) never see
// a literal `require('node:sqlite')` to statically analyse — this is a Node
// 22+ builtin that's too new for some bundlers' Node-builtin lists, and a
// direct literal require gets miscategorised and pulled toward the client
// graph. This runtime-only require is never touched by build tooling.
// eslint-disable-next-line no-eval
const nodeRequire = eval('require');
const { DatabaseSync } = nodeRequire('node:sqlite');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
const database = new DatabaseSync(config.dbFile);
database.exec('PRAGMA foreign_keys = ON');
database.exec('PRAGMA journal_mode = WAL');

const RETURNS_ROWS = /^\s*(SELECT|WITH|PRAGMA|EXPLAIN)/i;
const stmtCache = new Map();

function prepared(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = database.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

function run(sql, params) {
  const stmt = prepared(sql);
  if (RETURNS_ROWS.test(sql)) {
    return stmt.all(...params);
  }
  const info = stmt.run(...params);
  return { affectedRows: Number(info.changes), insertId: info.lastInsertRowid };
}

async function query(sql, params = []) {
  return run(sql, params);
}

async function one(sql, params = []) {
  const result = run(sql, params);
  return Array.isArray(result) ? result[0] || null : result;
}

// Runs fn(conn) inside a transaction; conn exposes the same query/one shape.
// node:sqlite is synchronous and single-connection, so this just wraps
// BEGIN IMMEDIATE (which takes the write lock up front, serialising writers)
// / COMMIT / ROLLBACK around the callback.
async function tx(fn) {
  database.exec('BEGIN IMMEDIATE');
  const conn = {
    query: async (sql, params = []) => run(sql, params),
    one: async (sql, params = []) => { const r = run(sql, params); return Array.isArray(r) ? r[0] || null : r; },
  };
  try {
    const result = await fn(conn);
    database.exec('COMMIT');
    return result;
  } catch (err) {
    try { database.exec('ROLLBACK'); } catch { /* nothing to roll back */ }
    throw err;
  }
}

// SQLite datetime('now') / stored values already use this format, so this is
// mostly a passthrough — kept for the (rare) Date object case.
function iso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value);
  return new Date(`${s.replace(' ', 'T')}${s.endsWith('Z') ? '' : 'Z'}`).toISOString();
}

// JS Date / ISO string -> "YYYY-MM-DD HH:MM:SS" (UTC) for stored datetimes.
function toSql(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Build "col IN (?,?,?)" placeholders.
const inList = (arr) => arr.map(() => '?').join(',');

// Next short ID for a table, e.g. nextId('doctors', 'DOC', 101) -> "DOC113".
async function nextId(table, prefix, start, conn) {
  const runner = conn || { one };
  const row = await runner.one(
    `SELECT MAX(CAST(substr(id, ?) AS INTEGER)) AS n FROM "${table}" WHERE id LIKE ?`,
    [prefix.length + 1, `${prefix}%`]
  );
  return `${prefix}${Math.max(Number(row && row.n) || 0, start - 1) + 1}`;
}

async function ping() {
  database.exec('SELECT 1');
}

module.exports = { query, one, tx, iso, toSql, inList, nextId, ping };
