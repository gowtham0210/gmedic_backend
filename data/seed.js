// Realistic sample data for the first working version of the portal.
// Appointments are generated around "today" so the dashboard always looks live.

const crypto = require('crypto');
const { hashPassword } = require('../utils/password');
const { toISODate, startOfToday, addDays, pad } = require('../utils/dates');

// Small deterministic PRNG so every regeneration on a given day looks the same.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rand, arr) => arr[Math.floor(rand() * arr.length)];

const HOSPITAL_ID = 'HSP001';

const PATIENTS = [
  'Rahul Mehta', 'Ananya Singh', 'Vikram Rao', 'Sneha Iyer', 'Karan Patel', 'Aditi Verma',
  'Rohan Gupta', 'Pooja Reddy', 'Arjun Nair', 'Kavya Menon', 'Siddharth Joshi', 'Neha Kapoor',
  'Aman Choudhary', 'Divya Pillai', 'Harsh Vardhan', 'Ishita Banerjee', 'Manish Tiwari',
  'Nandini Krishnan', 'Omkar Patil', 'Priyanka Das', 'Rakesh Yadav', 'Shalini Bhat',
  'Tarun Saxena', 'Uma Shankar', 'Varun Hegde', 'Yash Agarwal', 'Zoya Sheikh', 'Deepak Chauhan',
  'Fatima Qureshi', 'Gaurav Sinha', 'Meghna Roy', 'Sanjay Bose', 'Lavanya Raghavan',
  'Abhishek Mishra', 'Ritu Malhotra', 'Suresh Gowda', 'Tanvi Kulkarni', 'Imran Siddiqui',
];

function buildDoctors(today) {
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonth = (daysAgo) => {
    const d = addDays(today, -daysAgo);
    return (d < monthStart ? monthStart : d).toISOString();
  };
  const monthsAgo = (m) => new Date(today.getFullYear(), today.getMonth() - m, 10).toISOString();

  const rows = [
    ['DOC101', 'Dr. Arun Srinivasan', 'Cardiologist', 800, 'present', monthsAgo(14)],
    ['DOC102', 'Dr. Priya Nair', 'Dermatologist', 600, 'present', monthsAgo(11)],
    ['DOC103', 'Dr. Sameer Khan', 'Orthopedist', 700, 'present', monthsAgo(10)],
    ['DOC104', 'Dr. Anjali Rao', 'Gynecologist', 700, 'present', monthsAgo(9)],
    ['DOC105', 'Dr. Vikram Thakur', 'General Physician', 400, 'present', monthsAgo(8)],
    ['DOC106', 'Dr. Meera Iyer', 'Cardiologist', 750, 'present', monthsAgo(7)],
    ['DOC107', 'Dr. Karan Malhotra', 'Dermatologist', 500, 'absent', monthsAgo(6)],
    ['DOC108', 'Dr. Rohit Deshpande', 'Orthopedist', 650, 'absent', monthsAgo(5)],
    ['DOC109', 'Dr. Sneha Kulkarni', 'General Physician', 400, 'present', monthsAgo(3)],
    ['DOC110', 'Dr. Lakshmi Menon', 'Pediatrician', 500, 'present', monthsAgo(2)],
    ['DOC111', 'Dr. Farhan Ali', 'General Physician', 350, 'present', thisMonth(6)],
    ['DOC112', 'Dr. Nikhil Joshi', 'ENT Specialist', 550, 'absent', thisMonth(2)],
  ];

  return rows.map(([id, name, specialization, fee, availability, createdAt]) => ({
    id,
    hospitalId: HOSPITAL_ID,
    name,
    specialization,
    fee,
    availability,
    availabilityUpdatedAt: new Date().toISOString(),
    createdAt,
    updatedAt: createdAt,
  }));
}

// 09:00 - 17:45 in 15 minute steps.
const SLOTS = [];
for (let h = 9; h < 18; h++) for (const m of [0, 15, 30, 45]) SLOTS.push(`${pad(h)}:${pad(m)}`);

