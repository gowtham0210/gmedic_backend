// Same-day working hours: adding a block for today, versus editing or removing existing hours. Run: npm test
// They run on a throwaway COPY of data/gmedic.sqlite (the working database is never written) and need hospital HSP2, doctor DOC101
// (cloned as a clean test doctor DOCS1), and receptionist USR901, as the demo data does.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gmedic-sched-'));
const dbFile = path.join(tmp, 'test.sqlite');
const source = new DatabaseSync(path.join(__dirname, '..', 'data', 'gmedic.sqlite'), { readOnly: true });
source.exec(`VACUUM INTO '${dbFile.split(path.sep).join('/')}'`);
source.close();
process.env.DB_FILE = dbFile;

const test = require('node:test');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const rq = (p) => require(path.join(root, p));
const db = rq('db');
const { migrate } = rq('db/migrate');
const rb = rq('services/receptionBooking');
const core = rq('services/bookingCore');
const emergency = rq('services/emergencyWalkIn');
const scheduleModel = rq('models/doctorScheduleModel');
const doctorModel = rq('models/doctorModel');
const scheduleController = rq('controllers/doctor/scheduleController');
const doctorController = rq('controllers/doctorController');
const { nowIn, hhmm, addDays } = rq('services/patient/common');

const H = 'HSP2';
const DOC = 'DOCS1';
const now = nowIn('Asia/Kolkata');
const today = now.date;
const tomorrow = addDays(today, 1);
const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
const hh = (m) => hhmm(Math.max(0, Math.min(m, 24 * 60 - 1)));
// these cases need room in the day: a start an hour from now, finishing before midnight
const roomToday = now.minutes <= 21 * 60;
const R1 = { id: 'USR901', name: 'Desk One', role: 'RECEPTIONIST', hospitalId: H };
let mobile = 9500000100;
const pat = () => ({ name: `Sched Patient ${mobile}`, mobile: String(mobile++) });
const create = (extra) => scheduleModel.create(DOC, { dayOfWeek: weekday, startTime: hh(now.minutes + 60), endTime: hh(now.minutes + 120), slotMinutes: 15, capacityPerSlot: 2, ...extra });
const fakeRes = () => { const r = { body: null, json(b) { r.body = b; return r; }, status() { return r; } }; return r; };
const req = (body, extra = {}) => ({ hospitalId: H, doctorId: DOC, params: {}, query: {}, body, user: R1, ip: 'test', get: () => '', ...extra });
const rejects = (fn, status, match) => assert.rejects(fn, (e) => { assert.equal(e.status, status, `${e.status} ${e.message}`); if (match) assert.match(e.message + JSON.stringify(e.details || {}), match); return true; });
const blocksOn = async (date) => core.schedulesOn(db, DOC, date);
const allRows = async () => JSON.stringify([await db.query('SELECT * FROM appointments ORDER BY id'), await db.query('SELECT * FROM tokens ORDER BY id')]);
let before;
let first;

test('setup: a clean test doctor with no hours, and a snapshot of every existing appointment and token', async () => {
  await migrate();
  const row = await db.one('SELECT * FROM doctors WHERE id = ?', ['DOC101']);
  const r = { ...row, id: DOC, name: 'Dr. Schedule Test', registration_number: 'TEST-SCHED-1', department_id: null, availability: 'present' };
  const cols = Object.keys(r);
  await db.query(`INSERT INTO doctors (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`, cols.map((c) => r[c]));
  await db.query('UPDATE users SET can_book_emergency = 1 WHERE id = ?', [R1.id]);
  await db.query("UPDATE hospitals SET emergency_intake = 'OPEN' WHERE id = ?", [H]);
  before = await allRows();
  assert.equal((await db.query('SELECT * FROM doctor_schedules WHERE doctor_id = ?', [DOC])).length, 0);
  assert.equal((await doctorModel.findById(H, DOC)).scheduledToday, false, 'no hours yet: not scheduled today');
});

