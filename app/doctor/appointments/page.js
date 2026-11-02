'use client';

import { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '../../../components/Icon';
import { formatDate } from '../../../lib/format';
import Pager, { usePager } from '../../../components/admin/Pager';
import { formatTime, usePrefs } from '../../../lib/doctorPrefs';

const STATUS_TONE = { confirmed: 'confirmed', pending: 'pending', completed: 'completed', cancelled: 'cancelled' };
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

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const time12 = formatTime; // honours the 12/24-hour preference (lib/doctorPrefs)

const STATUS_TEXT = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };
const statusKey = (a) => (a.noShow && a.status !== 'cancelled' ? 'no_show' : a.status);
const StatusBadge = ({ a }) => (statusKey(a) === 'no_show'
  ? <span className="badge badge--cancelled">No-show</span>
  : <span className={`badge badge--${STATUS_TONE[a.status]}`}>{STATUS_TEXT[a.status] || a.status}</span>);

// Cancelling goes through the shared cancel: the patient is refunded what they paid online, their queue
// token is withdrawn, and the patient and front desk are told. The dialog shows the refund first.
function CancelModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [quote, setQuote] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason(''); setError(''); setQuote(null);
    if (target) api(`/api/doctor/appointments/${target.id}/cancel`).then(setQuote).catch((err) => setQuote({ blocker: err.message }));
  }, [target]);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    if (!reason.trim()) return setError('Enter the reason. The patient sees it.');
    setSaving(true);
    try {
      const res = await api(`/api/doctor/appointments/${target.id}/cancel`, { method: 'POST', body: { reason } });
      toast(res.message, 'success');
      onDone(res.appointment);
      onClose();
    } catch (err) {
      if (err.fields && err.fields.reason) setError(err.fields.reason); else toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="doc-cancel-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit} noValidate>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="calendar-x" /></div>
            <div><h2 id="doc-cancel-title">Cancel appointment?</h2><p>{target.patientName} · {formatDate(target.date)}, {time12(target.time)}</p></div>
          </div>
          <div className="modal__body">
            {!quote && <div className="skeleton skeleton--row"></div>}
            {quote && quote.blocker && <div className="alert alert--error"><Icon name="alert" /><span>{quote.blocker}</span></div>}
            {quote && !quote.blocker && (
              <>
                <p className="note" style={{ marginTop: 0, marginBottom: 14 }}><Icon name="info" />
                  <span>{quote.refund ? <><strong>{money(quote.refund)}</strong> is refunded to the patient. </> : null}{quote.note} Their queue token is withdrawn and the patient and front desk are notified.</span>
                </p>
                <div className={`field${error ? ' has-error' : ''}`}>
                  <label htmlFor="doc-cancel-reason">Reason *</label>
                  <textarea id="doc-cancel-reason" className="textarea" value={reason} onChange={(e) => { setReason(e.target.value); setError(''); }} rows={3} maxLength={300} placeholder="e.g. Called away for an emergency surgery" />
                  {error && <p className="field__error">{error}</p>}
                </div>
              </>
            )}
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Back</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving || !quote || !!quote.blocker}>Cancel Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// One version of the consultation notes (module scope so React keeps it mounted between renders).
function NotesBlock({ n }) {
  return (
    <dl className="kv">
      <div className="kv--full"><dt>Diagnosis</dt><dd style={{ whiteSpace: 'pre-line' }}>{n.diagnosis || '—'}</dd></div>
      <div className="kv--full"><dt>Notes</dt><dd style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>{n.notes || '—'}</dd></div>
      <div className="kv--full"><dt>Prescription</dt><dd style={{ whiteSpace: 'pre-line', fontWeight: 400 }}>{n.prescription || '—'}</dd></div>
    </dl>
  );
}

