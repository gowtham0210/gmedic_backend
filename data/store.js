// Tiny JSON-file data store. Models read and write through here, so moving to a
// real database only means reimplementing the functions in /models.

const fs = require('fs');
const path = require('path');
const config = require('../config');
const { generateDemoData, generateAppointments, generateTokens } = require('./seed');
const { todayISO } = require('../utils/dates');

let db = null;

function persist() {
  fs.mkdirSync(path.dirname(config.dataFile), { recursive: true });
  const tmp = `${config.dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, config.dataFile);
}

function load() {
  if (fs.existsSync(config.dataFile)) {
    try {
      db = JSON.parse(fs.readFileSync(config.dataFile, 'utf8'));
    } catch (err) {
      console.warn(`[store] Could not read ${config.dataFile} (${err.message}); recreating sample data.`);
      db = null;
    }
  }
  if (!db) {
    db = generateDemoData();
    persist();
  }
  // Data files created before token management existed get sample tokens.
  if (!Array.isArray(db.tokens)) {
    db.tokens = db.meta && db.meta.demo ? generateTokens(db.appointments) : [];
    persist();
  }
}

// Keep the sample appointments (and their tokens) centred on today; doctor,
// hospital and profile edits are preserved. Disable with DEMO_AUTO_REFRESH=false.
function ensureFresh() {
  if (!config.demoAutoRefresh || !db.meta || !db.meta.demo) return;
  const today = todayISO();
  if (db.meta.generatedFor === today) return;
  db.appointments = generateAppointments(db.doctors);
  db.tokens = generateTokens(db.appointments);
  db.meta.generatedFor = today;
  persist();
}

function get() {
  if (!db) load();
  ensureFresh();
  return db;
}

function save() {
  persist();
}

function reset() {
  db = generateDemoData();
  persist();
  return db;
}

module.exports = { get, save, reset };