test('adding hours for today starts them TODAY (not tomorrow) when the start is still ahead and nobody is booked later', { skip: !roomToday && 'too late in the day to place an hour ahead' }, async () => {
  const start = hh(now.minutes + 60);
  const res = await create();
  assert.equal(res.error, undefined);
  assert.deepEqual([res.startsToday, res.effectiveFrom, res.firstDate], [true, today, today]);
  first = res.id;
  const row = await db.one('SELECT * FROM doctor_schedules WHERE id = ?', [first]);
  assert.deepEqual([row.effective_from, row.effective_to, row.day_of_week, row.start_time], [today, null, weekday, start], 'saved with today as its effective date');
  // the Doctor Portal list shows it as running, not as "starts later"
  const listed = (await scheduleModel.list(DOC)).find((b) => b.id === first);
  assert.equal(listed.startsLater, false);
  // every consumer reads the same effective dates
  assert.equal((await blocksOn(today)).length, 1, 'the booking core sees it today');
  assert.equal((await doctorModel.findById(H, DOC)).scheduledToday, true, 'the receptionist doctor list: scheduled today');
  const grid = await rb.slots(H, DOC, today);
  assert.equal(grid.closedReason, null);
  assert.equal(grid.slots.length, 4, 'a one-hour block of 15-minute slots: 4 slots');
  assert.ok(grid.slots.every((s) => s.status === 'available' && s.seatsLeft === 2 && s.capacity === 2), 'open with the configured capacity');
  assert.equal(grid.slots[0].time, start);
  // emergency eligibility follows the agreed rule: present, not on leave, working today, even before the first block starts
  const opt = (await emergency.options(H, R1)).departments.flatMap((d) => d.doctors).find((d) => d.id === DOC);
  assert.deepEqual([opt.available, opt.reason], [true, null]);
});

test('normal booking works in the new slots with the configured capacity, and the doctor is still booked correctly', { skip: !roomToday && 'too late in the day' }, async () => {
  const slot = (await rb.slots(H, DOC, today)).slots[0].time;
  const a = await rb.book(H, { doctorId: DOC, date: today, time: slot, patient: pat() }, R1);
  const b = await rb.book(H, { doctorId: DOC, date: today, time: slot, patient: pat() }, R1);
  assert.deepEqual([a.status, b.status, a.emergencyWalkIn], ['confirmed', 'confirmed', false]);
  assert.match(a.tokenCode, /^T\d{3}$/);
  await rejects(() => rb.book(H, { doctorId: DOC, date: today, time: slot, patient: pat() }, R1), 409, /slotFull/);
  const dup = await db.one("SELECT COUNT(*) AS n FROM (SELECT token_no FROM appointments WHERE doctor_id = ? AND appt_date = ? AND status <> 'cancelled' AND token_no IS NOT NULL GROUP BY token_no HAVING COUNT(*) > 1)", [DOC, today]);
  assert.equal(Number(dup.n), 0, 'no two tokens alike');
  assert.equal((await rb.slots(H, DOC, today)).slots[0].seatsLeft, 0);
  assert.equal((await rb.slots(H, DOC, today)).slots[1].seatsLeft, 2, 'the other slots are untouched');
});

test('hours whose start time has already passed are not applied to today: they start on the next such weekday', { skip: now.minutes < 40 && 'too early in the day' }, async () => {
  const res = await create({ startTime: hh(now.minutes - 30), endTime: hh(now.minutes - 10) });
  assert.equal(res.startsToday, false);
  assert.equal(res.effectiveFrom, tomorrow);
  assert.equal(res.firstDate, addDays(today, 7), 'the next occurrence of today\'s weekday');
  assert.match(res.laterBecause, /already passed/);
  assert.equal((await blocksOn(today)).length, 1, 'today is unchanged');
  await db.query('DELETE FROM doctor_schedules WHERE id = ?', [res.id]);
});

test('hours placed before patients already booked later today do not start today (the queue order and tokens stay right)', { skip: !roomToday && 'too late in the day' }, async () => {
  const res = await create({ startTime: hh(now.minutes + 5), endTime: hh(now.minutes + 35) });
  assert.equal(res.startsToday, false);
  assert.match(res.laterBecause, /already booked from \d\d:\d\d today/);
  assert.equal((await blocksOn(today)).length, 1, 'today still has only the one block');
  await db.query('DELETE FROM doctor_schedules WHERE id = ?', [res.id]);
});

