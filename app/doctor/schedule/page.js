'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import { formatDate, formatShortDate, formatTime as time12 } from '../../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEK = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const hourLabel = (h) => `${((h + 11) % 12) + 1} ${h >= 12 ? 'PM' : 'AM'}`;
const hoursLabel = (min) => { const h = min / 60; return `${Number.isInteger(h) ? h : h.toFixed(1)} h`; };
const BLOCK_DEFAULTS = { dayOfWeek: '1', startTime: '09:00', endTime: '13:00', slotMinutes: '15', capacityPerSlot: '1' };

// Add a block, or edit one (`block`): edits apply from tomorrow; today and existing bookings stay as they are.
// `defaults` pre-fills a new block (clicking an empty spot on the week grid).
function BlockModal({ open, block, defaults, onClose, onCreated, onRemove }) {
  const [form, setForm] = useState(BLOCK_DEFAULTS);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(block
      ? { dayOfWeek: String(block.dayOfWeek), startTime: block.startTime, endTime: block.endTime, slotMinutes: String(block.slotMinutes), capacityPerSlot: String(block.capacityPerSlot) }
      : { ...BLOCK_DEFAULTS, ...defaults });
  }, [open, block, defaults]);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { ...form, dayOfWeek: Number(form.dayOfWeek), slotMinutes: Number(form.slotMinutes), capacityPerSlot: Number(form.capacityPerSlot) };
      const res = block
        ? await api(`/api/doctor/schedule/${block.id}`, { method: 'PATCH', body: { startTime: body.startTime, endTime: body.endTime, slotMinutes: body.slotMinutes, capacityPerSlot: body.capacityPerSlot } })
        : await api('/api/doctor/schedule', { method: 'POST', body });
      toast(res.message, 'success');
      onCreated();
      onClose();
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm" style={block ? { width: 'min(500px, 100%)' } : undefined}>
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="clock" /></div>
            <div><h2>{block ? 'Edit Working Hours' : 'Add Working Hours'}</h2>{block && <p>{DAYS[block.dayOfWeek]} · changes apply from tomorrow</p>}</div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field field--full">
                <label>Day</label>
                <select className="select" value={form.dayOfWeek} onChange={set('dayOfWeek')} disabled={!!block}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className={`field${errors.startTime ? ' has-error' : ''}`}><label>Start Time</label><input className="input" type="time" value={form.startTime} onChange={set('startTime')} required />{errors.startTime && <p className="field__error">{errors.startTime}</p>}</div>
              <div className={`field${errors.endTime ? ' has-error' : ''}`}><label>End Time</label><input className="input" type="time" value={form.endTime} onChange={set('endTime')} required />{errors.endTime && <p className="field__error">{errors.endTime}</p>}</div>
              <div className="field field--full">
                <label>Appointment duration (minutes)</label>
                <select className="select" value={form.slotMinutes} onChange={set('slotMinutes')}>
                  {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
              <div className={`field field--full${errors.capacityPerSlot ? ' has-error' : ''}`}>
                <label>Patients per slot</label>
                <input className="input" type="number" min="1" max="50" value={form.capacityPerSlot} onChange={set('capacityPerSlot')} required />
                {errors.capacityPerSlot && <p className="field__error">{errors.capacityPerSlot}</p>}
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>{block
              ? 'Today keeps its current hours. Appointments already booked are kept, even if they fall outside the new hours.'
              : 'Tip: for a lunch break, add two separate blocks for the same day (e.g. 09:00–13:00 and 16:00–19:00).'}</p>
          </div>
          <div className={`modal__foot${block ? ' modal__foot--split' : ''}`}>
            {block && <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)' }} onClick={() => onRemove(block)}><Icon name="trash" />Remove Hours</button>}
            <div className="action-group">
              <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>{block ? 'Save Changes' : 'Save Schedule'}</span></button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// Confirms removing a block with how many upcoming bookings sit in its hours (they are kept).
function RemoveBlockModal({ block, onClose, onDone }) {
  const [impact, setImpact] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setImpact(null);
    if (block) api(`/api/doctor/schedule/${block.id}/impact`).then(setImpact).catch((err) => setImpact({ error: err.message }));
  }, [block]);
  if (!block) return null;
  async function confirm() {
    setSaving(true);
    try {
      const res = await api(`/api/doctor/schedule/${block.id}`, { method: 'DELETE' });
      toast(res.message, 'success');
      onDone();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  const n = impact && impact.bookings ? impact.bookings.count : 0;
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="remove-block-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <div className="modal__head">
          <div className="modal__icon tone-red"><Icon name="clock" /></div>
          <div><h2 id="remove-block-title">Remove {DAYS[block.dayOfWeek]} {time12(block.startTime)} – {time12(block.endTime)}?</h2><p>Patients can&apos;t book these hours from tomorrow. Today is unchanged.</p></div>
        </div>
        <div className="modal__body">
          <p className="note" style={{ margin: 0 }}><Icon name="info" />
            <span>{!impact ? 'Checking booked appointments…'
              : impact.error ? impact.error
                : n ? `${n} appointment${n === 1 ? ' is' : 's are'} already booked in these hours (${formatDate(impact.bookings.firstDate)}${impact.bookings.lastDate !== impact.bookings.firstDate ? ` to ${formatDate(impact.bookings.lastDate)}` : ''}). ${n === 1 ? 'It is' : 'They are'} kept; the front desk can move or cancel ${n === 1 ? 'it' : 'them'}.`
                  : 'No upcoming appointments are booked in these hours.'}</span>
          </p>
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Back</button>
          <button type="button" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving || !impact || !!impact.error} onClick={confirm}>Remove Hours</button>
        </div>
      </div>
    </div>
  );
}