// Diagnosis, notes and prescription. Each save is a new version; earlier ones stay readable.
function NotesSection({ a, onSaved }) {
  const latest = (a.notes || [])[0] || null;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ diagnosis: '', notes: '', prescription: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const canWrite = a.status !== 'cancelled' && (a.nextStatuses || []).includes('completed') || a.status === 'completed';

  function start() {
    setForm({ diagnosis: (latest && latest.diagnosis) || '', notes: (latest && latest.notes) || '', prescription: (latest && latest.prescription) || '' });
    setErrors({});
    setEditing(true);
  }
  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/doctor/appointments/${a.id}/notes`, { method: 'POST', body: form });
      toast(res.message, 'success');
      onSaved(res.notes);
      setEditing(false);
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <section style={{ marginTop: 22 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', margin: 0 }}>Consultation notes</h3>
        {!editing && canWrite && <button type="button" className="btn btn--ghost btn--sm" onClick={start}><Icon name="pencil" />{latest ? 'Edit' : 'Add notes'}</button>}
      </div>
      {editing ? (
        <form onSubmit={save} noValidate>
          {[['diagnosis', 'Diagnosis', 1, 500], ['notes', 'Notes', 4, 4000], ['prescription', 'Prescription', 3, 2000]].map(([k, label, rows, max]) => (
            <div className={`field${errors[k] ? ' has-error' : ''}`} key={k} style={{ marginBottom: 12 }}>
              <label>{label}</label>
              <textarea className="textarea" rows={rows} maxLength={max} value={form[k]} onChange={set(k)} />
              {errors[k] && <p className="field__error">{errors[k]}</p>}
            </div>
          ))}
          <p className="field__hint" style={{ marginTop: 0 }}>Saving keeps the earlier version; notes are never overwritten or deleted.</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(false)}>Cancel</button>
            <button type="submit" className={`btn btn--primary btn--sm${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" />Save notes</button>
          </div>
        </form>
      ) : latest ? (
        <>
          <NotesBlock n={latest} />
          <p className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Version {latest.version} · {latest.createdBy || 'Doctor'} · {formatDate(latest.createdAt)}
            {a.notes.length > 1 && <> · <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowOld((v) => !v)}>{showOld ? 'Hide' : 'Show'} {a.notes.length - 1} earlier version{a.notes.length === 2 ? '' : 's'}</button></>}
          </p>
          {showOld && a.notes.slice(1).map((n) => (
            <div key={n.version} style={{ borderTop: '1px solid var(--border-2)', paddingTop: 10, marginTop: 10, opacity: 0.8 }}>
              <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 6px' }}>Version {n.version} · {formatDate(n.createdAt)}</p>
              <NotesBlock n={n} />
            </div>
          ))}
        </>
      ) : (
        <p className="text-muted" style={{ margin: 0 }}>{canWrite ? 'No notes yet.' : a.status === 'cancelled' ? 'This appointment was cancelled.' : 'Notes can be written from the day of the appointment.'}</p>
      )}
    </section>
  );
}