test('overlaps are refused, including hours that end today, and a block shorter than one appointment is refused', { skip: !roomToday && 'too late in the day' }, async () => {
  const start = hh(now.minutes + 60);
  const over = await create({ startTime: hh(now.minutes + 90), endTime: hh(now.minutes + 150) });
  assert.match(over.error, /overlaps/);
  // hours that stop today still overlap the same hours for a block starting today
  const edited = await scheduleModel.edit(DOC, first, { capacityPerSlot: 3 }); // closes the version today, a new one starts tomorrow
  assert.equal(edited.error, undefined);
  const overEnded = await create({ startTime: start, endTime: hh(now.minutes + 120) });
  assert.match(overEnded.error, /overlaps/);
  // the controller validations (Doctor Portal and the receptionist's Working hours card share it)
  const bad = (body) => scheduleController.create(req(body), fakeRes());
  const base = { dayOfWeek: weekday, startTime: hh(now.minutes + 180), endTime: hh(now.minutes + 190), slotMinutes: 15, capacityPerSlot: 2 };
  if (now.minutes + 190 < 24 * 60) await rejects(() => bad(base), 400, /shorter than one 15-minute appointment/);
  await rejects(() => bad({ ...base, endTime: base.startTime }), 400, /End time/);
  await rejects(() => bad({ ...base, endTime: hh(now.minutes + 240), capacityPerSlot: 0 }), 400, /Patients per slot/);
  await rejects(() => bad({ ...base, endTime: hh(now.minutes + 240), slotMinutes: 3 }), 400, /duration/);
});

test('EDITING existing hours is unchanged: today keeps its hours and slots, the new version starts tomorrow', { skip: !roomToday && 'too late in the day' }, async () => {
  const versions = await db.query('SELECT id, effective_from, effective_to, capacity_per_slot FROM doctor_schedules WHERE doctor_id = ? AND day_of_week = ? ORDER BY id', [DOC, weekday]);
  assert.equal(versions.length, 2, 'the edit made a second version');
  assert.deepEqual([versions[0].effective_from, versions[0].effective_to, versions[0].capacity_per_slot], [today, today, 2], 'the version in force today is closed today with its capacity');
  assert.deepEqual([versions[1].effective_from, versions[1].effective_to, versions[1].capacity_per_slot], [tomorrow, null, 3], 'the new version starts tomorrow');
  const grid = await rb.slots(H, DOC, today);
  assert.deepEqual([grid.slots.length, grid.slots[0].capacity, grid.slots[0].booked], [4, 2, 2], 'today keeps its slots, capacity and bookings');
  const gone = await scheduleModel.edit(DOC, versions[0].id, { capacityPerSlot: 4 });
  assert.match(gone.error, /ends today/, 'a block that already ends today cannot be edited again');
});

test('hours for another weekday keep starting tomorrow-based, and are not in today\'s slots', async () => {
  const other = (weekday + 3) % 7;
  const res = await scheduleModel.create(DOC, { dayOfWeek: other, startTime: '09:00', endTime: '10:00', slotMinutes: 15, capacityPerSlot: 1 });
  assert.deepEqual([res.startsToday, res.effectiveFrom], [false, tomorrow]);
  assert.equal(new Date(`${res.firstDate}T00:00:00Z`).getUTCDay(), other, 'its first date falls on that weekday');
  assert.equal((await blocksOn(today)).filter((b) => b.day_of_week === other).length, 0);
  // and it stays a future block until then
  assert.equal((await scheduleModel.list(DOC)).find((b) => b.id === res.id).startsLater, true);
  await db.query('DELETE FROM doctor_schedules WHERE id = ?', [res.id]);
});