// Add or change a leave. If the new days already have bookings, the server answers 409 with them and the
// dialog asks what should happen: keep them for the front desk to move, or cancel and refund them.
function LeaveModal({ open, leave, today, onClose, onSaved }) {
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [booked, setBooked] = useState(null);
  const [choice, setChoice] = useState('keep');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({}); setBooked(null); setChoice('keep');
    setForm(leave ? { startDate: leave.startDate, endDate: leave.endDate, reason: leave.reason || '' } : { startDate: '', endDate: '', reason: '' });
  }, [open, leave]);
  if (!open) return null;
  const started = !!(leave && leave.started);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setBooked(null); };

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    const body = { ...form, ...(booked ? { confirmBooked: true, cancelBooked: choice === 'cancel' } : {}) };
    try {
      const res = leave
        ? await api(`/api/doctor/leaves/${leave.id}`, { method: 'PATCH', body })
        : await api('/api/doctor/leaves', { method: 'POST', body });
      toast(res.message, 'success');
      onSaved();
      onClose();
    } catch (err) {
      if (err.fields && err.fields.booked) setBooked(err.fields.booked);
      else { setErrors(err.fields || {}); if (!err.fields) toast(err.message, 'error'); }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-amber"><Icon name="calendar-x" /></div>
            <div><h2 id="leave-title">{leave ? 'Change Leave' : 'Add Leave'}</h2><p>{started ? 'This leave has started: you can change when it ends.' : 'Patients and the front desk can’t book you on these days.'}</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className={`field${errors.startDate ? ' has-error' : ''}`}><label>From *</label><input className="input" type="date" min={today} value={form.startDate} onChange={set('startDate')} disabled={started} required />{errors.startDate && <p className="field__error">{errors.startDate}</p>}</div>
              <div className={`field${errors.endDate ? ' has-error' : ''}`}><label>To *</label><input className="input" type="date" min={started ? today : form.startDate || today} value={form.endDate} onChange={set('endDate')} required />{errors.endDate && <p className="field__error">{errors.endDate}</p>}</div>
              <div className={`field field--full${errors.reason ? ' has-error' : ''}`}><label>Reason (optional)</label><input className="input" type="text" maxLength={200} value={form.reason} onChange={set('reason')} placeholder="e.g. Conference" />{errors.reason && <p className="field__error">{errors.reason}</p>}</div>
            </div>
            {booked && (
              <div style={{ marginTop: 16 }}>
                <div className="alert alert--warning" style={{ marginBottom: 12 }}><Icon name="alert" />
                  <span><strong>{booked.length} appointment{booked.length === 1 ? ' is' : 's are'} already booked on these days.</strong> Choose what happens to {booked.length === 1 ? 'it' : 'them'}.</span>
                </div>
                <ul style={{ margin: '0 0 12px', paddingLeft: 18, maxHeight: 140, overflow: 'auto', fontSize: 13 }}>
                  {booked.map((b) => <li key={b.id}><span className="mono">{b.id}</span> · {formatDate(b.date)} {time12(b.time)} · {b.patientName}{b.paid ? ' (paid)' : ''}</li>)}
                </ul>
                <label className="radio-row"><input type="radio" name="booked-choice" checked={choice === 'keep'} onChange={() => setChoice('keep')} /><span><strong>Keep them</strong><small>The front desk is told and moves or cancels them.</small></span></label>
                <label className="radio-row"><input type="radio" name="booked-choice" checked={choice === 'cancel'} onChange={() => setChoice('cancel')} /><span><strong>Cancel them now</strong><small>Patients are refunded what they paid online and told.</small></span></label>
              </div>
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn ${booked && choice === 'cancel' ? 'btn--danger' : 'btn--primary'}${saving ? ' is-loading' : ''}`} disabled={saving}>
              <Icon name="check" /><span>{booked ? (choice === 'cancel' ? `Save and Cancel ${booked.length}` : 'Save and Keep Bookings') : leave ? 'Save Changes' : 'Add Leave'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const leaveRange = (l) => (l.endDate !== l.startDate ? `${formatDate(l.startDate)} → ${formatDate(l.endDate)}` : formatDate(l.startDate));

function LeavesCard({ items, today, load, editing, setEditing }) {
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);

  async function withdraw() {
    setBusy(true);
    try { toast((await api(`/api/doctor/leaves/${withdrawing.id}`, { method: 'DELETE' })).message, 'success'); setWithdrawing(null); load(); } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  }
  const state = (l) => (l.ended ? <span className="badge badge--neutral">Past</span> : l.started ? <span className="badge badge--pending">On leave now</span> : <span className="badge badge--teal badge--plain">Upcoming</span>);

  return (
    <article className="card card--flush" id="leaves" style={{ marginTop: 24 }}>
      <div className="card__head">
        <div><h2 className="card__title"><Icon name="calendar-x" />My Leaves</h2><p className="card__subtitle">All leave · days you are away. The front desk is told about every change.</p></div>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => setEditing('new')}><Icon name="plus" />Add Leave</button>
      </div>
      <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
        <table className="table table--compact table--stack">
          <thead><tr><th>Dates</th><th>Reason</th><th>Status</th><th>Booked</th><th className="col-actions"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5}><span className="text-muted">No leave added. Patients can book you on every working day.</span></td></tr>}
            {items.map((l) => (
              <tr key={l.id} className={l.bookedAppointments ? 'is-attention' : ''}>
                <td data-label="Dates" className="nowrap">{leaveRange(l)}</td>
                <td data-label="Reason" className="text-muted">{l.reason || '—'}</td>
                <td data-label="Status">{state(l)}</td>
                <td data-label="Booked">{l.bookedAppointments ? `${l.bookedAppointments} to move` : <span className="text-muted">None</span>}</td>
                <td className="col-actions"><div className="action-group">
                  {!l.ended && <button type="button" className="action-btn" onClick={() => setEditing(l)}><Icon name="pencil" />{l.started ? 'Change end' : 'Edit'}</button>}
                  {!l.started && <button type="button" className="action-btn" onClick={() => setWithdrawing(l)}><Icon name="x" />Withdraw</button>}
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LeaveModal open={!!editing} leave={editing === 'new' ? null : editing} today={today} onClose={() => setEditing(null)} onSaved={load} />
      {withdrawing && (
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="withdraw-title">
          <div className="modal__backdrop" onClick={() => setWithdrawing(null)}></div>
          <div className="modal__panel modal__panel--sm">
            <div className="modal__head">
              <div className="modal__icon tone-red"><Icon name="calendar-x" /></div>
              <div><h2 id="withdraw-title">Withdraw leave {leaveRange(withdrawing)}?</h2><p>Patients and the front desk can book you on these days again. The front desk is told.</p></div>
            </div>
            <div className="modal__foot">
              <button type="button" className="btn btn--ghost" onClick={() => setWithdrawing(null)}>Back</button>
              <button type="button" className={`btn btn--danger${busy ? ' is-loading' : ''}`} disabled={busy} onClick={withdraw}>Withdraw Leave</button>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

// Week-at-a-glance: Monday to Sunday of the current week, hours on the left, one teal block per working-hours
// window. Click a block to edit it, click an empty spot to add hours there. Leave days are hatched and labelled.
function WeekGrid({ byDay, dates, today, leaveOn, onEdit, onAdd }) {
  const all = byDay.flat();
  const first = all.length ? Math.min(...all.map((b) => toMin(b.startTime))) : 8 * 60;
  const last = all.length ? Math.max(...all.map((b) => toMin(b.endTime))) : 18 * 60;
  let startH = Math.max(0, Math.floor(first / 60) - 1);
  let endH = Math.min(24, Math.ceil(last / 60) + 1);
  if (endH - startH < 8) endH = Math.min(24, startH + 8);
  if (endH - startH < 8) startH = Math.max(0, endH - 8);
  const hours = endH - startH;
  const HOUR = 52;
  const marks = Array.from({ length: hours }, (_, i) => startH + i);

  return (
    <div className="wk-scroll">
      <div className="wk" style={{ '--wk-hours': hours }} role="group" aria-label="Weekly working hours">
        <div className="wk__corner"></div>
        {WEEK.map((dow, i) => {
          const iso = dates[i];
          const leave = leaveOn(iso);
          return (
            <div key={dow} className={`wk__head${iso === today ? ' is-today' : ''}`}>
              <span className="wk__dow">{DAYS[dow].slice(0, 3)}</span>
              <span className="wk__date">{parseIso(iso).getDate()}</span>
              <span className={`wk__tag${leave ? ' wk__tag--leave' : ''}`}>{leave ? 'Leave' : iso === today ? 'Today' : ''}</span>
            </div>
          );
        })}
        <div className="wk__gutter" aria-hidden="true">
          {marks.map((h, i) => <span key={h} className="wk__hour" style={{ top: i * HOUR }}>{hourLabel(h)}</span>)}
        </div>
        {WEEK.map((dow, i) => {
          const iso = dates[i];
          const blocks = byDay[i];
          return (
            <div key={dow} className={`wk__col${iso === today ? ' is-today' : ''}${leaveOn(iso) ? ' is-leave' : ''}`}>
              {marks.map((h) => (
                <button key={h} type="button" className="wk__cell" tabIndex={-1} aria-hidden="true" title={`Add working hours · ${DAYS[dow]} ${hourLabel(h)}`}
                  onClick={() => onAdd({ dayOfWeek: String(dow), startTime: `${String(h).padStart(2, '0')}:00`, endTime: h >= 21 ? '23:59' : `${String(h + 3).padStart(2, '0')}:00` })}>
                  <Icon name="plus" />
                </button>
              ))}
              {blocks.length === 0 && <div className="wk__off">Day off</div>}
              {blocks.map((b) => {
                const top = ((toMin(b.startTime) - startH * 60) / 60) * HOUR;
                const height = Math.max(((toMin(b.endTime) - toMin(b.startTime)) / 60) * HOUR - 2, 24);
                const label = `${DAYS[b.dayOfWeek]} ${time12(b.startTime)} to ${time12(b.endTime)}, ${b.slotMinutes} minute appointments, ${b.capacityPerSlot} per slot`;
                return (
                  <button key={b.id} type="button" disabled={b.endsToday}
                    className={`wk__block${b.endsToday ? ' is-ending' : ''}${b.startsLater ? ' is-later' : ''}`}
                    style={{ top, height }} aria-label={b.endsToday ? `${label}. Ends today.` : `Edit ${label}`} title={b.endsToday ? 'Ends today' : 'Edit working hours'}
                    onClick={() => onEdit(b)}>
                    <span className="wk__block-time">{time12(b.startTime)} – {time12(b.endTime)}</span>
                    {height >= 44 && <span className="wk__block-meta">{b.slotMinutes} min · {b.capacityPerSlot} per slot</span>}
                    {height >= 62 && b.endsToday && <span className="wk__block-meta">Ends today</span>}
                    {height >= 62 && b.startsLater && <span className="wk__block-meta">From {formatShortDate(b.effectiveFrom)}</span>}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayList({ byDay, dates, today, leaveOn, onEdit, onRemove, onAdd }) {
  return (
    <div className="sched-list">
      {WEEK.map((dow, i) => {
        const blocks = byDay[i];
        const leave = leaveOn(dates[i]);
        return (
          <div key={dow} className="sched-day">
            <div>
              <div className="sched-day__name">{DAYS[dow]} {dates[i] === today && <span className="badge badge--teal badge--plain">Today</span>}</div>
              <div className="sched-day__date">{formatShortDate(dates[i])}{leave ? ' · on leave' : ''}</div>
            </div>
            <div className="sched-day__blocks">
              {blocks.length === 0 && <div className="sched-off">Day off · <button type="button" className="link-more" onClick={() => onAdd({ dayOfWeek: String(dow) })}>Add hours</button></div>}
              {blocks.map((b) => (
                <div key={b.id} className={`sched-row${b.endsToday ? ' is-ending' : ''}`}>
                  <div className="sched-row__main">
                    <span className="nowrap">{time12(b.startTime)} – {time12(b.endTime)}</span>
                    <small>{b.slotMinutes} min appointments · {b.capacityPerSlot} per slot</small>
                    {b.endsToday && <span className="badge badge--cancelled">Ends today</span>}
                    {b.startsLater && <span className="badge badge--pending">Starts {formatDate(b.effectiveFrom)}</span>}
                  </div>
                  {!b.endsToday && (
                    <div className="action-group">
                      <button type="button" className="action-btn" onClick={() => onEdit(b)}><Icon name="pencil" />Edit</button>
                      <button type="button" className="action-btn" onClick={() => onRemove(b)}><Icon name="x" />Remove</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SchedulePage() {
  const [items, setItems] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [serverToday, setServerToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('week');
  const [blockDialog, setBlockDialog] = useState(null); // { block } to edit, or { defaults } to add
  const [removing, setRemoving] = useState(null);
  const [leaveEditing, setLeaveEditing] = useState(null);

  const loadBlocks = useCallback(async () => {
    try { setItems((await api('/api/doctor/schedule')).items); } catch (err) { toast(err.message, 'error'); }
  }, []);
  const loadLeaves = useCallback(async () => {
    try { const data = await api('/api/doctor/leaves'); setLeaves(data.items); setServerToday(data.today); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => {
    Promise.all([loadBlocks(), loadLeaves()]).finally(() => setLoading(false));
    if (window.innerWidth < 768) setView('list');
  }, [loadBlocks, loadLeaves]);

  const today = serverToday || isoDay(new Date());
  const monday = parseIso(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const dates = WEEK.map((_, i) => { const d = new Date(monday); d.setDate(monday.getDate() + i); return isoDay(d); });
  const live = items.filter((b) => !b.endsToday);
  const byDay = WEEK.map((dow) => items.filter((b) => b.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime)));
  const leaveOn = (iso) => leaves.some((l) => !l.ended && l.startDate <= iso && iso <= l.endDate);

  const workingDays = new Set(live.map((b) => b.dayOfWeek)).size;
  const weeklyMin = live.reduce((n, b) => n + toMin(b.endTime) - toMin(b.startTime), 0);
  const slots = live.reduce((n, b) => n + Math.floor((toMin(b.endTime) - toMin(b.startTime)) / b.slotMinutes), 0);
  const seats = live.reduce((n, b) => n + Math.floor((toMin(b.endTime) - toMin(b.startTime)) / b.slotMinutes) * b.capacityPerSlot, 0);
  const onLeave = leaves.find((l) => l.started && !l.ended);
  const nextLeave = leaves.filter((l) => !l.started && !l.ended).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];

  const openAdd = (defaults) => setBlockDialog({ defaults });
  const closeBlock = () => setBlockDialog(null);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Schedule</h1>
          <p>Your weekly working hours. Patients can only book during these windows.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--ghost" onClick={() => setLeaveEditing('new')}><Icon name="calendar-x" />Add Leave</button>
          <button type="button" className="btn btn--primary" onClick={() => openAdd()}><Icon name="plus" />Add Working Hours</button>
        </div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 420 }}></div> : (
        <>
          <section className="summary-strip summary-strip--compact">
            <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="calendar-check" /></span><div><div className="mini-stat__label">Working days</div><div className="mini-stat__value">{workingDays} of 7</div><div className="mini-stat__hint">Every week</div></div></div>
            <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="clock" /></span><div><div className="mini-stat__label">Weekly hours</div><div className="mini-stat__value">{hoursLabel(weeklyMin)}</div><div className="mini-stat__hint">Open for bookings, every week</div></div></div>
            <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="users" /></span><div><div className="mini-stat__label">Appointment slots</div><div className="mini-stat__value">{slots}</div><div className="mini-stat__hint">Per week · up to {seats} patients</div></div></div>
            <div className="card mini-stat">
              <span className={`stat__icon ${onLeave ? 'tone-amber' : 'tone-neutral'}`}><Icon name="calendar-x" /></span>
              <div>
                <div className="mini-stat__label">{onLeave ? 'On leave now' : 'Next leave'}</div>
                <div className="mini-stat__value">{onLeave ? `Until ${formatShortDate(onLeave.endDate)}` : nextLeave ? formatShortDate(nextLeave.startDate) : 'None'}</div>
                <div className="mini-stat__hint">{onLeave ? onLeave.reason || 'Patients can’t book these days' : nextLeave ? (nextLeave.endDate !== nextLeave.startDate ? `Until ${formatDate(nextLeave.endDate)}` : nextLeave.reason || 'One day') : 'No leave planned'}</div>
              </div>
            </div>
          </section>

          <article className="card card--flush">
            <div className="card__head">
              <div>
                <h2 className="card__title"><Icon name="clock" />Weekly Hours</h2>
                <p className="card__subtitle">Repeats every week · {view === 'week' ? 'click a block to edit, or an empty spot to add hours' : 'grouped by day'}</p>
              </div>
            </div>
            <div className="sched-bar">
              <div className="tabs" role="tablist" aria-label="Schedule view">
                <button type="button" role="tab" aria-selected={view === 'week'} className={`tab${view === 'week' ? ' is-active' : ''}`} onClick={() => setView('week')}>Week</button>
                <button type="button" role="tab" aria-selected={view === 'list'} className={`tab${view === 'list' ? ' is-active' : ''}`} onClick={() => setView('list')}>List</button>
              </div>
              <div className="sched-legend">
                <span><i className="sched-legend__swatch"></i>Working hours</span>
                <span><i className="sched-legend__swatch sched-legend__swatch--later"></i>Starts later</span>
                <span><i className="sched-legend__swatch sched-legend__swatch--leave"></i>Leave</span>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="empty">
                <div className="empty__icon"><Icon name="clock" /></div>
                <h3>No working hours yet</h3>
                <p>Patients can’t book you until you add the hours you see patients each week.</p>
                <button type="button" className="btn btn--primary" style={{ marginTop: 14 }} onClick={() => openAdd()}><Icon name="plus" />Add Working Hours</button>
              </div>
            ) : view === 'week'
              ? <WeekGrid byDay={byDay} dates={dates} today={today} leaveOn={leaveOn} onEdit={(b) => setBlockDialog({ block: b })} onAdd={openAdd} />
              : <DayList byDay={byDay} dates={dates} today={today} leaveOn={leaveOn} onEdit={(b) => setBlockDialog({ block: b })} onRemove={setRemoving} onAdd={openAdd} />}
          </article>
        </>
      )}

      <LeavesCard items={leaves} today={today} load={loadLeaves} editing={leaveEditing} setEditing={setLeaveEditing} />

      <BlockModal open={!!blockDialog} block={blockDialog && blockDialog.block} defaults={blockDialog && blockDialog.defaults} onClose={closeBlock} onCreated={loadBlocks}
        onRemove={(b) => { closeBlock(); setRemoving(b); }} />
      <RemoveBlockModal block={removing} onClose={() => setRemoving(null)} onDone={loadBlocks} />
    </>
  );
}
