'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import { formatDateTime } from '../../../lib/format';

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

export default function PaymentsPage() {
  const [tab, setTab] = useState('payments');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [webhooks, setWebhooks] = useState([]);
  const [whLoading, setWhLoading] = useState(false);

  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/payments?${qs}`);
      setItems(data.items);
      setSummary(data.summary);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, from, to]);

  const loadWebhooks = useCallback(async () => {
    setWhLoading(true);
    try {
      const data = await api('/api/admin/webhooks?pageSize=25');
      setWebhooks(data.items);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setWhLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === 'payments') loadPayments(); }, [tab, loadPayments]);
  useEffect(() => { if (tab === 'webhooks') loadWebhooks(); }, [tab, loadWebhooks]);

  async function resync(id) {
    try {
      const res = await api(`/api/admin/webhooks/${id}/resync`, { method: 'POST' });
      toast(res.message, 'success');
      loadWebhooks();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Payments</h1>
          <p>Every transaction across every hospital, and the gateway webhook inbox.</p>
        </div>
      </div>

      {tab === 'payments' && (
        <section className="summary-strip">
          <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="rupee" /></span><div><div className="mini-stat__label">Collected</div><div className="mini-stat__value">{money(summary.collected)}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="alert" /></span><div><div className="mini-stat__label">Failed amount</div><div className="mini-stat__value">{money(summary.failedAmount)}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Paid count</div><div className="mini-stat__value">{summary.paidCount ?? '–'}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="x" /></span><div><div className="mini-stat__label">Failed count</div><div className="mini-stat__value">{summary.failedCount ?? '–'}</div></div></div>
        </section>
      )}

      <div className="tabs" role="tablist" style={{ marginBottom: 16 }}>
        <button type="button" className={`tab${tab === 'payments' ? ' is-active' : ''}`} onClick={() => setTab('payments')}>Transactions</button>
        <button type="button" className={`tab${tab === 'webhooks' ? ' is-active' : ''}`} onClick={() => setTab('webhooks')}>Webhook Inbox</button>
      </div>

      {tab === 'payments' && (
        <article className="card card--flush">
          <div className="toolbar">
            <div className="field toolbar__search">
              <label>Search</label>
              <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Patient, doctor or transaction ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="field toolbar__item">
              <label>Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div className="field toolbar__item"><label>From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field toolbar__item"><label>To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); setFrom(''); setTo(''); }}><Icon name="refresh" />Reset</button>
          </div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Transaction</th><th>Patient</th><th>Hospital</th><th>Doctor</th><th className="num">Amount</th><th>Method</th><th>Status</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={7}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={7} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="credit-card" /></div><h3>No transactions found</h3></div></td></tr>
                )}
                {items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Transaction" className="cell-primary mono">{p.payment?.transactionId || '—'}</td>
                    <td data-label="Patient">{p.patientName}</td>
                    <td data-label="Hospital" className="text-muted">{p.hospitalName}</td>
                    <td data-label="Doctor" className="text-muted">{p.doctorName}</td>
                    <td data-label="Amount" className="num fee">{money(p.fee)}</td>
                    <td data-label="Method">{p.payment?.method || '—'}</td>
                    <td data-label="Status"><span className={`badge badge--${p.paymentStatus === 'PAID' ? 'confirmed' : 'cancelled'}`}>{p.paymentStatus}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pager"><span>{total} transaction{total === 1 ? '' : 's'}</span></div>
        </article>
      )}

      {tab === 'webhooks' && (
        <article className="card card--flush">
          <div className="alert alert--info" style={{ margin: 16 }}><Icon name="info" /><span>No live payment gateway is connected yet — this inbox shows the schema-ready sample events seeded for development.</span></div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Event</th><th>Transaction</th><th>Status</th><th>Sync</th><th>Received</th><th className="col-actions">Actions</th></tr></thead>
              <tbody>
                {whLoading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div></td></tr>}
                {!whLoading && webhooks.length === 0 && <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><p className="text-muted">No webhook events yet.</p></td></tr>}
                {webhooks.map((w) => (
                  <tr key={w.id}>
                    <td data-label="Event">{w.eventType}<span className="cell-sub">{w.gateway}{w.isSample ? ' · sample' : ''}</span></td>
                    <td data-label="Transaction" className="mono">{w.transactionId}</td>
                    <td data-label="Status"><span className={`badge badge--${w.status === 'FAILED' ? 'cancelled' : 'confirmed'}`}>{w.status}</span></td>
                    <td data-label="Sync"><span className={`badge badge--${w.syncStatus === 'SYNCED' ? 'confirmed' : w.syncStatus === 'NOT_REQUIRED' ? 'neutral' : 'pending'}`}>{w.syncStatus}</span></td>
                    <td data-label="Received" className="text-muted">{w.receivedAt ? formatDateTime(w.receivedAt) : '—'}</td>
                    <td className="col-actions">{w.syncStatus === 'PENDING' && <button type="button" className="action-btn" onClick={() => resync(w.id)}><Icon name="refresh" />Resync</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
    </>
  );
}
