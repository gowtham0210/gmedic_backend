// NOTE: this Express controller is kept only for the legacy `npm run legacy:*`
// server. The Next.js app (the primary app going forward) uses
// lib/admin/getDashboardData.js directly from a Server Component / Route
// Handler instead of going through Express — the query logic is duplicated
// here rather than shared, since this file is CommonJS and that one is ESM.

const db = require('../../db');

exports.summary = async (req, res) => {
  const [
    hospitalCounts, doctorCount, receptionistCount, patientCount,
    todayAppts, todayRevenue, paymentRates, pendingKyc, pendingRefunds, todayScans,
    bookingTrend, revenueTrend, qrFunnel, hospitalGrowth,
    recentHospitals, recentAppointments,
    pendingHospitals, pendingDoctors, pendingRefundList, openTickets, paymentIssues,
  ] = await Promise.all([
    db.query("SELECT status, COUNT(*) AS n FROM hospitals GROUP BY status"),
    db.one('SELECT COUNT(*) AS n FROM doctors'),
    db.one("SELECT COUNT(*) AS n FROM users WHERE role = 'RECEPTIONIST'"),
    db.one('SELECT COUNT(*) AS n FROM patients'),
    db.one("SELECT COUNT(*) AS n FROM appointments WHERE appt_date = date('now') AND status <> 'cancelled'"),
    db.one("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE status='PAID' AND DATE(paid_at) = date('now')"),
    db.one("SELECT SUM(status='PAID') AS paid, SUM(status IN ('PAID','FAILED')) AS attempted FROM payments WHERE created_at >= datetime('now', '-30 days')"),
    db.one("SELECT COUNT(*) AS n FROM hospitals WHERE kyc_status IN ('PENDING','UNDER_REVIEW')"),
    db.one("SELECT COUNT(*) AS n FROM refunds WHERE status = 'PENDING'"),
    db.one("SELECT COUNT(*) AS n FROM qr_scans WHERE DATE(scanned_at) = date('now')"),
    db.query(`SELECT appt_date AS d, SUM(status <> 'cancelled') AS booked, SUM(status='completed') AS completed, SUM(status='cancelled') AS cancelled
               FROM appointments WHERE appt_date >= date('now', '-13 days') AND appt_date <= date('now')
               GROUP BY appt_date ORDER BY appt_date`),
    db.query(`SELECT DATE(pay.created_at) AS d,
                 SUM(CASE WHEN pay.status='PAID' THEN pay.amount ELSE 0 END) AS gross,
                 (SELECT COALESCE(SUM(amount),0) FROM refunds r WHERE r.status='COMPLETED' AND DATE(r.completed_at) = DATE(pay.created_at)) AS refunded
               FROM payments pay WHERE pay.created_at >= datetime('now', '-13 days')
               GROUP BY DATE(pay.created_at) ORDER BY d`),
    db.one(`SELECT COUNT(*) AS scans, SUM(result IN ('LINKED','ALREADY_LINKED')) AS linked,
                 (SELECT COUNT(*) FROM appointments WHERE created_at >= datetime('now', '-30 days')) AS bookings,
                 (SELECT COUNT(*) FROM payments WHERE status='PAID' AND created_at >= datetime('now', '-30 days')) AS payments
               FROM qr_scans WHERE scanned_at >= datetime('now', '-30 days')`),
    db.query(`SELECT strftime('%Y-%m', created_at) AS m, COUNT(*) AS n FROM hospitals
               WHERE created_at >= date('now', '-5 months') GROUP BY m ORDER BY m`),
    db.query(`SELECT id, name, city, state, status, kyc_status, created_at FROM hospitals ORDER BY created_at DESC LIMIT 6`),
    db.query(`SELECT a.id, p.name AS patient_name, h.name AS hospital_name, d.name AS doctor_name, a.appt_date, a.payment_status
               FROM appointments a JOIN hospitals h ON h.id=a.hospital_id JOIN doctors d ON d.id=a.doctor_id LEFT JOIN patients p ON p.id=a.patient_id
               ORDER BY a.created_at DESC LIMIT 6`),
    db.query(`SELECT id, name, kyc_status FROM hospitals WHERE kyc_status IN ('PENDING','UNDER_REVIEW') ORDER BY created_at DESC LIMIT 5`),
    db.query(`SELECT id, name, hospital_id FROM doctors WHERE verification_status='PENDING' ORDER BY created_at DESC LIMIT 5`),
    db.query(`SELECT r.id, r.amount, h.name AS hospital_name FROM refunds r JOIN appointments a ON a.id=r.appointment_id JOIN hospitals h ON h.id=a.hospital_id WHERE r.status='PENDING' ORDER BY r.created_at DESC LIMIT 5`),
    db.query(`SELECT id, subject, priority FROM support_tickets WHERE status IN ('OPEN','IN_PROGRESS') ORDER BY sla_due_at LIMIT 5`),
    db.query(`SELECT pay.id, pay.transaction_id, pay.failure_reason FROM payments pay WHERE pay.status='FAILED' ORDER BY pay.created_at DESC LIMIT 5`),
  ]);

  const countBy = (rows, key) => Number((rows.find((r) => r.status === key) || {}).n) || 0;
  const total = hospitalCounts.reduce((t, r) => t + Number(r.n), 0);

  res.json({
    cards: {
      totalHospitals: total,
      activeHospitals: countBy(hospitalCounts, 'ACTIVE'),
      suspendedHospitals: countBy(hospitalCounts, 'SUSPENDED'),
      totalDoctors: Number(doctorCount.n),
      totalReceptionists: Number(receptionistCount.n),
      totalPatients: Number(patientCount.n),
      todayAppointments: Number(todayAppts.n),
      todayRevenue: Number(todayRevenue.n),
      paymentSuccessRate: paymentRates.attempted ? Math.round((paymentRates.paid / paymentRates.attempted) * 100) : 100,
      pendingKyc: Number(pendingKyc.n),
      pendingRefunds: Number(pendingRefunds.n),
      todayQrScans: Number(todayScans.n),
    },
    bookingTrend: bookingTrend.map((r) => ({ date: r.d, booked: Number(r.booked), completed: Number(r.completed), cancelled: Number(r.cancelled) })),
    revenueTrend: revenueTrend.map((r) => ({ date: r.d, gross: Number(r.gross), refunded: Number(r.refunded) })),
    qrFunnel: { scans: Number(qrFunnel.scans) || 0, linked: Number(qrFunnel.linked) || 0, bookings: Number(qrFunnel.bookings) || 0, payments: Number(qrFunnel.payments) || 0 },
    hospitalGrowth: hospitalGrowth.map((r) => ({ month: r.m, count: Number(r.n) })),
    recentHospitals: recentHospitals.map((h) => ({ id: h.id, name: h.name, location: [h.city, h.state].filter(Boolean).join(', '), status: h.status, kycStatus: h.kyc_status, createdAt: db.iso(h.created_at) })),
    recentAppointments: recentAppointments.map((a) => ({ id: a.id, patientName: a.patient_name, hospitalName: a.hospital_name, doctorName: a.doctor_name, date: a.appt_date, paymentStatus: a.payment_status })),
    pending: {
      kyc: pendingHospitals.map((h) => ({ id: h.id, name: h.name, kycStatus: h.kyc_status })),
      doctorVerification: pendingDoctors.map((d) => ({ id: d.id, name: d.name, hospitalId: d.hospital_id })),
      refunds: pendingRefundList.map((r) => ({ id: r.id, amount: Number(r.amount), hospitalName: r.hospital_name })),
      supportTickets: openTickets.map((t) => ({ id: t.id, subject: t.subject, priority: t.priority })),
      paymentIssues: paymentIssues.map((p) => ({ id: p.id, transactionId: p.transaction_id, reason: p.failure_reason })),
    },
  });
};
