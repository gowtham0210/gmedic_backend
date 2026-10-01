// Runs every .sql file in database/migrations, in filename order, once.
// Tracks applied migrations in the `meta` table (created by 001_schema.sql itself,
// so this script creates it first if the database is brand new).

const fs = require('fs');
const path = require('path');
const db = require('./index');

const DIR = path.join(__dirname, '..', 'database', 'migrations');

async function ensureMetaTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS meta (
      meta_key TEXT PRIMARY KEY,
      meta_value TEXT NOT NULL
    )`);
}

async function applied() {
  const row = await db.one("SELECT meta_value FROM meta WHERE meta_key = 'migrations_applied'").catch(() => null);
  if (!row) return new Set();
  try { return new Set(JSON.parse(row.meta_value)); } catch { return new Set(); }
}

async function markApplied(set) {
  await db.query(
    `INSERT INTO meta (meta_key, meta_value) VALUES ('migrations_applied', ?)
     ON CONFLICT (meta_key) DO UPDATE SET meta_value = excluded.meta_value`,
    [JSON.stringify([...set])]
  );
}

// Splits a .sql file into individual statements on semicolons. Every trigger
// in this schema follows one simple shape — `CREATE TRIGGER ... BEGIN
// <statements>; END;` — so those blocks are pulled out first (whole, as a
// single statement) before the plain semicolon-split runs on what's left.
const TRIGGER_RE = /CREATE\s+TRIGGER\b[\s\S]*?\bEND\s*;/gi;

function splitStatements(sql) {
  // Pull trigger blocks out behind placeholder tokens (so the semicolons
  // inside them survive the split), then put them back in their original
  // position — table creation must still run before its trigger.
  const triggers = [];
  const withoutComments = sql.replace(/^\s*--.*$/gm, '');
  const placeheld = withoutComments.replace(TRIGGER_RE, (block) => {
    triggers.push(block.trim());
    return `\n\x00TRIGGER_${triggers.length - 1}\x00;\n`;
  });

  const statements = [];
  for (const part of placeheld.split(';')) {
    const stmt = part.trim();
    if (!stmt) continue;
    const m = stmt.match(/^\x00TRIGGER_(\d+)\x00$/);
    statements.push(m ? triggers[Number(m[1])] : stmt);
  }
  return statements;
}

async function migrate() {
  await ensureMetaTable();
  const done = await applied();
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (done.has(file)) {
      console.log(`  skip   ${file} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    const statements = splitStatements(sql);
    console.log(`  apply  ${file} (${statements.length} statements)`);
    for (const stmt of statements) {
      await db.query(stmt);
    }
    done.add(file);
    await markApplied(done);
  }
  console.log('Migrations up to date.');
}

module.exports = { migrate };

if (require.main === module) {
  migrate().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
  });
}