test('REMOVING hours added today: taken back whole when nobody is booked in them, otherwise they end today and the bookings stay', { skip: !roomToday && 'too late in the day' }, async () => {
  // use a clean day for the removal cases: clear this test doctor's blocks and bookings (nothing of the real data is touched)
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE doctor_id = ? AND appt_date = ?", [DOC, today]);
  const solo = await create();
  assert.equal(solo.startsToday, true);
  const undone = await scheduleModel.remove(DOC, solo.id);
  assert.equal(undone.error, undefined);
  assert.equal((await db.one('SELECT COUNT(*) AS n FROM doctor_schedules WHERE id = ?', [solo.id])).n, 0, 'never used: deleted outright');
  assert.equal((await rb.slots(H, DOC, today)).slots.length, 0, 'and its slots are gone');
  // a block somebody booked into: it ends today, the booking is kept
  const used = await create();
  const slot = (await rb.slots(H, DOC, today)).slots[0].time;
  const appt = await rb.book(H, { doctorId: DOC, date: today, time: slot, patient: pat() }, R1);
  const kept = await scheduleModel.remove(DOC, used.id);
  assert.equal(kept.error, undefined);
  const row = await db.one('SELECT effective_from, effective_to FROM doctor_schedules WHERE id = ?', [used.id]);
  assert.deepEqual([row.effective_from, row.effective_to], [today, today], 'kept as history, ended today');
  assert.equal((await db.one('SELECT status AS s FROM appointments WHERE id = ?', [appt.id])).s, 'confirmed', 'the booked appointment is untouched');
});

test('the receptionist\'s Working hours card uses the same rules, is audited, and only reaches this hospital\'s doctors', { skip: !roomToday && 'too late in the day' }, async () => {
  const res = fakeRes();
  if (now.minutes + 260 < 24 * 60) {
    await doctorController.scheduleCreate(req({ dayOfWeek: weekday, startTime: hh(now.minutes + 200), endTime: hh(now.minutes + 260), slotMinutes: 15, capacityPerSlot: 1 }, { params: { id: DOC } }), res);
    assert.match(res.body.message, /Working hours added for today/);
    assert.equal(res.body.startsToday, true);
    assert.equal(res.body.effectiveFrom, today);
  }
  await rejects(() => doctorController.scheduleCreate(req({ dayOfWeek: weekday, startTime: '10:00', endTime: '11:00' }, { params: { id: 'NOT-OURS' } }), fakeRes()), 404);
  assert.ok((await db.one("SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'DOCTOR_SCHEDULE_CHANGED' AND entity_id = ?", [DOC])).n >= 1);
});

