'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import { formatDate, formatDateTime, formatTime } from '../../../lib/format';

const STATUS_TONE = { confirmed: 'confirmed', pending: 'pending', completed: 'completed', cancelled: 'cancelled' };
const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const maskMobile = (m) => (m ? `${m.slice(0, 2)}••••${m.slice(-2)}` : '—');

function DetailDrawer({ appointment: a, onClose }) {
  if (!a) return null;
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
          <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="info" /><span>View only. Appointments are changed by the patient, doctor or hospital — not by Super Admin.</span></div>
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
        </div>
        <div className="modal__foot"><button type="button" className="btn btn--ghost" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

export default function AppointmentsPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [f, setF] = useState({ id: '', hospitalId: '', doctorId: '', status: '', paymentStatus: '', from: '', to: '' });
  const [selected, setSelected] = useState(null);

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
    api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {});
    api('/api/admin/doctors?pageSize=100').then((d) => setDoctors(d.items)).catch(() => {});
  }, []);

  const set = (k) => (e) => { setF((cur) => ({ ...cur, [k]: e.target.value })); setPage(1); };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Appointments</h1>
          <p>Monitor all appointments across the Gmedic platform. This section is view-only.</p>
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
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => setSelected(a)}><Icon name="eye" />View</button></td>
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

      <DetailDrawer appointment={selected} onClose={() => setSelected(null)} />
    </>
  );
}
