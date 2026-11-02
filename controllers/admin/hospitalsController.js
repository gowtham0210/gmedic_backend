const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const { nextQrId } = require('../../services/qrIds');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

const STATUSES = ['ONBOARDING', 'ACTIVE', 'SUSPENDED', 'OFFBOARDED'];
const KYC_STATUSES = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'];
const DOC_TYPES = ['LICENCE', 'BANK_PROOF', 'GST_CERTIFICATE', 'REGISTRATION'];

function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    address: { line1: row.address_line1, city: row.city, state: row.state, pincode: row.pincode },
    contactPerson: row.contact_person,
    phone: row.phone,
    email: row.email,
    gstin: row.gstin,
    registrationNumber: row.registration_number,
    logoUrl: row.logo_url || null,
    about: row.about || null,
    status: row.status,
    statusReason: row.status_reason,
    kycStatus: row.kyc_status,
    nextStatuses: STATUS_TRANSITIONS[row.status] || [],
    kycReason: row.kyc_reason || null,
    kycDecidedAt: db.iso(row.kyc_decided_at),
    bookingModel: row.booking_model,
    bookingFee: Number(row.booking_fee),
    convenienceFee: Number(row.convenience_fee),
    commissionType: row.commission_type,
    commissionValue: Number(row.commission_value),
    currency: row.currency,
    timezone: row.timezone,
    createdAt: db.iso(row.created_at),
    updatedAt: db.iso(row.updated_at),
  };
}

async function load(id) {
  const row = await db.one('SELECT * FROM hospitals WHERE id = ?', [id]);
  if (!row) throw notFound('Hospital not found.');
  return row;
}

