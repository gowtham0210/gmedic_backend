const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('../../db');
const config = require('../../config');
const { validate } = require('../../utils/validate');
const { badRequest, notFound } = require('../../utils/http');
const auditLog = require('../../services/auditLog');
const hospitalModel = require('../../models/hospitalModel');
const { buildPosterSvg } = require('../../services/qrPoster');
const { nextQrId } = require('../../services/qrIds');

const QR_COLORS = { dark: '#0F263D', light: '#FFFFFF' };

function fromRow(row) {
  return {
    id: row.id,
    qrKey: row.qr_key,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital_name,
    branchId: row.branch_id,
    deskLabel: row.desk_label,
    status: row.status,
    revokedReason: row.revoked_reason,
    link: `${config.qrBaseUrl}/${row.hospital_id}?k=${row.qr_key}`,
    createdAt: db.iso(row.created_at),
  };
}

exports.list = async (req, res) => {
  const { hospitalId, status, q } = req.query;
  const clauses = [];
  const params = [];
  if (hospitalId) { clauses.push('q.hospital_id = ?'); params.push(hospitalId); }
  if (status) { clauses.push('q.status = ?'); params.push(status); }
  if (q) { clauses.push('(h.name LIKE ? OR q.desk_label LIKE ? OR q.id LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await db.query(
    `SELECT q.*, h.name AS hospital_name,
       (SELECT COUNT(*) FROM qr_scans s WHERE s.qr_code_id = q.id) AS scan_count
     FROM qr_codes q JOIN hospitals h ON h.id = q.hospital_id ${where} ORDER BY q.created_at DESC`,
    params
  );
  res.json({ items: rows.map((r) => ({ ...fromRow(r), scanCount: Number(r.scan_count) })) });
};

exports.create = async (req, res) => {
  const { value, errors, ok } = validate(req.body, {
    hospitalId: { label: 'Hospital', required: true },
    deskLabel: { label: 'Desk / location', required: true, maxLength: 60 },
  });
  if (!ok) throw badRequest('Please correct the highlighted fields.', errors);
  const hospital = await db.one('SELECT id, name FROM hospitals WHERE id = ?', [value.hospitalId]);
  if (!hospital) throw badRequest('Choose a valid hospital.', { hospitalId: 'Choose a hospital.' });

  const id = await nextQrId(db, value.hospitalId);
  const qrKey = crypto.randomBytes(12).toString('hex');
  await db.query('INSERT INTO qr_codes (id, qr_key, hospital_id, desk_label, status, created_by) VALUES (?, ?, ?, ?, \'ACTIVE\', ?)', [id, qrKey, value.hospitalId, value.deskLabel, req.user.id]);
  await auditLog.record({ req, action: 'QR_CREATED', entityType: 'QR_CODE', entityId: id, summary: `Generated QR "${value.deskLabel}" for ${hospital.name}` });
  res.status(201).json({ ok: true, message: 'QR code generated.', id });
};

exports.revoke = async (req, res) => {
  const qr = await db.one('SELECT q.*, h.name AS hospital_name FROM qr_codes q JOIN hospitals h ON h.id=q.hospital_id WHERE q.id = ?', [req.params.id]);
  if (!qr) throw notFound('QR code not found.');
  const reason = req.body && req.body.reason;
  if (!String(reason || '').trim()) throw badRequest('A reason is required.', { reason: 'Enter a reason.' });
  await db.query("UPDATE qr_codes SET status = 'REVOKED', revoked_reason = ?, revoked_at = CURRENT_TIMESTAMP, revoked_by = ? WHERE id = ?", [reason, req.user.id, req.params.id]);
  await auditLog.record({ req, action: 'QR_REVOKED', entityType: 'QR_CODE', entityId: req.params.id, summary: `Revoked QR for ${qr.hospital_name}: ${reason}` });
  res.json({ ok: true, message: 'QR code revoked.' });
};

exports.reissue = async (req, res) => {
  const qr = await db.one('SELECT * FROM qr_codes WHERE id = ?', [req.params.id]);
  if (!qr) throw notFound('QR code not found.');
  const newId = await nextQrId(db, qr.hospital_id);
  const qrKey = crypto.randomBytes(12).toString('hex');
  await db.query('INSERT INTO qr_codes (id, qr_key, hospital_id, branch_id, desk_label, status, created_by) VALUES (?, ?, ?, ?, ?, \'ACTIVE\', ?)', [newId, qrKey, qr.hospital_id, qr.branch_id, qr.desk_label, req.user.id]);
  await db.query("UPDATE qr_codes SET status='REVOKED', revoked_reason='Reissued', revoked_at=CURRENT_TIMESTAMP, revoked_by=?, replaced_by=? WHERE id=?", [req.user.id, newId, req.params.id]);
  await auditLog.record({ req, action: 'QR_REISSUED', entityType: 'QR_CODE', entityId: newId, summary: `Reissued QR for hospital ${qr.hospital_id} (replaces ${req.params.id})` });
  res.status(201).json({ ok: true, message: 'A new QR code was issued; the old one is revoked.', id: newId });
};

// Loads an ACTIVE QR code for download. Revoked codes no longer resolve in the
// patient app, so printing one would only produce a dead poster.
async function loadActive(id) {
  const row = await db.one('SELECT q.*, h.name AS hospital_name FROM qr_codes q JOIN hospitals h ON h.id = q.hospital_id WHERE q.id = ?', [id]);
  if (!row) throw notFound('QR code not found.');
  if (row.status !== 'ACTIVE') throw badRequest('This QR code is revoked and can no longer be downloaded.');
  return fromRow(row);
}

const fileSlug = (qr) => `gmedic-qr-${qr.id.toLowerCase()}-${`${qr.hospitalName}-${qr.deskLabel}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;

exports.png = async (req, res) => {
  const qr = await loadActive(req.params.id);
  const size = Math.min(Math.max(Number(req.query.size) || 1024, 256), 2048);
  const buffer = await QRCode.toBuffer(qr.link, { type: 'png', errorCorrectionLevel: 'H', margin: 2, width: size, color: QR_COLORS });
  res.type('image/png').set('Cache-Control', 'no-store');
  if (req.query.download === '1') res.attachment(`${fileSlug(qr)}.png`);
  res.send(buffer);
};

// The branded "Skip the Queue" poster, encoding this specific QR code's link.
exports.poster = async (req, res) => {
  const qr = await loadActive(req.params.id);
  const hospital = await hospitalModel.findById(qr.hospitalId);
  if (!hospital) throw notFound('Hospital not found.');
  const svg = await buildPosterSvg(hospital, qr.link);
  res.type('image/svg+xml').set('Cache-Control', 'no-store');
  if (req.query.download === '1') res.attachment(`${fileSlug(qr)}-poster.svg`);
  res.send(svg);
};

exports.analytics = async (req, res) => {
  const rows = await db.query(
    `SELECT DATE(scanned_at) AS d, result, COUNT(*) AS n FROM qr_scans
     WHERE scanned_at >= date('now', '-13 days') GROUP BY d, result ORDER BY d`
  );
  const byDay = new Map();
  for (const r of rows) {
    const e = byDay.get(r.d) || { date: r.d, linked: 0, alreadyLinked: 0, failed: 0 };
    if (r.result === 'LINKED') e.linked = Number(r.n);
    if (r.result === 'ALREADY_LINKED') e.alreadyLinked = Number(r.n);
    if (r.result === 'FAILED') e.failed = Number(r.n);
    byDay.set(r.d, e);
  }
  const series = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  // Suspicious spike: any hospital with 3x its 7-day average scans in the last 24h.
  const spikes = await db.query(`
    SELECT hospital_id, h.name,
      SUM(scanned_at >= datetime('now', '-1 days')) AS last_day,
      SUM(scanned_at >= datetime('now', '-7 days')) / 7 AS daily_avg
    FROM qr_scans s JOIN hospitals h ON h.id = s.hospital_id
    GROUP BY hospital_id, h.name HAVING last_day > 5 AND last_day > daily_avg * 3
  `);
  res.json({
    series,
    isSample: true,
    spikes: spikes.map((s) => ({ hospitalId: s.hospital_id, hospitalName: s.name, lastDay: Number(s.last_day), dailyAvg: Math.round(Number(s.daily_avg) * 10) / 10 })),
  });
};