function Drawer({ appointment, onClose, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  useEffect(() => { setConfirmComplete(false); }, [appointment && appointment.id]);
  if (!appointment) return null;
  const a = appointment;

  async function run(key, url, method = 'POST', body) {
    setBusy(key);
    try {
      const res = await api(url, { method, body });
      toast(res.message, 'success');
      onChanged(res.appointment);
      setConfirmComplete(false);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  }
  const complete = () => run('complete', `/api/doctor/appointments/${a.id}/status`, 'PATCH', { status: 'completed' });

  const open = a.status !== 'completed' && a.status !== 'cancelled' && !a.noShow;
  const canComplete = open && (a.nextStatuses || []).includes('completed');
  const isToday = a.date === new Date().toLocaleDateString('en-CA');
  const steps = [
    { label: 'Booked', done: true },
    { label: 'Payment completed', done: a.paymentStatus === 'paid' },
    { label: 'Confirmed', done: a.status !== 'pending' },
    { label: a.noShow ? 'No-show' : a.status === 'cancelled' ? 'Cancelled' : 'Completed', done: a.noShow || a.status === 'completed' || a.status === 'cancelled' },
  ];
  const maskedMobile = a.patientMobile ? `${a.patientMobile.slice(0, 2)}••••${a.patientMobile.slice(-2)}` : '—';

  return (
    <>
      <div className="modal modal--drawer" role="dialog" aria-modal="true">
        <div className="modal__backdrop" onClick={onClose}></div>
        <div className="modal__panel modal__panel--drawer">
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="calendar" /></div>
            <div><h2>{a.patientName}</h2><p className="mono">{a.id}</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body" style={{ flex: 1 }}>
            <dl className="kv" style={{ marginBottom: 20 }}>
              <div><dt>Mobile</dt><dd className="mono">{maskedMobile}</dd></div>
              <div><dt>Date</dt><dd>{formatDate(a.date)}</dd></div>
              <div><dt>Time</dt><dd>{time12(a.time)}</dd></div>
              <div><dt>Hospital</dt><dd>{a.hospitalName}</dd></div>
              <div><dt>Fee</dt><dd>{money(a.fee)}</dd></div>
              <div><dt>Booking source</dt><dd>{a.source === 'Walk-in' ? 'Walk-in (front desk)' : a.source === 'Phone' ? 'Phone (front desk)' : a.source || '—'}</dd></div>
              <div><dt>Payment</dt><dd><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></dd></div>
              <div><dt>Status</dt><dd><StatusBadge a={a} /></dd></div>
              <div className="kv--full"><dt>Reason for visit</dt><dd style={{ fontWeight: 400 }}>{a.reason || 'Not given'}</dd></div>
              {a.status === 'cancelled' && <div className="kv--full"><dt>Cancel reason</dt><dd style={{ fontWeight: 400 }}>{a.cancelReason || '—'}</dd></div>}
            </dl>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Timeline</h3>
            <ul className="drawer__timeline">
              {steps.map((st) => <li key={st.label} className={st.done ? 'is-done' : ''}>{st.label}</li>)}
            </ul>

            <NotesSection a={a} onSaved={(notes) => onChanged({ ...a, notes })} />
          </div>

          {a.canReopen && (
            <div className="modal__foot">
              <span className="text-muted" style={{ flex: 1 }}>Completed by mistake? You can reopen it for a few minutes.</span>
              <button type="button" className={`btn btn--ghost${busy === 'reopen' ? ' is-loading' : ''}`} disabled={!!busy} onClick={() => run('reopen', `/api/doctor/appointments/${a.id}/reopen`)}><Icon name="refresh" />Reopen</button>
            </div>
          )}
          {a.noShow && a.status === 'confirmed' && isToday && (
            <div className="modal__foot">
              <span className="text-muted" style={{ flex: 1 }}>Marked as a no-show.</span>
              <button type="button" className={`btn btn--ghost${busy === 'noshow' ? ' is-loading' : ''}`} disabled={!!busy} onClick={() => run('noshow', `/api/doctor/appointments/${a.id}/no-show`, 'DELETE')}><Icon name="refresh" />Undo no-show</button>
            </div>
          )}
          {open && !confirmComplete && (
            <div className="modal__foot" style={{ flexWrap: 'wrap' }}>
              <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)' }} disabled={!!busy} onClick={() => setCancelTarget(a)}><Icon name="calendar-x" />Cancel</button>
              {isToday && a.status === 'confirmed' && (
                <button type="button" className={`btn btn--ghost${busy === 'noshow' ? ' is-loading' : ''}`} disabled={!!busy} onClick={() => run('noshow', `/api/doctor/appointments/${a.id}/no-show`)}><Icon name="user-x" />No-show</button>
              )}
              <button type="button" className="btn btn--primary" style={{ marginLeft: 'auto' }} disabled={!!busy || !canComplete} title={canComplete ? '' : 'An appointment can be completed from its date.'} onClick={() => setConfirmComplete(true)}><Icon name="check-circle" />Mark Completed</button>
              {!canComplete && <p className="field__hint" style={{ width: '100%', margin: 0, textAlign: 'right' }}>Can be completed from {formatDate(a.date)}.</p>}
            </div>
          )}
          {open && confirmComplete && (
            <div className="modal__foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              <p style={{ margin: 0 }}><strong>Mark {a.patientName}&apos;s appointment completed?</strong> Their queue token is completed too. You can undo this for 10 minutes.</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmComplete(false)}>Back</button>
                <button type="button" className={`btn btn--primary${busy === 'complete' ? ' is-loading' : ''}`} disabled={!!busy} onClick={complete}><Icon name="check-circle" />Mark Completed</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <CancelModal target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={(updated) => onChanged(updated)} />
    </>
  );
}

function AppointmentsPageInner() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [selected, setSelected] = useState(null);
  const [counts, setCounts] = useState({});
  const [upcoming, setUpcoming] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = usePager(`${q}|${date}|${status}|${paymentStatus}`);

  // Only the newest request may fill the table: a slower, older one (e.g. before the saved default
  // filter applied) must not overwrite it.
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (date) qs.set('date', date);
      if (status) qs.set('status', status);
      if (paymentStatus) qs.set('paymentStatus', paymentStatus);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/doctor/appointments?${qs}`);
      if (mine !== seq.current) return;
      setItems(data.items);
      setTotal(data.total);
      setPages(data.pages || 1);
      setCounts(data.counts || {});
      setUpcoming(data.upcoming || 0);
    } catch (err) {
      if (mine === seq.current) toast(err.message, 'error');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [q, date, status, paymentStatus, page]);

  useEffect(() => { load(); }, [load]);

  // ?open=APT123 (e.g. from a patient's history) opens that appointment straight away.
  // Settings > Preferences: the default status filter, unless the link already says what to show.
  const prefs = usePrefs();
  useEffect(() => {
    if (prefs && prefs.defaultStatus && !searchParams.get('q') && !searchParams.get('open')) setStatus(prefs.defaultStatus);
  }, [prefs]); // eslint-disable-line react-hooks/exhaustive-deps

  const openId = searchParams.get('open');
  useEffect(() => {
    if (!openId) return;
    api(`/api/doctor/appointments/${encodeURIComponent(openId)}`).then((r) => setSelected(r.appointment)).catch((err) => toast(err.message, 'error'));
  }, [openId]);


  // Open the drawer straight away with the row we have, then refresh it from the detail endpoint.
  function openDetail(a) {
    setSelected(a);
    api(`/api/doctor/appointments/${a.id}`)
      .then((r) => setSelected((cur) => (cur && cur.id === a.id ? { ...cur, ...r.appointment } : cur)))
      .catch(() => {});
  }

  function onChanged(updated) {
    setItems((list) => list.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
    setSelected((cur) => (cur && cur.id === updated.id ? { ...cur, ...updated } : cur));
    if (updated.status) load(); // the totals move with a status change
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Every appointment booked with you, across all time.</p>
        </div>
      </div>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="calendar" /></span><div><div className="mini-stat__label">Matching</div><div className="mini-stat__value">{counts.all || 0}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="clock" /></span><div><div className="mini-stat__label">Upcoming</div><div className="mini-stat__value">{upcoming}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Pending</div><div className="mini-stat__value">{counts.pending || 0}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed</div><div className="mini-stat__value">{counts.completed || 0}</div></div></div>
      </section>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Patient name, mobile or appointment ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item"><label>Date</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="confirmed">Confirmed</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="no_show">No-show</option>
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Payment</label>
            <select className="select" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <option value="">All</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setDate(''); setStatus(''); setPaymentStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Patient</th><th>Appointment ID</th><th>Date &amp; Time</th><th className="num">Fee</th><th>Payment</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="calendar" /></div><h3>No appointments found</h3><p>Try a different search or filter.</p></div></td></tr>
              )}
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Patient" className="cell-primary">{a.patientName}</td>
                  <td data-label="Appointment ID" className="mono">{a.id}</td>
                  <td data-label="Date & Time" className="nowrap">{formatDate(a.date)}, {time12(a.time)}</td>
                  <td data-label="Fee" className="num fee">{money(a.fee)}</td>
                  <td data-label="Payment"><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></td>
                  <td data-label="Status"><StatusBadge a={a} /></td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => openDetail(a)}><Icon name="eye" />View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="appointment" onPage={setPage} />
      </article>

      <Drawer appointment={selected} onClose={() => setSelected(null)} onChanged={onChanged} />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }}></div>}>
      <AppointmentsPageInner />
    </Suspense>
  );
}
