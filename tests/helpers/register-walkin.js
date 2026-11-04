// Child process for the cross-process concurrency test: registers one emergency walk-in and prints the outcome as JSON.
// usage: DB_FILE=<copy of the database> node tests/helpers/register-walkin.js <n>
const path = require('path');
const emergency = require(path.join(__dirname, '..', '..', 'services', 'emergencyWalkIn'));

const n = Number(process.argv[2]);
const user = { id: 'USR901', name: 'Desk One', role: 'RECEPTIONIST', hospitalId: 'HSP2' };
emergency.register('HSP2', {
  departmentId: 'none', doctorId: process.env.TEST_DOCTOR, emergencyReason: `Race registration ${n}`,
  patient: { name: `Racer ${n}`, mobile: `95000000${String(10 + n)}` },
}, user)
  .then((a) => console.log(JSON.stringify({ ok: true, code: a.tokenCode })))
  .catch((e) => console.log(JSON.stringify({ ok: false, status: e.status || 500, message: String(e.message).slice(0, 80) })));
