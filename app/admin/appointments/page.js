'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';
import usePermissions from '../../../components/admin/usePermissions';
import { formatDate, formatDateTime, formatTime, maskMobile } from '../../../lib/format';

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
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const HISTORY_LABEL = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed', cancelled: 'Cancelled' };

// Escalation for an appointment nobody else can handle (hospital offboarded, doctor rejected). Uses the same
// cancel path as the patient app and the front desk, so the refund, queue token and notices are handled.
function CancelModal({ appointment: a, onClose, onDone }) {
  const [quote, setQuote] = useState(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!a) return;
    setQuote(null); setReason(''); setError('');
    api(`/api/admin/appointments/${a.id}/cancel`).then((d) => setQuote(d.quote)).catch((err) => setError(err.message));
  }, [a]);
  if (!a) return null;
  const inr = (paise) => money((paise || 0) / 100);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api(`/api/admin/appointments/${a.id}/cancel`, { method: 'POST', body: { reason } });
      toast(res.message, 'success');
      onDone(res.appointment);
      onClose();
    } catch (err) {
      setError((err.fields && err.fields.reason) || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="admin-cancel-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-red"><Icon name="ban" /></div>
            <div><h2 id="admin-cancel-title">Cancel appointment {a.id}?</h2><p>{a.patientName} · {a.hospitalName} · {formatDate(a.date)}, {formatTime(a.time)}. The patient, doctor and front desk are told.</p></div>
          </div>
          <div className="modal__body">
            {!quote && !error && <div className="skeleton skeleton--row"></div>}
            {quote && quote.blocker && <div className="alert alert--error"><Icon name="alert-triangle" /><span>{quote.blocker}</span></div>}
            {quote && !quote.blocker && (
              <>
                <p className="note" style={{ marginTop: 0, marginBottom: 14 }}><Icon name="info" />
                  <span>{quote.paidPaise > 0 ? `The ${inr(quote.paidPaise)} booking token is not refunded.` : 'Nothing was paid online.'}{quote.note && quote.note.includes('hospital returns') ? ' The consultation fee was paid at the hospital, so the hospital returns it.' : ''}</span>
                </p>
                <div className={`field${error ? ' has-error' : ''}`}>
                  <label>Reason *</label>
                  <textarea className="textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Enter the reason for cancelling this appointment…" required />
                  {error && <p className="field__error">{error}</p>}
                </div>
              </>
            )}
            {error && !quote && <div className="alert alert--error"><Icon name="alert-triangle" /><span>{error}</span></div>}
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

function DetailDrawer({ appointment: a, onClose, canCancel, onCancel }) {
  if (!a) return null;
  const cancellable = canCancel && (a.status === 'confirmed' || a.status === 'pending');
  return (
    <div className="modal modal--drawer" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--drawer">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="calendar" /></div>
          <div><h2 className="mono">{a.id}</h2><p>{a.patientName}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" style={{ flex: 1 }}>
          <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="info" /><span>View only. Appointments are changed by the patient, doctor or hospital. Super Admin can only cancel one that nobody else can handle.</span></div>
          <dl className="kv">
            <div><dt>Patient</dt><dd>{a.patientName}</dd></div>
            <div><dt>Patient mobile</dt><dd className="mono">{maskMobile(a.patientMobile)}</dd></div>
            <div><dt>Hospital</dt><dd>{a.hospitalName}</dd></div>
            <div><dt>Branch</dt><dd>{a.branchName || '—'}</dd></div>
            <div><dt>Doctor</dt><dd>{a.doctorName}</dd></div>
            <div><dt>Department</dt><dd>{a.department || a.specialization || '—'}</dd></div>
            <div><dt>Date</dt><dd>{formatDate(a.date)}</dd></div>
            <div><dt>Time</dt><dd>{formatTime(a.time)}</dd></div>
            <div><dt>Booking status</dt><dd><span className={`badge badge--${STATUS_TONE[a.status]}`}>{a.status}</span></dd></div>
            <div><dt>Payment status</dt><dd><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></dd></div>
            <div><dt>Booking type</dt><dd>{a.source || '—'}</dd></div>
            <div><dt>Token number</dt><dd className="mono">{a.tokenCode || '—'}</dd></div>
            <div><dt>Fee</dt><dd>{money(a.fee)}</dd></div>
            <div><dt>Transaction ID</dt><dd className="mono">{a.transactionId || '—'}</dd></div>
            <div><dt>Created</dt><dd>{formatDateTime(a.createdAt)}</dd></div>
            {a.cancelReason && <div className="kv--full"><dt>Cancellation reason</dt><dd>{a.cancelReason}</dd></div>}
          </dl>
          {a.refunds && a.refunds.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Refunds</h3>
              <dl className="kv">
                {a.refunds.map((r) => <div key={r.id}><dt>{r.id} · {formatDate(r.createdAt)}</dt><dd>{money(r.amount)} · {r.status.toLowerCase()}{r.reason ? ` · ${r.reason}` : ''}</dd></div>)}
              </dl>
            </>
          )}
          {a.history && a.history.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Status history</h3>
              <ol className="drawer__timeline">
                {a.history.map((h, i) => <li key={i} className="is-done"><strong>{HISTORY_LABEL[h.to] || h.to}</strong>{h.from ? <span className="text-muted"> (from {HISTORY_LABEL[h.from] || h.from})</span> : null}<span className="cell-sub">{formatDateTime(h.at)}</span></li>)}
              </ol>
            </>
          )}
        </div>
        <div className="modal__foot">
          {cancellable && <button type="button" className="btn btn--ghost" style={{ color: 'var(--red-600)', marginRight: 'auto' }} onClick={() => onCancel(a)}><Icon name="ban" />Cancel appointment</button>}
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const can = usePermissions();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const hospitals = useHospitalOptions();
  const [doctors, setDoctors] = useState([]);
  const [f, setF] = useState({ id: '', hospitalId: '', doctorId: '', status: '', paymentStatus: '', from: '', to: '' });
  const [selected, setSelected] = useState(null);

  // Show the row straight away, then refresh it from the detail endpoint.
  function openDetail(a) {
    setSelected(a);
    api(`/api/admin/appointments/${a.id}`)
      .then((r) => setSelected((cur) => (cur && cur.id === a.id ? { ...cur, ...r.appointment } : cur)))
      .catch(() => {});
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => { if (v) qs.set(k, v); });
      qs.set('page', String(page));
      qs.set('pageSize', '20');
      const data = await api(`/api/admin/appointments?${qs}`);
      setItems(data.items); setTotal(data.total); setPages(data.pages);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [f, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api('/api/admin/doctors?pageSize=100').then((d) => setDoctors(d.items)).catch(() => {});
  }, []);

  const set = (k) => (e) => { setF((cur) => ({ ...cur, [k]: e.target.value })); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Monitor all appointments across the Gmedic platform. View-only, except cancelling an appointment nobody else can handle.</p>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search Appointment</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Appointment ID, patient or doctor" value={f.id} onChange={set('id')} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Hospital</label>
            <select className="select" value={f.hospitalId} onChange={set('hospitalId')}>
              <option value="">All</option>{hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Doctor</label>
            <select className="select" value={f.doctorId} onChange={set('doctorId')}>
              <option value="">All</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={f.status} onChange={set('status')}>
              <option value="">All</option><option value="confirmed">Confirmed</option><option value="pending">Pending</option>
              <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Payment Status</label>
            <select className="select" value={f.paymentStatus} onChange={set('paymentStatus')}>
              <option value="">All</option><option value="paid">Paid</option><option value="pending">Pending</option>
            </select>
          </div>
          <div className="field toolbar__item"><label>From</label><input className="input" type="date" value={f.from} onChange={set('from')} /></div>
          <div className="field toolbar__item"><label>To</label><input className="input" type="date" value={f.to} onChange={set('to')} /></div>
          <button type="button" className="btn btn--ghost" onClick={() => { setF({ id: '', hospitalId: '', doctorId: '', status: '', paymentStatus: '', from: '', to: '' }); setPage(1); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Appointment ID</th><th>Patient</th><th>Hospital</th><th>Doctor</th><th>Date</th><th>Time</th><th>Status</th><th>Payment</th><th>Created</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={10} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="calendar" /></div><h3>No appointments found</h3><p>Try a different search or filter.</p></div></td></tr>
              )}
              {items.map((a) => (
                <tr key={a.id}>
                  <td data-label="Appointment ID" className="cell-primary mono">{a.id}</td>
                  <td data-label="Patient">{a.patientName}<span className="cell-sub">{maskMobile(a.patientMobile)}</span></td>
                  <td data-label="Hospital" className="text-muted">{a.hospitalName}</td>
                  <td data-label="Doctor" className="text-muted">{a.doctorName}</td>
                  <td data-label="Date" className="nowrap">{formatDate(a.date)}</td>
                  <td data-label="Time" className="mono">{formatTime(a.time)}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[a.status]}`}>{a.status}</span></td>
                  <td data-label="Payment"><span className={`badge badge--${a.paymentStatus === 'paid' ? 'confirmed' : 'pending'}`}>{a.paymentStatus}</span></td>
                  <td data-label="Created" className="text-muted nowrap">{formatDate(a.createdAt)}</td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => openDetail(a)}><Icon name="eye" />View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{total} appointment{total === 1 ? '' : 's'} · page {page} of {pages}</span>
          <div className="action-group">
            <button type="button" className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button type="button" className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        </div>
      </article>

      <DetailDrawer appointment={selected} onClose={() => setSelected(null)} canCancel={can('appointments.cancel')} onCancel={setCancelTarget} />
      <CancelModal appointment={cancelTarget} onClose={() => setCancelTarget(null)} onDone={(fresh) => { load(); if (fresh) openDetail(fresh); }} />
    </>
  );
}
