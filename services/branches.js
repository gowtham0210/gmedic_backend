// Branch checks shared by doctors and QR codes (both can be tied to one branch of their hospital).
const db = require('../db');
const { badRequest } = require('../utils/http');

// Resolves an optional branch choice: '' / null means "no branch". A branch must belong to the
// hospital and be active. `field` names the form field for the error.
async function resolveBranch(hospitalId, branchId, field = 'branchId') {
  if (branchId === undefined) return undefined; // not sent: leave as is
  if (!branchId) return null;
  const b = await db.one('SELECT id, status FROM hospital_branches WHERE id = ? AND hospital_id = ?', [String(branchId), hospitalId]);
  if (!b) throw badRequest('Please correct the highlighted fields.', { [field]: 'Choose a branch of this hospital.' });
  if (b.status !== 'ACTIVE') throw badRequest('Please correct the highlighted fields.', { [field]: 'This branch is deactivated.' });
  return b.id;
}

// What is tied to a branch, for the deactivate confirmation.
async function branchUsage(branchId) {
  const [doctors, qr] = await Promise.all([
    db.one('SELECT COUNT(*) AS n FROM doctors WHERE branch_id = ?', [branchId]),
    db.one("SELECT COUNT(*) AS n FROM qr_codes WHERE branch_id = ? AND status = 'ACTIVE'", [branchId]),
  ]);
  return { doctors: Number(doctors.n), activeQrCodes: Number(qr.n) };
}

module.exports = { resolveBranch, branchUsage };
