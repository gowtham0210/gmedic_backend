const doctorModel = require('../models/doctorModel');
const appointmentModel = require('../models/appointmentModel');
const hospitalModel = require('../models/hospitalModel');
const tokenModel = require('../models/tokenModel');
const db = require('../db');
const { toISODate, addDays, parseISODate, timeInZone } = require('../utils/dates');

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);

exports.summary = async (req, res) => {
  const hid = req.hospitalId;
  // The hospital's today (not the server's) and the time there now.
  const tz = ((await db.one('SELECT timezone FROM hospitals WHERE id = ?', [hid])) || {}).timezone;
  const today = await appointmentModel.hospitalToday(hid);
  const yesterday = toISODate(addDays(parseISODate(today), -1));

  // Deactivated doctors (left the hospital) aren't counted as present or absent.
  const doctors = (await doctorModel.all(hid)).filter((d) => d.status !== 'INACTIVE');
  const present = doctors.filter((d) => d.availability === 'present').length;
  const absent = doctors.length - present;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const newThisMonth = doctors.filter((d) => new Date(d.createdAt) >= monthStart).length;

  const todaysRaw = await appointmentModel.query(hid, { date: today });
  const todays = appointmentModel.sortRows(todaysRaw, 'date_asc');
  const activeToday = todays.filter((a) => a.status !== 'cancelled');
  const yesterdayRows = await appointmentModel.query(hid, { date: yesterday });
  const yesterdayCount = yesterdayRows.filter((a) => a.status !== 'cancelled').length;
  const paidToday = activeToday.filter((a) => a.paymentStatus === 'paid').length;

  // Quick view: doctors grouped by specialisation.
  const bySpec = new Map();
  for (const d of doctors) {
    const s = bySpec.get(d.specialization) || { name: d.specialization, total: 0, present: 0 };
    s.total += 1;
    if (d.availability === 'present') s.present += 1;
    bySpec.set(d.specialization, s);
  }

  // Show today's schedule from the next upcoming appointment onwards.
  const now = timeInZone(tz);
  const lastWindow = Math.max(0, todays.length - 6);
  const next = todays.findIndex((a) => a.time >= now && a.status !== 'cancelled');
  const start = next === -1 ? lastWindow : Math.min(next, lastWindow);
  const todayList = todays.slice(start, start + 6);

  const todaysTokens = await tokenModel.query(hid, { date: today });

  const allAppts = await appointmentModel.query(hid, {});
  const recent = allAppts
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);

  res.json({
    date: today,
    stats: {
      totalDoctors: doctors.length,
      newThisMonth,
      present,
      absent,
      presentPct: pct(present, doctors.length),
      absentPct: pct(absent, doctors.length),
      todayAppointments: activeToday.length,
      yesterdayAppointments: yesterdayCount,
      changePct: yesterdayCount ? Math.round(((activeToday.length - yesterdayCount) / yesterdayCount) * 100) : 0,
      paidToday,
      paidPct: pct(paidToday, activeToday.length),
    },
    availability: {
      total: doctors.length,
      present,
      absent,
      bySpecialization: [...bySpec.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name)),
    },
    today: todayList,
    todayTotal: todays.length,
    recent,
    tokens: {
      ...tokenModel.summarize(todaysTokens),
      nowCalling: todaysTokens.filter((t) => t.status === 'called').slice(0, 2),
    },
    hospital: await hospitalModel.toPublic(await hospitalModel.findById(hid)),
  });
};
