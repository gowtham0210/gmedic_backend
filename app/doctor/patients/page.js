'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Icon from '../../../components/Icon';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function PatientsPageInner() {
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      const data = await api(`/api/doctor/patients?${qs}`);
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Patients</h1>
          <p>Patients who have booked an appointment with you.</p>
        </div>
      </div>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="users" /></span><div><div className="mini-stat__label">Total Patients</div><div className="mini-stat__value">{summary.total ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="calendar" /></span><div><div className="mini-stat__label">Today&apos;s Patients</div><div className="mini-stat__value">{summary.today ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="clock" /></span><div><div className="mini-stat__label">Upcoming</div><div className="mini-stat__value">{summary.upcoming ?? '–'}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Completed Visits</div><div className="mini-stat__value">{summary.completed ?? '–'}</div></div></div>
      </section>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Patient name, ID or appointment ID…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setQ('')}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Patient</th><th>Last Appointment</th><th>Next Appointment</th><th>Total Visits</th><th className="col-actions">Action</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={5}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="users" /></div><h3>No patients found</h3></div></td></tr>
              )}
              {items.map((p) => (
                <tr key={p.id}>
                  <td data-label="Patient" className="cell-primary">{p.name}<span className="cell-sub mono">{p.id}</span></td>
                  <td data-label="Last Appointment" className="text-muted">{p.lastAppointment || '—'}</td>
                  <td data-label="Next Appointment" className="text-muted">{p.nextAppointment || '—'}</td>
                  <td data-label="Total Visits">{p.totalVisits}</td>
                  <td className="col-actions"><Link className="action-btn" href={`/doctor/patients/${p.id}`}><Icon name="eye" />View</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{items.length} patient{items.length === 1 ? '' : 's'}</span></div>
      </article>
    </>
  );
}

export default function PatientsPage() {
  return (
    <Suspense fallback={<div className="skeleton" style={{ height: 300 }}></div>}>
      <PatientsPageInner />
    </Suspense>
  );
}
