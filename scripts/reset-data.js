// Recreate data/db.json with fresh sample data: `npm run reset-data`
const store = require('../data/store');
const config = require('../config');

const db = store.reset();
console.log(`Sample data written to ${config.dataFile}`);
console.log(`  ${db.doctors.length} doctors, ${db.appointments.length} appointments`);
console.log('  Login: riya.sharma@sunrisegeneral.in / Gmedic@123');
