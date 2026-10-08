'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

export default function EarningsPage() {
  const [range, setRange] = useState({ from: '', to: '' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (r) => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams(Object.entries(r).filter(([, v]) => v)).toString();
    try {
      const res = await fetch(`/api/doctor/earnings${qs ? `?${qs}` : ''}`, { credentials: 'same-origin' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { window.location.href = '/login?expired=1&role=DOCTOR'; return; }
      if (!res.ok) throw new Error(body.error || 'Something went wrong.');
      setData(body);
      setRange({ from: body.from, to: body.to });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load({}); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Earnings</h1>
          <p>Paid appointments and pending fees. Shows the last 30 days by default.</p>
        </div>
      </div>

      <form className="filters" onSubmit={(e) => { e.preventDefault(); load(range); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginBottom: 20 }}>
        <div className="field"><label>From</label><input className="input" type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} /></div>
        <div className="field"><label>To</label><input className="input" type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} /></div>
        <button type="submit" className="btn btn--primary"><Icon name="refresh" /><span>Apply</span></button>
      </form>

      {error && <div className="alert alert--error" style={{ marginBottom: 16 }}><Icon name="alert" /><span>{error}</span></div>}

      {loading && !data ? <div className="skeleton" style={{ height: 300 }}></div> : data && (
        <>
          <section className="summary-strip summary-strip--3">
            <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="rupee" /></span><div><div className="mini-stat__label">Earnings</div><div className="mini-stat__value">{money(data.totals.earnings)}</div></div></div>
            <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Paid Appointments</div><div className="mini-stat__value">{data.totals.paidAppointments}</div></div></div>
            <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="hourglass" /></span><div><div className="mini-stat__label">Pending Amount</div><div className="mini-stat__value">{money(data.totals.pendingAmount)}</div></div></div>
          </section>

          <article className="card card--flush" style={{ marginTop: 20 }}>
            <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
              <table className="table table--compact table--stack">
                <thead><tr><th>Date</th><th>Time</th><th>Patient</th><th className="num">Fee</th><th>Transaction</th></tr></thead>
                <tbody>
                  {data.items.length === 0 && <tr><td colSpan={5} className="text-muted">No paid appointments in this period.</td></tr>}
                  {data.items.map((i) => (
                    <tr key={i.appointmentId}>
                      <td data-label="Date" className="mono">{i.date}</td>
                      <td data-label="Time" className="mono">{time12(i.time)}</td>
                      <td data-label="Patient" className="cell-primary">{i.patientName}</td>
                      <td data-label="Fee" className="num fee">{money(i.fee)}</td>
                      <td data-label="Transaction" className="mono">{i.transactionId || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}
    </>
  );
}