exports.list = async (req, res) => {
  const { status, kycStatus, q, page = 1, pageSize = 15 } = req.query;
  const clauses = [];
  const params = [];
  if (status) { clauses.push('status = ?'); params.push(status); }
  if (kycStatus) { clauses.push('kyc_status = ?'); params.push(kycStatus); }
  if (q) { clauses.push('(name LIKE ? OR id LIKE ? OR city LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = (await db.one(`SELECT COUNT(*) AS n FROM hospitals ${where}`, params)).n;
  const size = Math.min(Math.max(Number(pageSize) || 15, 1), 100);
  const cur = Math.max(Number(page) || 1, 1);
  const rows = await db.query(
    `SELECT h.*, (SELECT COUNT(*) FROM doctors d WHERE d.hospital_id = h.id) AS doctor_count
     FROM hospitals h ${where} ORDER BY h.created_at DESC LIMIT ? OFFSET ?`,
    [...params, size, (cur - 1) * size]
  );
  const counts = await db.query('SELECT status, COUNT(*) AS n FROM hospitals GROUP BY status');
  res.json({
    items: rows.map((r) => ({ ...fromRow(r), doctorCount: Number(r.doctor_count) })),
    total: Number(total), page: cur, pageSize: size, pages: Math.max(1, Math.ceil(total / size)),
    summary: Object.fromEntries(STATUSES.map((s) => [s, Number((counts.find((c) => c.status === s) || {}).n) || 0])),
  });
};

// GET /api/admin/hospital-options
// A light list for dropdowns: every hospital's id, name, status and city, sorted by name, with no paging
// cap. Screens that create records hide the statuses that can't take them (see `status`).
exports.options = async (req, res) => {
  const rows = await db.query('SELECT id, name, status, city FROM hospitals ORDER BY name COLLATE NOCASE LIMIT 2000');
  res.json({ items: rows.map((r) => ({ id: r.id, name: r.name, status: r.status, city: r.city })) });
};

exports.get = async (req, res) => {
  const row = await load(req.params.id);
  const [branchCount, doctorCount, receptionistCount, apptCount] = await Promise.all([
    db.one('SELECT COUNT(*) AS n FROM hospital_branches WHERE hospital_id = ?', [row.id]),
    db.one('SELECT COUNT(*) AS n FROM doctors WHERE hospital_id = ?', [row.id]),
    db.one("SELECT COUNT(*) AS n FROM users WHERE hospital_id = ? AND role = 'RECEPTIONIST'", [row.id]),
    db.one('SELECT COUNT(*) AS n FROM appointments WHERE hospital_id = ?', [row.id]),
  ]);
  res.json({
    hospital: fromRow(row),
    kycChecklist: await kycChecklist(row),
    stats: { branches: Number(branchCount.n), doctors: Number(doctorCount.n), receptionists: Number(receptionistCount.n), appointments: Number(apptCount.n) },
  });
};

const createSchema = {
  name: { label: 'Hospital name', required: true, minLength: 3, maxLength: 120 },
  phone: { label: 'Contact number', type: 'phone', required: true },
  email: { label: 'Email', type: 'email', required: true },
  contactPerson: { label: 'Contact person', maxLength: 80 },
  line1: { label: 'Street address', required: true, minLength: 5, maxLength: 160 },
  city: { label: 'City', required: true, maxLength: 60 },
  state: { label: 'State', required: true, maxLength: 60 },
  pincode: { label: 'PIN code', required: true, pattern: /^\d{6}$/, message: 'PIN code must be 6 digits.' },
  gstin: { label: 'GSTIN', pattern: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, message: 'GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.' },
  registrationNumber: { label: 'Registration number', maxLength: 40 },
  about: { label: 'About', maxLength: 600 },
};

// GSTIN and registration number are unique. SQLite lets any number of hospitals have NULL but only
// one have '', so a blank is never stored as ''. On update a blank means "keep"; removing one is an
// explicit `clear` (see update). A value another hospital already uses is reported on its field
// instead of failing on the unique index.
const UNIQUE_FIELDS = [['gstin', 'gstin', 'GSTIN'], ['registrationNumber', 'registration_number', 'registration number']];

async function uniqueClashes(value, hospitalId) {
  const errors = {};
  for (const [field, column, label] of UNIQUE_FIELDS) {
    if (!value[field]) continue;
    const clash = await db.one(`SELECT name FROM hospitals WHERE ${column} = ? AND id <> ?`, [value[field], hospitalId || '']);
    if (clash) errors[field] = `${clash.name} already has this ${label}.`;
  }
  if (Object.keys(errors).length) throw badRequest('Please correct the highlighted fields.', errors);
}

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, createSchema);
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await uniqueClashes(value);

  const id = await db.nextId('hospitals', 'HSP', 1);
  await db.query(
    `INSERT INTO hospitals (id, name, address_line1, city, state, pincode, contact_person, phone, email, gstin, registration_number, status, kyc_status, onboarding_step)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ONBOARDING', 'PENDING', 1)`,
    [id, value.name, value.line1, value.city, value.state, value.pincode, value.contactPerson || null, value.phone, value.email, value.gstin || null, value.registrationNumber || null]
  );
  const qrId = await nextQrId(db, id);
  await db.query(
    "INSERT INTO qr_codes (id, qr_key, hospital_id, desk_label, status, created_by) VALUES (?, ?, ?, 'Main Reception', 'ACTIVE', ?)",
    [qrId, crypto.randomBytes(12).toString('hex'), id, req.user.id]
  );
  const hospital = await load(id);
  await auditLog.record({ req, action: 'HOSPITAL_CREATED', entityType: 'HOSPITAL', entityId: id, summary: `Onboarded ${value.name}`, newValue: fromRow(hospital) });
  res.status(201).json({ ok: true, message: `${value.name} has been added and starts onboarding.`, hospital: fromRow(hospital) });
};

