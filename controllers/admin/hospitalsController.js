const db = require('../../db');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../../config');

const STATUSES = ['ONBOARDING', 'ACTIVE', 'SUSPENDED', 'OFFBOARDED'];
const KYC_STATUSES = ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'];
const DOC_TYPES = ['LICENCE', 'BANK_PROOF', 'GST_CERTIFICATE', 'REGISTRATION'];
const BOOKING_MODELS = ['FULL_PREPAY', 'BOOKING_FEE', 'TOKEN'];

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
    status: row.status,
    statusReason: row.status_reason,
    kycStatus: row.kyc_status,
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
  gstin: { label: 'GSTIN', maxLength: 15 },
  registrationNumber: { label: 'Registration number', maxLength: 40 },
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, createSchema);
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);

  const id = await db.nextId('hospitals', 'HSP', 1);
  await db.query(
    `INSERT INTO hospitals (id, name, address_line1, city, state, pincode, contact_person, phone, email, gstin, registration_number, status, kyc_status, onboarding_step)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ONBOARDING', 'PENDING', 1)`,
    [id, value.name, value.line1, value.city, value.state, value.pincode, value.contactPerson || null, value.phone, value.email, value.gstin || null, value.registrationNumber || null]
  );
  const qrId = `QR${id}`;
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
  const { value, errors, ok } = validate(req.body, { ...createSchema, name: { ...createSchema.name, required: false } }, { partial: true });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);

  await db.query(
    `UPDATE hospitals SET name = COALESCE(?, name), phone = COALESCE(?, phone), email = COALESCE(?, email),
       address_line1 = COALESCE(?, address_line1), city = COALESCE(?, city), state = COALESCE(?, state), pincode = COALESCE(?, pincode),
       contact_person = COALESCE(?, contact_person), gstin = COALESCE(?, gstin), registration_number = COALESCE(?, registration_number)
     WHERE id = ?`,
    [value.name ?? null, value.phone ?? null, value.email ?? null, value.line1 ?? null, value.city ?? null, value.state ?? null, value.pincode ?? null, value.contactPerson ?? null, value.gstin ?? null, value.registrationNumber ?? null, req.params.id]
  );
  const after = await load(req.params.id);
  await auditLog.record({ req, action: 'HOSPITAL_UPDATED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `Updated ${after.name}`, previousValue: fromRow(before), newValue: fromRow(after) });
  res.json({ ok: true, message: 'Hospital details updated.', hospital: fromRow(after) });
};

// Suspending/offboarding a hospital only flips its status — appointments,
// payments and audit history are never deleted (spec requirement).
exports.setStatus = async (req, res) => {
  const before = await load(req.params.id);
  const { status, reason } = req.body || {};
  if (!STATUSES.includes(status)) throw badRequest('Choose a valid hospital status.');
  if ((status === 'SUSPENDED' || status === 'OFFBOARDED') && !String(reason || '').trim()) {
    throw badRequest('A reason is required.', { reason: 'Enter a reason.' });
  }
  await db.query(
    `UPDATE hospitals SET status = ?, status_reason = ?, activated_at = CASE WHEN ? = 'ACTIVE' AND activated_at IS NULL THEN CURRENT_TIMESTAMP ELSE activated_at END WHERE id = ?`,
    [status, reason || null, status, req.params.id]
  );
  const after = await load(req.params.id);
  await auditLog.record({
    req, action: `HOSPITAL_${status}`, entityType: 'HOSPITAL', entityId: req.params.id,
    summary: `${before.name}: ${before.status} → ${status}${reason ? ` (${reason})` : ''}`,
    previousValue: { status: before.status }, newValue: { status, reason },
  });
  res.json({ ok: true, message: `${after.name} is now ${status.replace('_', ' ').toLowerCase()}.`, hospital: fromRow(after) });
};

exports.setFees = async (req, res) => {
  const before = await load(req.params.id);
  const { value, errors, ok } = validate(req.body, {
    bookingModel: { label: 'Booking model', type: 'enum', required: true, values: BOOKING_MODELS },
    bookingFee: { label: 'Booking fee', type: 'number', required: true, min: 0, max: 100000 },
    convenienceFee: { label: 'Convenience fee', type: 'number', required: true, min: 0, max: 100000 },
    commissionType: { label: 'Commission type', type: 'enum', required: true, values: ['PERCENT', 'FLAT'] },
    commissionValue: { label: 'Commission value', type: 'number', required: true, min: 0, max: 100000 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  await db.query(
    'UPDATE hospitals SET booking_model = ?, booking_fee = ?, convenience_fee = ?, commission_type = ?, commission_value = ? WHERE id = ?',
    [value.bookingModel, value.bookingFee, value.convenienceFee, value.commissionType, value.commissionValue, req.params.id]
  );
  const after = await load(req.params.id);
  await auditLog.record({ req, action: 'HOSPITAL_FEES_UPDATED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `Updated fee/commission model for ${after.name}`, previousValue: { bookingModel: before.booking_model, commissionValue: before.commission_value }, newValue: fromRow(after) });
  res.json({ ok: true, message: 'Fee and commission model updated.', hospital: fromRow(after) });
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
    })),
  });
};

exports.uploadDocument = async (req, res) => {
  await load(req.params.id);
  const docType = req.body.docType;
  if (!DOC_TYPES.includes(docType)) throw badRequest('Choose a valid document type.');
  if (!req.file) throw badRequest('Choose a PDF, PNG or JPEG file (max 8MB).');
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

// The commission / fee rules in force over time (written by a trigger on every change).
exports.listRateHistory = async (req, res) => {
  await load(req.params.id);
  const rows = await db.query('SELECT * FROM hospital_rate_history WHERE hospital_id = ? ORDER BY effective_from DESC, id DESC', [req.params.id]);
  res.json({
    rates: rows.map((r) => ({
      id: r.id, bookingModel: r.booking_model, bookingFee: r.booking_fee == null ? null : Number(r.booking_fee), convenienceFee: r.convenience_fee == null ? null : Number(r.convenience_fee),
      commissionType: r.commission_type, commissionValue: Number(r.commission_value), effectiveFrom: db.iso(r.effective_from),
    })),
  });
};

exports.setKycStatus = async (req, res) => {
  const before = await load(req.params.id);
  const { status, reason } = req.body || {};
  if (!KYC_STATUSES.includes(status)) throw badRequest('Choose a valid KYC status.');
  await db.query('UPDATE hospitals SET kyc_status = ? WHERE id = ?', [status, req.params.id]);
  const after = await load(req.params.id);
  await auditLog.record({ req, action: 'HOSPITAL_KYC_UPDATED', entityType: 'HOSPITAL', entityId: req.params.id, summary: `${before.name} KYC: ${before.kyc_status} → ${status}${reason ? ` (${reason})` : ''}`, previousValue: { kycStatus: before.kyc_status }, newValue: { kycStatus: status } });
  res.json({ ok: true, message: `KYC status set to ${status.replace('_', ' ').toLowerCase()}.`, hospital: fromRow(after) });
};

// ---- Branches ---------------------------------------------------------------

exports.listBranches = async (req, res) => {
  const rows = await db.query('SELECT * FROM hospital_branches WHERE hospital_id = ? ORDER BY created_at DESC', [req.params.id]);
  res.json({ branches: rows.map((b) => ({ id: b.id, name: b.name, address: b.address, contactPerson: b.contact_person, phone: b.phone, status: b.status })) });
};

exports.createBranch = async (req, res) => {
  await load(req.params.id);
  const { value, errors, ok } = validate(req.body, {
    name: { label: 'Branch name', required: true, minLength: 2, maxLength: 120 },
    address: { label: 'Address', required: true, minLength: 5, maxLength: 255 },
    phone: { label: 'Contact number', type: 'phone', required: true },
    contactPerson: { label: 'Contact person', maxLength: 80 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const id = await db.nextId('hospital_branches', 'BR', 1);
  await db.query('INSERT INTO hospital_branches (id, hospital_id, name, address, contact_person, phone) VALUES (?, ?, ?, ?, ?, ?)', [id, req.params.id, value.name, value.address, value.contactPerson || null, value.phone]);
  await auditLog.record({ req, action: 'BRANCH_CREATED', entityType: 'HOSPITAL_BRANCH', entityId: id, summary: `Added branch ${value.name} to ${req.params.id}` });
  res.status(201).json({ ok: true, message: 'Branch added.' });
};

exports.updateBranch = async (req, res) => {
  const branch = await db.one('SELECT * FROM hospital_branches WHERE id = ?', [req.params.id]);
  if (!branch) throw notFound('Branch not found.');
  const status = req.body && req.body.status;
  if (status && !['ACTIVE', 'INACTIVE'].includes(status)) throw badRequest('Choose a valid branch status.');
  await db.query('UPDATE hospital_branches SET status = COALESCE(?, status) WHERE id = ?', [status || null, req.params.id]);
  await auditLog.record({ req, action: 'BRANCH_UPDATED', entityType: 'HOSPITAL_BRANCH', entityId: req.params.id, summary: `Branch ${branch.name}${status ? `: ${status}` : ' updated'}` });
  res.json({ ok: true, message: 'Branch updated.' });
};
