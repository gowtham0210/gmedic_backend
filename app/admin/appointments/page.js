'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

const STATUS_TONE = { confirmed: 'confirmed', pending: 'pending', completed: 'confirmed', cancelled: 'cancelled' };
const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

function CancelModal({ target, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/appointments/${target.id}/cancel`, { method: 'POST', body: { reason } });
      toast(res.message, 'success');
      onDone();
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
            <div><h2>Cancel appointment?</h2><p>{target.patientName} · {target.hospitalName}</p></div>
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

function RescheduleModal({ target, onClose, onDone }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (target) { setDate(target.date); setTime(target.time); setReason(''); } }, [target]);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/appointments/${target.id}/reschedule`, { method: 'POST', body: { date, time, reason } });
      toast(res.message, 'success');
      onDone();
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
            <div className="modal__icon tone-amber"><Icon name="calendar-check" /></div>
            <div><h2>Reschedule appointment</h2><p>{target.patientName} · {target.hospitalName}</p></div>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field"><label>Date *</label><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></div>
              <div className="field"><label>Time *</label><input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} required /></div>
              <div className="field field--full"><label>Reason *</label><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} required rows={3} /></div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Reschedule</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [mobile, setMobile] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('id', q);
      if (mobile) qs.set('mobile', mobile);
      if (date) qs.set('date', date);
      if (status) qs.set('status', status);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/appointments?${qs}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, mobile, date, status]);

  useEffect(() => { load(); }, [load]);

  const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Search, cancel and reschedule appointments across every hospital.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Appointment ID / patient</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="APT10001 or patient name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Patient mobile</label>
            <input className="input" placeholder="10-digit mobile" value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
          <div className="field toolbar__item">
            <label>Date</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
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
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setMobile(''); setDate(''); setStatus(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Appointment</th><th>Patient</th><th>Doctor</th><th>Hospital</th><th>Date &amp; Time</th><th>Fee</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={8}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={8} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="calendar" /></div><h3>No appointments found</h3><p>Try a different search or filter.</p></div></td></tr>
              )}
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Appointment" className="cell-primary mono">{a.id}</td>
                  <td data-label="Patient">{a.patientName}<span className="cell-sub">{a.patientMobile || ''}</span></td>
                  <td data-label="Doctor" className="text-muted">{a.doctorName}</td>
                  <td data-label="Hospital" className="text-muted">{a.hospitalName}</td>
                  <td data-label="Date & Time" className="mono">{a.date} {a.time}</td>
                  <td data-label="Fee" className="num fee">{money(a.fee)}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[a.status] || 'neutral'}`}>{a.status}</span></td>
                  <td className="col-actions">
                    {a.status !== 'cancelled' && a.status !== 'completed' && (
                      <div className="action-group">
                        <button type="button" className="action-btn" onClick={() => setRescheduleTarget(a)}><Icon name="calendar-check" />Reschedule</button>
                        <button type="button" className="action-btn" onClick={() => setCancelTarget(a)}><Icon name="calendar-x" />Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} appointment{total === 1 ? '' : 's'}</span></div>
      </article>

      <CancelModal target={cancelTarget} onClose={() => setCancelTarget(null)} onDone={load} />
      <RescheduleModal target={rescheduleTarget} onClose={() => setRescheduleTarget(null)} onDone={load} />
    </>
  );
}
