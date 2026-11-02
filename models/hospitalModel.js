const db = require('../db');
const config = require('../config');

async function findById(id) {
  const row = await db.one('SELECT * FROM hospitals WHERE id = ?', [id]);
  return row ? fromRow(row) : null;
}

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    address: { line1: row.address_line1, city: row.city, state: row.state, pincode: row.pincode },
    status: row.status,
    statusReason: row.status_reason || null,
    kycStatus: row.kyc_status,
    logoUrl: row.logo_url || null,
    about: row.about || null,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

// Receptionists may only change contact details. Name, ID and status are
// managed by the Gmedic super admin.
async function update(id, patch) {
  const hospital = await findById(id);
  if (!hospital) return null;
  const address = patch.address ? { ...hospital.address, ...patch.address } : hospital.address;
  await db.query(
    `UPDATE hospitals SET phone = ?, email = ?, address_line1 = ?, city = ?, state = ?, pincode = ? WHERE id = ?`,
    [patch.phone ?? hospital.phone, patch.email ?? hospital.email, address.line1, address.city, address.state, address.pincode, id]
  );
  return findById(id);
}

function formatAddress(address = {}) {
  const cityLine = [address.city, address.pincode].filter(Boolean).join(' - ');
  return [address.line1, cityLine, address.state].filter(Boolean).join(', ');
}

// The link encoded in the hospital's active QR code (scanned by the patient app), or null when
// every code was revoked: a link with an empty key would print a code the app can't resolve.
async function qrPayload(hospital) {
  const qr = await db.one("SELECT qr_key FROM qr_codes WHERE hospital_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1", [hospital.id]);
  if (!qr || !qr.qr_key) return null;
  return `${config.qrBaseUrl}/${encodeURIComponent(hospital.id)}?k=${encodeURIComponent(qr.qr_key)}`;
}

async function toPublic(hospital) {
  if (!hospital) return null;
  return {
    id: hospital.id,
    name: hospital.name,
    phone: hospital.phone,
    email: hospital.email,
    address: hospital.address,
    addressText: formatAddress(hospital.address),
    status: hospital.status,
    statusReason: hospital.statusReason,
    logoUrl: hospital.logoUrl,
    about: hospital.about,
    qrLink: await qrPayload(hospital),
    updatedAt: hospital.updatedAt,
  };
}

module.exports = { findById, update, qrPayload, toPublic, formatAddress, fromRow };
