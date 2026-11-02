// One-off (safe to re-run): moves today's and future bookings to slot-based token numbers and gives each
// one its queue token, as every new booking now gets (services/bookingCore.js slotTokenNumber /
// issueQueueToken). Bookings whose token is already called, in consultation or completed are left as
// they are; past days are history and are not touched.
//   node scripts/assign-slot-tokens.js            (DB_FILE=... to point at another database)
const db = require('../db');
const bookingCore = require('../services/bookingCore');

async function assignSlotTokens() {
  const days = await db.query(
    `SELECT DISTINCT a.doctor_id, a.appt_date FROM appointments a JOIN hospitals h ON h.id = a.hospital_id
      WHERE a.status IN ('confirmed', 'pending') AND a.no_show = 0 AND a.appt_date >= date('now', 'localtime')
      ORDER BY a.appt_date, a.doctor_id`
  );
  let renumbered = 0;
  for (const { doctor_id: doctorId, appt_date: date } of days) {
    await db.tx(async (conn) => {
      const appts = await conn.query(
        `SELECT a.* FROM appointments a
          WHERE a.doctor_id = ? AND a.appt_date = ? AND a.status IN ('confirmed', 'pending') AND a.no_show = 0
            AND NOT EXISTS (SELECT 1 FROM tokens t WHERE t.appointment_id = a.id AND t.status IN ('called', 'in_consultation', 'completed'))
          ORDER BY a.appt_time, a.seat_no, a.id`,
        [doctorId, date]
      );
      if (!appts.length) return;
      // Free every number these bookings hold first, so swapping numbers between them never collides.
      for (const a of appts) {
        await conn.query("DELETE FROM tokens WHERE appointment_id = ? AND status IN ('waiting', 'skipped', 'cancelled')", [a.id]);
        await conn.query('UPDATE appointments SET token_no = NULL WHERE id = ?', [a.id]);
      }
      for (const a of appts) {
        const seat = a.seat_no || 1;
        const number = await bookingCore.slotTokenNumber(conn, { doctorId, date, time: a.appt_time, seat, ignoreAppointmentId: a.id });
        await conn.query('UPDATE appointments SET token_no = ? WHERE id = ?', [number, a.id]);
        await bookingCore.issueQueueToken(conn, { hospitalId: a.hospital_id, appointmentId: a.id, doctorId, date, number });
        renumbered += 1;
      }
    });
  }
  return { days: days.length, renumbered };
}

module.exports = { assignSlotTokens };

if (require.main === module) {
  assignSlotTokens()
    .then((r) => console.log(`Slot-based tokens: ${r.renumbered} booking(s) across ${r.days} doctor-day(s).`))
    .catch((err) => { console.error(err); process.exitCode = 1; });
}