test('EDITING a block that has not started yet starts it today when it could be added today (the case that was reported)', { skip: !roomToday && 'too late in the day' }, async () => {
  // a clean day for this test doctor
  await db.query("UPDATE appointments SET status = 'cancelled' WHERE doctor_id = ? AND appt_date >= ?", [DOC, today]);
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);
  const insert = (over) => db.query(
    'INSERT INTO doctor_schedules (doctor_id, day_of_week, start_time, end_time, slot_minutes, capacity_per_slot, effective_from, effective_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [DOC, over.day ?? weekday, over.start, over.end, 15, over.cap ?? 3, over.from ?? tomorrow, over.to ?? null]
  ).then((r) => r.insertId);
  const start = hh(now.minutes + 60);
  const end = hh(now.minutes + 180);

  // a block created earlier for tomorrow-onwards (09:00-10:00), then its hours edited to start later today
  const id = await insert({ start: '00:10', end: '00:40' });
  assert.equal((await blocksOn(today)).length, 0, 'before: nothing scheduled today');
  const res = await scheduleModel.edit(DOC, id, { startTime: start, endTime: end });
  assert.equal(res.error, undefined);
  assert.deepEqual([res.startsToday, res.effectiveFrom, res.firstDate], [true, today, today]);
  const row = await db.one('SELECT * FROM doctor_schedules WHERE id = ?', [id]);
  assert.deepEqual([row.effective_from, row.start_time, row.end_time, row.capacity_per_slot], [today, start, end, 3], 'the same block, now effective today, with its capacity kept');
  const grid = await rb.slots(H, DOC, today);
  assert.ok(grid.slots.length > 0 && grid.slots.every((x) => x.status === 'available' && x.capacity === 3), 'its slots are open today');
  assert.equal((await doctorModel.findById(H, DOC)).scheduledToday, true);
  // through the controller (the Doctor Portal's Edit and Save) the doctor is told it starts today, for another block not started yet
  if (now.minutes + 230 < 24 * 60) {
    const second = await insert({ start: '00:50', end: '01:20' });
    const out = fakeRes();
    await scheduleController.update(req({ startTime: hh(now.minutes + 200), endTime: hh(now.minutes + 230), slotMinutes: 15, capacityPerSlot: 2 }, { params: { id: String(second) } }), out);
    assert.match(out.body.message, /Working hours saved\. They start today/);
    assert.equal(out.body.startsToday, true);
    await db.query('DELETE FROM doctor_schedules WHERE id = ?', [second]);
  }

  // saving it again unchanged (a block that is already in force) is the normal "no changes"
  const again = await scheduleModel.edit(DOC, id, { startTime: start, endTime: end });
  assert.equal(again.unchanged, true);

  // a block that is already in force still changes from tomorrow (today keeps what patients booked against)
  const edited = await scheduleModel.edit(DOC, id, { capacityPerSlot: 5 });
  assert.equal(edited.startsToday, undefined);
  assert.equal(edited.effectiveFrom, tomorrow);
  assert.equal((await rb.slots(H, DOC, today)).slots[0].capacity, 3);
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);

  // an unchanged block that has not started yet is brought forward just by saving it (the Save button)
  const waiting = await insert({ start, end });
  const saved = await scheduleModel.edit(DOC, waiting, { startTime: start, endTime: end });
  assert.equal(saved.startsToday, true, 'Save without changes brings it to today');
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);

  // NOT pulled forward when ...
  // ... the start time has already passed
  if (now.minutes > 30) {
    const old = await insert({ start: '00:00', end: '00:20' });
    const r = await scheduleModel.edit(DOC, old, { startTime: hh(now.minutes - 20), endTime: hh(now.minutes - 5) });
    assert.equal(r.startsToday, undefined);
    assert.equal(r.effectiveFrom, tomorrow);
    await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);
  }
  // ... it is the replacement of hours that end today (today keeps the hours patients booked against)
  const ending = await insert({ start: hh(now.minutes + 10), end: hh(now.minutes + 40), from: today, to: today });
  const successor = await insert({ start: hh(now.minutes + 10), end: hh(now.minutes + 40) });
  const kept = await scheduleModel.edit(DOC, successor, { startTime: hh(now.minutes + 200), endTime: hh(now.minutes + 230), capacityPerSlot: 2 });
  assert.equal(kept.startsToday, undefined, 'a replacement version waits for tomorrow');
  assert.deepEqual((await blocksOn(today)).map((b) => b.id), [ending], 'today still has exactly the hours it had');
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);
  // ... patients are already booked later today
  const booked = await insert({ start: hh(now.minutes + 120), end: hh(now.minutes + 180), from: today });
  await rb.book(H, { doctorId: DOC, date: today, time: hh(now.minutes + 120), patient: pat() }, R1);
  const early = await insert({ start: '00:50', end: '01:20' });
  const blocked = await scheduleModel.edit(DOC, early, { startTime: hh(now.minutes + 20), endTime: hh(now.minutes + 50) });
  assert.equal(blocked.startsToday, undefined, 'the queue order of patients already booked is protected');
  assert.equal(blocked.effectiveFrom, tomorrow);
  assert.equal((await db.one("SELECT COUNT(*) AS n FROM appointments WHERE doctor_id = ? AND appt_date = ? AND status <> 'cancelled'", [DOC, today])).n, 1, 'the booking is untouched');
  assert.ok(booked);
  // ... another weekday
  await db.query('DELETE FROM doctor_schedules WHERE doctor_id = ?', [DOC]);
  const other = await insert({ day: (weekday + 2) % 7, start: '09:00', end: '10:00' });
  const o = await scheduleModel.edit(DOC, other, { startTime: '09:15', endTime: '10:15' });
  assert.equal(o.startsToday, undefined);
  assert.equal(o.effectiveFrom, tomorrow);
});

test('appointments and tokens that existed before are exactly as they were', async () => {
  const strip = (rows) => rows.map(({ updated_at, ...rest }) => rest);
  const [apptsBefore, tokensBefore] = JSON.parse(before);
  const [apptsNow, tokensNow] = JSON.parse(await allRows());
  const keep = new Set(apptsBefore.map((a) => a.id));
  assert.equal(JSON.stringify(strip(apptsNow.filter((a) => keep.has(a.id)))), JSON.stringify(strip(apptsBefore)), 'every earlier appointment is untouched');
  const keepTokens = new Set(tokensBefore.map((t) => t.id));
  assert.equal(JSON.stringify(strip(tokensNow.filter((t) => keepTokens.has(t.id)))), JSON.stringify(strip(tokensBefore)), 'every earlier token is untouched');
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp files only */ } });
