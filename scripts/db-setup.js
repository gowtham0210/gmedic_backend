// One command to get a working local database:
//   npm run db:setup
//
// 1. Runs every migration in database/migrations (idempotent).
// 2. Imports data/db.json (the original receptionist portal's data) if the
//    database is otherwise empty.
// 3. Creates the first Super Admin account if none exists.
// 4. Seeds platform defaults (settings, feature flags, app versions, templates)
//    and a small sample QR-scan / webhook dataset for the analytics pages.

const { migrate } = require('../db/migrate');
const { importLegacy, ensureSuperAdmin, ensureDemoDoctor } = require('../db/importLegacy');
const { seedPlatform } = require('../db/seedPlatform');
const { ping } = require('../db');
const config = require('../config');

async function main() {
  console.log(`Opening SQLite database at ${config.dbFile} ...`);
  try {
    await ping();
  } catch (err) {
    console.error(`\nCould not open the database: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nRunning migrations...');
  await migrate();

  console.log('\nImporting legacy data (if any)...');
  await importLegacy();

  console.log('\nEnsuring a Super Admin account exists...');
  const created = await ensureSuperAdmin();

  console.log('\nEnsuring a demo Doctor account exists...');
  const doctorCreated = await ensureDemoDoctor();

  console.log('\nSeeding platform defaults and sample analytics data...');
  await seedPlatform();

  console.log('\nDone.');
  if (created) {
    console.log('\nSuper Admin account created:');
    console.log(`  Email:    ${created.email}`);
    console.log(`  Username: ${created.username}`);
    console.log(`  Password: ${created.password}`);
    console.log('  Change this password after your first login.');
  } else {
    console.log('\nA Super Admin account already exists (no new credentials to show).');
  }
  if (doctorCreated) {
    console.log(`\nDemo Doctor account created (${doctorCreated.doctorName}):`);
    console.log(`  Email:    ${doctorCreated.email}`);
    console.log(`  Username: ${doctorCreated.username}`);
    console.log(`  Password: ${doctorCreated.password}`);
  }
}

main().catch((err) => {
  console.error('\ndb:setup failed:', err);
  process.exitCode = 1;
});
