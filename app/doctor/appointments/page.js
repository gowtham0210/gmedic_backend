'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '../../../components/Icon';
import { formatDate } from '../../../lib/format';

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
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

function CancelModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/doctor/appointments/${target.id}/status`, { method: 'PATCH', body: { status: 'cancelled', reason } });
      toast(res.message, 'success');
      onDone(res.appointment);
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="calendar-x" /></div>
            <div><h2>Cancel appointment?</h2><p>{target.patientName}</p></div>
          </div>
          <div className="modal__body">
            <div className="field"><label>Reason *</label><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} /></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Back</button>
            <button type="submit" className={`btn btn--danger${saving ? ' is-loading' : ''}`} disabled={saving}>Cancel Appointment</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Drawer({ appointment, onClose, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  if (!appointment) return null;
  const a = appointment;

  async function complete() {
    setBusy(true);
    try {
      const res = await api(`/api/doctor/appointments/${a.id}/status`, { method: 'PATCH', body: { status: 'completed' } });
      toast(res.message, 'success');
      onChanged(res.appointment);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { label: 'Booked', done: true },
    { label: 'Payment completed', done: a.paymentStatus === 'paid' },
    { label: 'Confirmed', done: a.status !== 'pending' },
    { label: 'Completed', done: a.status === 'completed' },
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
              <div><dt>Booking source</dt><dd>Gmedic App</dd></div>
              <div><dt>Payment</dt><dd><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></dd></div>
              <div><dt>Status</dt><dd><span className={`badge badge--${STATUS_TONE[a.status]}`}>{a.status}</span></dd></div>
            </dl>

            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 12 }}>Timeline</h3>
            <ul className="drawer__timeline">
              {steps.map((s) => <li key={s.label} className={s.done ? 'is-done' : ''}>{s.label}</li>)}
            </ul>
          </div>
          {a.status !== 'completed' && a.status !== 'cancelled' && (
            <div className="modal__foot">
              <button type="button" className="btn btn--danger" disabled={busy} onClick={() => setCancelTarget(a)}><Icon name="x" />Cancel</button>
              <button type="button" className={`btn btn--primary${busy ? ' is-loading' : ''}`} disabled={busy} onClick={complete}><Icon name="check-circle" />Mark Completed</button>
            </div>
          )}
        </div>
      </div>
      <CancelModal target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={(updated) => { onChanged(updated); onClose(); }} />
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (date) qs.set('date', date);
      if (status) qs.set('status', status);
      if (paymentStatus) qs.set('paymentStatus', paymentStatus);
      qs.set('pageSize', '25');
      const data = await api(`/api/doctor/appointments?${qs}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, date, status, paymentStatus]);

  useEffect(() => { load(); }, [load]);

  const counts = {
    total: items.length,
    upcoming: items.filter((a) => a.status !== 'cancelled' && a.status !== 'completed').length,
    waiting: items.filter((a) => a.status === 'pending').length,
    completed: items.filter((a) => a.status === 'completed').length,
    cancelled: items.filter((a) => a.status === 'cancelled').length,
  };

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
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="calendar" /></span><div><div className="mini-stat__label">Shown</div><div className="mini-stat__value">{counts.total}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="clock" /></span><div><div className="mini-stat__label">Upcoming</div><div className="mini-stat__value">{counts.upcoming}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Waiting</div><div className="mini-stat__value">{counts.waiting}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed</div><div className="mini-stat__value">{counts.completed}</div></div></div>
      </section>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Patient name or appointment ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
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
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[a.status]}`}>{a.status}</span></td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => openDetail(a)}><Icon name="eye" />View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} appointment{total === 1 ? '' : 's'}</span></div>
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
