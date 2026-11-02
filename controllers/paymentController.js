// Payments are made by patients in the Gmedic app, or collected at the front desk (collect-payment).
// This screen lists them with the state of any refund.

const paymentModel = require('../models/paymentModel');
const { readFilters } = require('./appointmentController');

exports.list = async (req, res) => {
  const { status, ...filters } = readFilters(req.query); // drop appointment-status (irrelevant here)
  const rows = await paymentModel.forHospital(req.hospitalId, filters);

  const paid = rows.filter((a) => a.paymentStatus === 'PAID');
  const pending = rows.filter((a) => a.paymentStatus === 'PENDING');
  const sum = (list) => list.reduce((t, a) => t + a.fee, 0);

  const size = Math.min(Math.max(Number(req.query.pageSize) || 10, 1), 100);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(Math.max(Number(req.query.page) || 1, 1), pages);
  const items = rows.slice((page - 1) * size, page * size).map((a) => ({
    id: a.appointmentId,
    patientName: a.patientName,
    doctorId: a.doctorId,
    doctorName: a.doctorName,
    specialization: a.specialization,
    date: a.date,
    time: a.time,
    fee: a.fee,
    paymentStatus: a.paymentStatus.toLowerCase(),
    payment: a.payment,
    // A cancelled appointment that was paid is exactly the row that may need a refund.
    appointmentStatus: a.appointmentStatus,
    refunded: a.refunded,
    refundable: a.paymentStatus === 'PAID' && !(a.payment && a.payment.gateway === 'FRONT_DESK') ? Math.max(0, a.fee - a.refunded) : 0,
    refundStatus: a.refundStatus,
    collectedAtDesk: !!(a.payment && a.payment.gateway === 'FRONT_DESK'),
  }));

  res.json({
    items, total: rows.length, page, pageSize: size, pages,
    summary: {
      collected: sum(paid),
      pendingAmount: sum(pending),
      paidCount: paid.length,
      pendingCount: pending.length,
      total: rows.length,
    },
  });
};
