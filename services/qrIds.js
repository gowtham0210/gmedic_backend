// QR code ids: QR-<hospitalId>-<NN>, numbered per hospital (QR-HSP001-01,
// QR-HSP001-02, …; 3+ digits once a hospital passes 99 codes). Every place that
// creates a qr_codes row uses this, so ids stay consistent (see migration 012).

async function nextQrId(db, hospitalId) {
  const prefix = `QR-${hospitalId}-`;
  const row = await db.one(
    'SELECT MAX(CAST(substr(id, ?) AS INTEGER)) AS n FROM qr_codes WHERE hospital_id = ? AND id LIKE ?',
    [prefix.length + 1, hospitalId, `${prefix}%`]
  );
  return `${prefix}${String((Number(row && row.n) || 0) + 1).padStart(2, '0')}`;
}

module.exports = { nextQrId };
