// Public images stored in the shared upload folder (next to KYC documents): doctor photos and
// hospital logos. Each kind lives in one column, and its public route only ever serves a file that
// some row of that column points at, never anything else in the folder.
const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');
const auditLog = require('./auditLog');
const { badRequest } = require('../utils/http');

const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MAX_BYTES = 3 * 1024 * 1024;

// kind: { table, column, prefix, field, noun, entityType, action } e.g. doctor photo / hospital logo.
function imageStore(kind) {
  const { table, column, prefix, field, noun, entityType, action } = kind;

  // Delete an old file once no row points at it any more (best effort).
  async function discard(url) {
    if (!url || !String(url).startsWith(prefix)) return;
    const name = String(url).slice(prefix.length);
    if (!/^[\w.-]+$/.test(name) || (await db.one(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [url]))) return;
    fs.rm(path.join(config.uploadDir, name), { force: true }, () => {});
  }

  // `row` needs id, name and the current URL (as row[column] or row.current).
  async function set(req, row) {
    const file = req.file;
    if (!file) throw badRequest(`Choose a ${noun} to upload.`, { [field]: `Choose a ${noun}.` });
    const bad = !TYPES[file.mimetype] ? 'Use a PNG, JPEG or WebP image.' : file.size > MAX_BYTES ? `The ${noun} must be 3 MB or smaller.` : null;
    if (bad) {
      fs.rm(path.join(config.uploadDir, file.filename), () => {});
      throw badRequest(bad, { [field]: bad });
    }
    await db.query(`UPDATE ${table} SET ${column} = ? WHERE id = ?`, [`${prefix}${file.filename}`, row.id]);
    await discard(row.current);
    await auditLog.record({ req, action: `${action}_UPDATED`, entityType, entityId: row.id, summary: `New ${noun} for ${row.name}` });
  }

  async function remove(req, row) {
    await db.query(`UPDATE ${table} SET ${column} = NULL WHERE id = ?`, [row.id]);
    await discard(row.current);
    await auditLog.record({ req, action: `${action}_REMOVED`, entityType, entityId: row.id, summary: `Removed the ${noun} of ${row.name}` });
  }

  // The file behind a public URL, or null when no row uses it.
  async function fileFor(name) {
    if (!/^[\w.-]+$/.test(String(name || ''))) return null;
    if (!(await db.one(`SELECT 1 FROM ${table} WHERE ${column} = ?`, [`${prefix}${name}`]))) return null;
    const full = path.join(config.uploadDir, name);
    const ext = path.extname(name).slice(1).toLowerCase();
    const type = Object.keys(TYPES).find((t) => TYPES[t] === ext || (ext === 'jpeg' && t === 'image/jpeg')) || 'application/octet-stream';
    return fs.existsSync(full) ? { full, type } : null;
  }

  return { set, remove, fileFor };
}

module.exports = { imageStore };