exports.update = async (req, res) => {
  const before = await load(req.params.id);
  const { value, errors, ok } = validate(req.body, createSchema, { partial: true }); // only the fields sent are checked
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await uniqueClashes(value, req.params.id);
  // Removing a GSTIN / registration number is its own action ({ clear: ['gstin'] }), never a side
  // effect of submitting the KYC form with an empty field.
  const clear = new Set(Array.isArray(req.body && req.body.clear) ? req.body.clear : []);
  for (const [field, , label] of UNIQUE_FIELDS) {
    if (clear.has(field) && value[field]) throw badRequest('Please correct the highlighted fields.', { [field]: `Either change the ${label} or remove it, not both.` });
  }

  await db.query(
    `UPDATE hospitals SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
       address_line1 = COALESCE(?, address_line1), city = COALESCE(?, city), state = COALESCE(?, state), pincode = COALESCE(?, pincode),
       contact_person = CASE WHEN ? THEN ? ELSE contact_person END,
       about = CASE WHEN ? THEN ? ELSE about END,
       gstin = CASE WHEN ? THEN NULL ELSE COALESCE(?, gstin) END,
       registration_number = CASE WHEN ? THEN NULL ELSE COALESCE(?, registration_number) END
     WHERE id = ?`,
    [value.name ?? null, value.phone ?? null, value.email ?? null, value.line1 ?? null, value.city ?? null, value.state ?? null, value.pincode ?? null, value.contactPerson !== undefined ? 1 : 0, value.contactPerson || null,
      value.about !== undefined ? 1 : 0, value.about || null,
      clear.has('gstin') ? 1 : 0, value.gstin || null, clear.has('registrationNumber') ? 1 : 0, value.registrationNumber || null, req.params.id]
  );
  let after = await load(req.params.id);
  await auditLog.record({ req, action: 'HOSPITAL_UPDATED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `Updated ${after.name}`, previousValue: fromRow(before), newValue: fromRow(after) });

  // Verified KYC was verified against these legal identifiers: changing or removing one sends it
  // back to review (the same rule as a doctor's registration number), never keeps the old approval.
  const changed = UNIQUE_FIELDS.filter(([, column]) => (before[column] || null) !== (after[column] || null)).map(([, , label]) => label);
  if (before.kyc_status === 'VERIFIED' && changed.length) {
    await db.query("UPDATE hospitals SET kyc_status = 'UNDER_REVIEW' WHERE id = ?", [req.params.id]);
    after = await load(req.params.id);
    const note = `${changed.join(' and ')} changed — KYC re-review required.`;
    await auditLog.record({ req, action: 'HOSPITAL_KYC_REVIEW_REQUIRED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `${after.name}: ${note}`,
      previousValue: { kycStatus: 'VERIFIED', gstin: before.gstin, registrationNumber: before.registration_number },
      newValue: { kycStatus: 'UNDER_REVIEW', gstin: after.gstin, registrationNumber: after.registration_number } });
    return res.json({ ok: true, message: `Hospital details updated. The ${changed.join(' and ')} changed, so KYC is back to Under review.`, hospital: fromRow(after), kycReviewRequired: true });
  }
  res.json({ ok: true, message: 'Hospital details updated.', hospital: fromRow(after) });
};

// ---- Logo (shown in the patient app and the hospital's portal) ----
const hospitalLogos = require('../../services/hospitalLogos');

// POST /api/admin/hospitals/:id/logo (multipart `logo`) and DELETE to remove it.
exports.uploadLogo = async (req, res) => {
  const hospital = await load(req.params.id);
  await hospitalLogos.setLogo(req, hospital);
  res.json({ ok: true, message: `Logo updated for ${hospital.name}.`, hospital: fromRow(await load(hospital.id)) });
};

exports.removeLogo = async (req, res) => {
  const hospital = await load(req.params.id);
  if (!hospital.logo_url) throw badRequest(`${hospital.name} has no logo.`);
  await hospitalLogos.removeLogo(req, hospital);
  res.json({ ok: true, message: `Logo removed for ${hospital.name}.`, hospital: fromRow(await load(hospital.id)) });
};

// Suspending/offboarding a hospital only flips its status — appointments,
// payments and audit history are never deleted (spec requirement).
// Which statuses a hospital may move to. Offboarding is final; going live needs verified KYC.
const STATUS_TRANSITIONS = {
  ONBOARDING: ['ACTIVE', 'OFFBOARDED'],
  ACTIVE: ['SUSPENDED', 'OFFBOARDED'],
  SUSPENDED: ['ACTIVE', 'OFFBOARDED'],
  OFFBOARDED: [],
};

// What offboarding would lock: staff portal logins and live QR codes.
async function offboardImpact(hospitalId) {
  const [staff, qr] = await Promise.all([
    db.one("SELECT COUNT(*) AS n FROM users WHERE hospital_id = ? AND role IN ('RECEPTIONIST','DOCTOR') AND status = 'ACTIVE'", [hospitalId]),
    db.one("SELECT COUNT(*) AS n FROM qr_codes WHERE hospital_id = ? AND status = 'ACTIVE'", [hospitalId]),
  ]);
  return { activeStaffLogins: Number(staff.n), activeQrCodes: Number(qr.n) };
}

// PATCH /api/admin/hospitals/:id/status { status, reason }
exports.setStatus = async (req, res) => {
  const before = await load(req.params.id);
  const { status } = req.body || {};
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  if (!STATUSES.includes(status)) throw badRequest('Choose a valid hospital status.');
  if (status === before.status) return res.json({ ok: true, message: 'No changes to save.', hospital: fromRow(before) });
  if (!(STATUS_TRANSITIONS[before.status] || []).includes(status)) {
    throw badRequest(before.status === 'OFFBOARDED' ? 'An offboarded hospital cannot be reopened. Onboard it again as a new hospital.' : `A hospital can't move from ${before.status.toLowerCase()} to ${status.toLowerCase()}.`);
  }
  if (status === 'ACTIVE' && before.kyc_status !== 'VERIFIED') throw badRequest('Verify this hospital\'s KYC before activating it.');
  if ((status === 'SUSPENDED' || status === 'OFFBOARDED') && !reason) throw badRequest('A reason is required.', { reason: 'Enter a reason.' });

  const impact = status === 'OFFBOARDED' ? await offboardImpact(before.id) : null;
  await db.tx(async (conn) => {
    await conn.query(
      `UPDATE hospitals SET status = ?, status_reason = ?, activated_at = CASE WHEN ? = 'ACTIVE' AND activated_at IS NULL THEN CURRENT_TIMESTAMP ELSE activated_at END WHERE id = ?`,
      [status, reason || null, status, before.id]
    );
    if (status === 'OFFBOARDED') {
      // Offboarded staff can no longer sign in (any open session ends), and its QR posters stop working.
      await conn.query("UPDATE users SET status = 'INACTIVE', session_version = session_version + 1 WHERE hospital_id = ? AND role IN ('RECEPTIONIST','DOCTOR') AND status = 'ACTIVE'", [before.id]);
      await conn.query("UPDATE qr_codes SET status = 'REVOKED', revoked_reason = 'Hospital offboarded', revoked_at = CURRENT_TIMESTAMP, revoked_by = ? WHERE hospital_id = ? AND status = 'ACTIVE'", [req.user.id, before.id]);
    }
  });
  const after = await load(req.params.id);
  await auditLog.record({
    req, action: `HOSPITAL_${status}`, entityType: 'HOSPITAL', entityId: req.params.id,
    summary: `${before.name}: ${before.status} → ${status}${reason ? ` (${reason})` : ''}${impact ? `; ${impact.activeStaffLogins} staff login(s) deactivated, ${impact.activeQrCodes} QR code(s) revoked` : ''}`,
    previousValue: { status: before.status }, newValue: { status, reason, ...(impact || {}) },
  });
  const extra = impact ? ` ${impact.activeStaffLogins} staff login(s) deactivated and ${impact.activeQrCodes} QR code(s) revoked.` : '';
  res.json({ ok: true, message: `${after.name} is now ${status.toLowerCase()}.${extra}`, hospital: fromRow(after) });
};

// GET /api/admin/hospitals/:id/offboard-impact
exports.offboardImpact = async (req, res) => {
  const row = await load(req.params.id);
  res.json(await offboardImpact(row.id));
};


// ---- KYC documents ----------------------------------------------------------

exports.listDocuments = async (req, res) => {
  await load(req.params.id);
  const rows = await db.query(
    `SELECT doc.*, u.name AS reviewer_name FROM hospital_documents doc LEFT JOIN users u ON u.id = doc.reviewed_by
     WHERE doc.hospital_id = ? ORDER BY doc.created_at DESC`,
    [req.params.id]
  );
  res.json({
    documents: rows.map((d) => ({
      id: d.id, docType: d.doc_type, fileName: d.file_name, status: d.status,
      rejectionReason: d.rejection_reason, reviewerName: d.reviewer_name, reviewedAt: db.iso(d.reviewed_at), createdAt: db.iso(d.created_at),
      withdrawnReason: d.withdrawn_reason, withdrawnAt: db.iso(d.withdrawn_at),
    })),
  });
};

exports.uploadDocument = async (req, res) => {
  await load(req.params.id);
  const docType = req.body.docType;
  if (!DOC_TYPES.includes(docType)) throw badRequest('Choose a valid document type.');
  if (!req.file || req.file.mimetype === 'image/webp') throw badRequest('Choose a PDF, PNG or JPEG file (max 8MB).');
  const id = await db.nextId('hospital_documents', 'DOC', 1);
  await db.query(
    `INSERT INTO hospital_documents (id, hospital_id, doc_type, file_name, storage_path, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, docType, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user.id]
  );
  await db.query("UPDATE hospitals SET kyc_status = 'UNDER_REVIEW' WHERE id = ? AND kyc_status = 'PENDING'", [req.params.id]);
  await auditLog.record({ req, action: 'DOCUMENT_UPLOADED', entityType: 'HOSPITAL_DOCUMENT', entityId: id, summary: `Uploaded ${docType} for ${req.params.id}` });
  res.status(201).json({ ok: true, message: 'Document uploaded.' });
};

exports.reviewDocument = async (req, res) => {
  const doc = await db.one('SELECT * FROM hospital_documents WHERE id = ? AND hospital_id = ?', [req.params.docId, req.params.id]);
  if (!doc) throw notFound('Document not found.');
  const { status, reason } = req.body || {};
  if (!['VERIFIED', 'REJECTED'].includes(status)) throw badRequest('Choose Verify or Reject.');
  if (doc.status === 'WITHDRAWN') throw badRequest('This document was withdrawn. Upload a new copy instead.');
  if (status === 'REJECTED' && !String(reason || '').trim()) throw badRequest('A rejection reason is required.', { reason: 'Enter a reason.' });
  await db.query('UPDATE hospital_documents SET status = ?, rejection_reason = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?', [status, status === 'REJECTED' ? reason : null, req.user.id, doc.id]);
  await auditLog.record({ req, action: `DOCUMENT_${status}`, entityType: 'HOSPITAL_DOCUMENT', entityId: doc.id, summary: `${doc.doc_type} for ${req.params.id}: ${status}` });
  res.json({ ok: true, message: `Document marked as ${status.toLowerCase()}.` });
};

// Streams a stored KYC document back (inline for PDFs and images).
exports.downloadDocument = async (req, res) => {
  const doc = await db.one('SELECT * FROM hospital_documents WHERE id = ? AND hospital_id = ?', [req.params.docId, req.params.id]);
  if (!doc) throw notFound('Document not found.');
  const file = path.join(config.uploadDir, path.basename(doc.storage_path));
  if (!fs.existsSync(file)) throw notFound('The stored file is missing.');
  res.set({ 'Content-Type': doc.mime_type, 'Content-Disposition': `inline; filename="${String(doc.file_name).replace(/"/g, '')}"` });
  res.send(fs.readFileSync(file));
};


// Documents a hospital must have verified before its KYC can be Verified. The GST certificate is
// only required when the hospital has a GSTIN.
const REQUIRED_DOCS = ['LICENCE', 'REGISTRATION', 'BANK_PROOF'];
const DOC_LABEL = { LICENCE: 'Hospital licence', REGISTRATION: 'Registration', BANK_PROOF: 'Bank proof', GST_CERTIFICATE: 'GST certificate' };

async function kycChecklist(row) {
  const types = [...REQUIRED_DOCS, ...(row.gstin ? ['GST_CERTIFICATE'] : [])];
  const docs = await db.query("SELECT doc_type, status FROM hospital_documents WHERE hospital_id = ? AND status <> 'WITHDRAWN' ORDER BY created_at DESC, id DESC", [row.id]);
  return types.map((type) => {
    const ofType = docs.filter((d) => d.doc_type === type);
    const status = ofType.some((d) => d.status === 'VERIFIED') ? 'VERIFIED' : ofType.length ? ofType[0].status : 'MISSING';
    return { docType: type, label: DOC_LABEL[type], status };
  });
}

// PATCH /api/admin/hospitals/:id/kyc { status, reason }
exports.setKycStatus = async (req, res) => {
  const before = await load(req.params.id);
  const { status } = req.body || {};
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  if (!KYC_STATUSES.includes(status)) throw badRequest('Choose a valid KYC status.');
  if (status === before.kyc_status) return res.json({ ok: true, message: 'No changes to save.', hospital: fromRow(before) });
  if (status === 'REJECTED' && !reason) throw badRequest('Enter the reason for rejecting KYC.', { reason: 'Enter the reason for rejecting KYC.' });
  if (status === 'VERIFIED') {
    const missing = (await kycChecklist(before)).filter((d) => d.status !== 'VERIFIED');
    if (missing.length) throw badRequest(`Verify these documents first: ${missing.map((d) => `${d.label} (${d.status === 'MISSING' ? 'not uploaded' : d.status.toLowerCase()})`).join(', ')}.`);
  }
  await db.query('UPDATE hospitals SET kyc_status = ?, kyc_reason = ?, kyc_decided_by = ?, kyc_decided_at = CURRENT_TIMESTAMP WHERE id = ?', [status, reason || null, req.user.id, before.id]);
  const after = await load(req.params.id);
  await auditLog.record({ req, action: 'HOSPITAL_KYC_UPDATED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `${before.name} KYC: ${before.kyc_status} → ${status}${reason ? ` (${reason})` : ''}`, previousValue: { kycStatus: before.kyc_status }, newValue: { kycStatus: status, reason: reason || null } });
  res.json({ ok: true, message: `KYC status set to ${status.replace('_', ' ').toLowerCase()}.`, hospital: fromRow(after), kycChecklist: await kycChecklist(after) });
};

// ---- Branches ---------------------------------------------------------------

exports.listBranches = async (req, res) => {
  const rows = await db.query('SELECT * FROM hospital_branches WHERE hospital_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json({ branches: rows.map((b) => ({ id: b.id, name: b.name, address: b.address, contactPerson: b.contact_person, phone: b.phone, status: b.status })) });
};

exports.createBranch = async (req, res) => {
  await load(req.params.id);
  const { value, errors, ok } = validate(req.body, BRANCH_SCHEMA);
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const id = await db.nextId('hospital_branches', 'BR', 1);
  await db.query('INSERT INTO hospital_branches (id, hospital_id, name, address, contact_person, phone) VALUES (?, ?, ?, ?, ?, ?)', [id, req.params.id, value.name, value.address, value.contactPerson || null, value.phone]);
  await auditLog.record({ req, action: 'BRANCH_CREATED', entityType: 'HOSPITAL_BRANCH', entityId: id, summary: `Added branch ${value.name} to ${req.params.id}` });
  res.status(201).json({ ok: true, message: 'Branch added.' });
};

const BRANCH_SCHEMA = {
  name: { label: 'Branch name', required: true, minLength: 2, maxLength: 120 },
  address: { label: 'Address', required: true, minLength: 5, maxLength: 255 },
  phone: { label: 'Contact number', type: 'phone', required: true },
  contactPerson: { label: 'Contact person', maxLength: 80 },
};

// PATCH /api/admin/branches/:id { name?, address?, phone?, contactPerson?, status? } — only the fields sent change;
// a blank contact person clears it.
exports.updateBranch = async (req, res) => {
  const branch = await db.one('SELECT * FROM hospital_branches WHERE id = ?', [req.params.id]);
  if (!branch) throw notFound('Branch not found.');
  const status = req.body && req.body.status;
  if (status && !['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose a valid branch status.');
  const { value, errors, ok } = validate(req.body, BRANCH_SCHEMA, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await db.query(
    `UPDATE hospital_branches SET name = COALESCE(?, name), address = COALESCE(?, address), phone = COALESCE(?, phone),
       contact_person = CASE WHEN ? THEN ? ELSE contact_person END, status = COALESCE(?, status) WHERE id = ?`,
    [value.name || null, value.address || null, value.phone || null, value.contactPerson !== undefined ? 1 : 0, value.contactPerson || null, status || null, branch.id]
  );
  const after = await db.one('SELECT * FROM hospital_branches WHERE id = ?', [branch.id]);
  const changed = ['name', 'address', 'phone', 'contact_person', 'status'].filter((k) => branch[k] !== after[k]);
  await auditLog.record({ req, action: 'BRANCH_UPDATED', entityType: 'HOSPITAL_BRANCH', entityId: branch.id,
    summary: `Branch ${after.name}: ${changed.length ? changed.join(', ') : 'no'} change${changed.length === 1 ? '' : 's'}${status ? ` (${status})` : ''}`,
    previousValue: Object.fromEntries(changed.map((k) => [k, branch[k]])), newValue: Object.fromEntries(changed.map((k) => [k, after[k]])) });
  const message = status && status !== branch.status ? `Branch ${status === 'ACTIVE' ? 'activated' : 'deactivated'}.` : 'Branch details saved.';
  res.json({ ok: true, message });
};

// ---- Booking policy -----------------------------------------------------------------
// Cancellation window, refund % and how far ahead patients can book. The patient app applies these
// (services/patient/common.js hoursOf); a hospital without its own row uses the defaults.
const { hoursOf, policyDefaults } = require('../../services/patient/common');

const POLICY_SCHEMA = {
  cancellationWindowHours: { label: 'Free cancellation window', type: 'number', required: true, integer: true, min: 0, max: 168 },
  refundPercent: { label: 'Refund', type: 'number', required: true, integer: true, min: 0, max: 100 },
  bookingWindowDays: { label: 'Booking window', type: 'number', required: true, integer: true, min: 1, max: 180 },
};

// GET /api/admin/hospitals/:id/policy
exports.getPolicy = async (req, res) => {
  await load(req.params.id);
  res.json({ policy: await hoursOf(req.params.id), defaults: await policyDefaults() });
};

// PUT /api/admin/hospitals/:id/policy { cancellationWindowHours, refundPercent, bookingWindowDays }
exports.updatePolicy = async (req, res) => {
  const hospital = await load(req.params.id);
  const { value, errors, ok } = validate(req.body, POLICY_SCHEMA);
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const before = await hoursOf(hospital.id);
  await db.query(
    `INSERT INTO hospital_policies (hospital_id, cancellation_window_hours, refund_percent, booking_window_days) VALUES (?, ?, ?, ?)
     ON CONFLICT (hospital_id) DO UPDATE SET cancellation_window_hours = excluded.cancellation_window_hours,
       refund_percent = excluded.refund_percent, booking_window_days = excluded.booking_window_days`,
    [hospital.id, value.cancellationWindowHours, value.refundPercent, value.bookingWindowDays]
  );
  const policy = await hoursOf(hospital.id);
  await auditLog.record({ req, action: 'HOSPITAL_POLICY_UPDATED', entityType: 'HOSPITAL', entityId: hospital.id,
    summary: `${hospital.name} booking policy: ${policy.cancellationWindowHours}h free cancellation, ${policy.refundPercent}% refund, book ${policy.bookingWindowDays} days ahead`,
    previousValue: { cancellationWindowHours: before.cancellationWindowHours, refundPercent: before.refundPercent, bookingWindowDays: before.bookingWindowDays, custom: before.custom },
    newValue: value });
  res.json({ ok: true, message: 'Booking policy saved. It applies to new cancellations and bookings in the patient app.', policy });
};

// GET /api/admin/branches/:id/usage — doctors and live QR codes tied to the branch.
exports.branchUsage = async (req, res) => {
  const branch = await db.one('SELECT id FROM hospital_branches WHERE id = ?', [req.params.id]);
  if (!branch) throw notFound('Branch not found.');
  res.json(await require('../../services/branches').branchUsage(branch.id));
};

// POST /api/admin/hospitals/:id/documents/:docId/withdraw { reason }
// Takes a document out of KYC (uploaded by mistake, superseded). The row and file are kept for audit.
exports.withdrawDocument = async (req, res) => {
  const hospital = await load(req.params.id);
  const doc = await db.one('SELECT * FROM hospital_documents WHERE id = ? AND hospital_id = ?', [req.params.docId, hospital.id]);
  if (!doc) throw notFound('Document not found.');
  if (doc.status === 'WITHDRAWN') throw badRequest('This document is already withdrawn.');
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
  if (!reason) throw badRequest('Enter the reason for withdrawing this document.', { reason: 'Enter a reason.' });
  await db.query("UPDATE hospital_documents SET status = 'WITHDRAWN', withdrawn_reason = ?, withdrawn_by = ?, withdrawn_at = CURRENT_TIMESTAMP WHERE id = ?", [reason, req.user.id, doc.id]);
  await auditLog.record({ req, action: 'DOCUMENT_WITHDRAWN', entityType: 'HOSPITAL_DOCUMENT', entityId: doc.id, summary: `${doc.doc_type} for ${hospital.id} withdrawn: ${reason}`, previousValue: { status: doc.status } });
  // Verified KYC can't stand on a document that is no longer there.
  let message = 'Document withdrawn. It no longer counts towards KYC.';
  if (hospital.kyc_status === 'VERIFIED' && doc.status === 'VERIFIED' && (await kycChecklist(hospital)).some((c) => c.status !== 'VERIFIED')) {
    await db.query("UPDATE hospitals SET kyc_status = 'UNDER_REVIEW', kyc_reason = ?, kyc_decided_by = ?, kyc_decided_at = CURRENT_TIMESTAMP WHERE id = ?", [`${DOC_LABEL[doc.doc_type]} withdrawn: ${reason}`, req.user.id, hospital.id]);
    await auditLog.record({ req, action: 'HOSPITAL_KYC_UPDATED', entityType: 'HOSPITAL', entityId: hospital.id, summary: `${hospital.name} KYC: VERIFIED → UNDER_REVIEW (verified ${DOC_LABEL[doc.doc_type]} withdrawn)` });
    message = 'Document withdrawn. KYC is back to Under review because a verified document was withdrawn.';
  }
  res.json({ ok: true, message });
};

// ---- Departments (per hospital) ------------------------------------------------------------
// Archived departments are hidden from the patient app; doctors in them keep the label.

// GET /api/admin/hospitals/:id/departments
exports.listDepartments = async (req, res) => {
  const hospital = await load(req.params.id);
  const rows = await db.query(
    `SELECT dep.*, (SELECT COUNT(*) FROM doctors d WHERE d.department_id = dep.id) AS doctors
       FROM departments dep WHERE dep.hospital_id = ? ORDER BY dep.archived_at IS NOT NULL, dep.name`,
    [hospital.id]
  );
  res.json({ departments: rows.map((d) => ({ id: d.id, name: d.name, doctors: Number(d.doctors), archived: !!d.archived_at })) });
};

// POST /api/admin/hospitals/:id/departments { name }
exports.createDepartment = async (req, res) => {
  const hospital = await load(req.params.id);
  const { value, errors, ok } = validate(req.body, { name: { label: 'Department name', required: true, minLength: 2, maxLength: 60 } });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  if (await db.one('SELECT 1 FROM departments WHERE hospital_id = ? AND name = ?', [hospital.id, value.name])) throw badRequest('Please correct the highlighted fields.', { name: 'This hospital already has that department.' });
  await db.query('INSERT INTO departments (hospital_id, name) VALUES (?, ?)', [hospital.id, value.name]);
  await auditLog.record({ req, action: 'DEPARTMENT_CREATED', entityType: 'HOSPITAL', entityId: hospital.id, summary: `${hospital.name}: added department ${value.name}` });
  res.status(201).json({ ok: true, message: `${value.name} added.` });
};

// PATCH /api/admin/departments/:id { name?, archived? }
exports.updateDepartment = async (req, res) => {
  const dep = await db.one('SELECT * FROM departments WHERE id = ? AND hospital_id IS NOT NULL', [req.params.id]);
  if (!dep) throw notFound('Department not found.');
  const { value, errors, ok } = validate(req.body, { name: { label: 'Department name', required: true, minLength: 2, maxLength: 60 } }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  if (value.name && value.name !== dep.name && await db.one('SELECT 1 FROM departments WHERE hospital_id = ? AND name = ? AND id <> ?', [dep.hospital_id, value.name, dep.id])) {
    throw badRequest('Please correct the highlighted fields.', { name: 'This hospital already has that department.' });
  }
  const archived = req.body && typeof req.body.archived === 'boolean' ? req.body.archived : undefined;
  await db.query(
    `UPDATE departments SET name = COALESCE(?, name), archived_at = CASE WHEN ? = 1 THEN COALESCE(archived_at, CURRENT_TIMESTAMP) WHEN ? = 0 THEN NULL ELSE archived_at END WHERE id = ?`,
    [value.name || null, archived === true ? 1 : null, archived === false ? 0 : null, dep.id]
  );
  const what = archived === true ? 'archived' : archived === false ? 'restored' : `renamed to ${value.name}`;
  await auditLog.record({ req, action: 'DEPARTMENT_UPDATED', entityType: 'HOSPITAL', entityId: dep.hospital_id, summary: `Department ${dep.name} ${what}` });
  res.json({ ok: true, message: `Department ${what}.` });
};