function generateAppointments(doctors, today = startOfToday()) {
  const rand = mulberry32(Number(toISODate(today).replace(/-/g, '')));
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const list = [];
  let seq = 1;

  const present = doctors.filter((d) => d.availability === 'present');

  for (let offset = -30; offset <= 7; offset++) {
    const day = addDays(today, offset);
    const iso = toISODate(day);
    const sunday = day.getDay() === 0;

    let count;
    if (offset === 0) count = 24;
    else if (offset === -1) count = 22;
    else if (offset < 0) count = sunday ? 6 : 12 + Math.floor(rand() * 9);
    else count = Math.max(4, Math.round((sunday ? 5 : 14 + Math.floor(rand() * 6)) * (1 - offset * 0.09)));

    const pool = offset >= 0 && present.length ? present : doctors;
    const taken = new Set();

    for (let i = 0; i < count; i++) {
      let doctor;
      let time;
      let guard = 0;
      do {
        doctor = pick(rand, pool);
        time = pick(rand, SLOTS);
        guard++;
      } while (taken.has(`${doctor.id}@${time}`) && guard < 50);
      taken.add(`${doctor.id}@${time}`);

      const [hh, mm] = time.split(':').map(Number);
      const slotMinutes = hh * 60 + mm;
      const r = rand();
      let status;
      let paymentStatus;

      if (offset < 0 || (offset === 0 && slotMinutes < nowMinutes - 30)) {
        // Visit is in the past.
        if (r < 0.9) { status = 'completed'; paymentStatus = rand() < 0.97 ? 'paid' : 'pending'; }
        else { status = 'cancelled'; paymentStatus = 'pending'; }
      } else if (offset === 0) {
        if (r < 0.78) { status = 'confirmed'; paymentStatus = rand() < 0.86 ? 'paid' : 'pending'; }
        else { status = 'pending'; paymentStatus = 'pending'; }
      } else {
        if (r < 0.7) { status = 'confirmed'; paymentStatus = rand() < 0.8 ? 'paid' : 'pending'; }
        else if (r < 0.95) { status = 'pending'; paymentStatus = 'pending'; }
        else { status = 'cancelled'; paymentStatus = 'pending'; }
      }

      // Booked through the patient app 0-6 days ahead, never in the future.
      const booked = addDays(day, -Math.floor(rand() * 7));
      booked.setHours(7 + Math.floor(rand() * 14), Math.floor(rand() * 60), 0, 0);
      if (booked > now) booked.setTime(now.getTime() - Math.floor(rand() * 240 + 5) * 60000);

      let payment = null;
      if (paymentStatus === 'paid') {
        const paidAt = new Date(booked.getTime() + Math.floor(rand() * 20 + 1) * 60000);
        if (paidAt > now) paidAt.setTime(now.getTime() - 60000);
        const methodRoll = rand();
        payment = {
          method: methodRoll < 0.62 ? 'UPI' : methodRoll < 0.87 ? 'Card' : 'Net Banking',
          transactionId: `TXN${String(Math.floor(rand() * 1e10)).padStart(10, '0')}`,
          paidAt: paidAt.toISOString(),
        };
      }

      list.push({
        id: `APT${10000 + seq++}`,
        hospitalId: HOSPITAL_ID,
        patientName: pick(rand, PATIENTS),
        doctorId: doctor.id,
        date: iso,
        time,
        fee: doctor.fee,
        status,
        paymentStatus,
        payment,
        source: 'Gmedic App',
        createdAt: booked.toISOString(),
        updatedAt: booked.toISOString(),
      });
    }
  }

  return list.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Sample reception tokens for the last week and today. Numbers restart at T001
// for every hospital/day. A few of today's confirmed visits are left without a
// token so the receptionist can generate one.
function generateTokens(appointments) {
  const today = startOfToday();
  const todayIso = toISODate(today);
  const now = new Date();
  const from = toISODate(addDays(today, -6));
  const tokens = [];
  let seq = 1;

  const byDate = new Map();
  for (const a of appointments) {
    if (a.date < from || a.date > todayIso) continue;
    if (!byDate.has(a.date)) byDate.set(a.date, []);
    byDate.get(a.date).push(a);
  }

  for (const [date, list] of [...byDate].sort(([x], [y]) => x.localeCompare(y))) {
    const isToday = date === todayIso;
    let visits = list
      .filter((a) => (isToday ? a.status === 'completed' || a.status === 'confirmed' : a.status === 'completed'))
      .sort((a, b) => a.time.localeCompare(b.time));
    // Leave the last few upcoming confirmed visits of today without tokens.
    if (isToday) {
      const upcoming = visits.filter((a) => a.status === 'confirmed');
      const untokened = new Set(upcoming.slice(-3).map((a) => a.id));
      visits = visits.filter((a) => !untokened.has(a.id));
    }

    let number = 0;
    let calledOne = false;
    let waitingSeen = 0;
    for (const a of visits) {
      number += 1;
      let status = 'completed';
      if (isToday && a.status === 'confirmed') {
        if (!calledOne) { status = 'called'; calledOne = true; }
        else {
          waitingSeen += 1;
          status = waitingSeen === 3 ? 'cancelled' : 'waiting';
        }
      }
      const [hh, mm] = a.time.split(':').map(Number);
      const issued = new Date(`${date}T00:00:00`);
      issued.setHours(hh, mm - 25, 0, 0);
      if (issued > now) issued.setTime(now.getTime() - (visits.length - number + 1) * 4 * 60000);
      const at = issued.toISOString();
      tokens.push({
        id: `TK${10000 + seq++}`,
        hospitalId: a.hospitalId,
        appointmentId: a.id,
        doctorId: a.doctorId,
        patientName: a.patientName,
        date,
        number,
        code: `T${String(number).padStart(3, '0')}`,
        status,
        createdAt: at,
        updatedAt: at,
        calledAt: status === 'called' || status === 'completed' ? at : null,
        completedAt: status === 'completed' ? at : null,
      });
    }
  }
  return tokens;
}

function generateDemoData() {
  const today = startOfToday();
  const doctors = buildDoctors(today);
  const appointments = generateAppointments(doctors, today);

  return {
    meta: {
      version: 1,
      demo: true,
      generatedFor: toISODate(today),
      createdAt: new Date().toISOString(),
    },
    hospitals: [
      {
        id: HOSPITAL_ID,
        name: 'Sunrise General Hospital',
        phone: '+91 98765 43210',
        email: 'care@sunrisegeneral.in',
        address: {
          line1: '123 Health Street, Green Park',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560001',
        },
        qrToken: crypto.randomBytes(12).toString('hex'),
        createdAt: new Date(today.getFullYear() - 2, 3, 1).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    users: [
      {
        id: 'USR001',
        role: 'receptionist',
        hospitalId: HOSPITAL_ID,
        name: 'Riya Sharma',
        username: 'riya.sharma',
        email: 'riya.sharma@sunrisegeneral.in',
        phone: '+91 98450 11223',
        passwordHash: hashPassword('Gmedic@123'),
        createdAt: new Date(today.getFullYear() - 1, 0, 15).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    doctors,
    appointments,
    tokens: generateTokens(appointments),
  };
}

module.exports = { generateDemoData, generateAppointments, generateTokens, HOSPITAL_ID };
