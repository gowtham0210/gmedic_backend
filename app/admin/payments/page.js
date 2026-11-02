'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Icon from '../../../components/Icon';
import usePermissions from '../../../components/admin/usePermissions';
import Pager, { usePager } from '../../../components/admin/Pager';
import useHospitalOptions from '../../../components/admin/useHospitalOptions';
import { formatDate, formatDateTime } from '../../../lib/format';

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

// The summary is computed over the same filters as the table, so each card
// states the range it covers ("All time" when no dates are set).
function scopeLabel({ from, to, q, status }) {
  let range = 'All time';
  if (from && to) range = `${formatDate(from)} – ${formatDate(to)}`;
  else if (from) range = `Since ${formatDate(from)}`;
  else if (to) range = `Up to ${formatDate(to)}`;
  return q || status ? `${range} · filtered` : range;
}

// What the inbox contains: development sample data (no gateway yet), a live
// gateway with leftover setup rows, or a live gateway only (neutral status).
function WebhookSourceNotice({ meta }) {
  if (!meta) return null;
  const { gateway, sampleCount } = meta;
  if (!gateway?.connected) {
    return <div className="alert alert--info" style={{ margin: 16 }}><Icon name="info" /><span>No live payment gateway is connected yet — this inbox shows the schema-ready sample events seeded for development.</span></div>;
  }
  if (sampleCount > 0) {
    return <div className="alert alert--info" style={{ margin: 16 }}><Icon name="info" /><span>Receiving events from {gateway.name}. {sampleCount} test event{sampleCount === 1 ? '' : 's'} created during setup {sampleCount === 1 ? 'is' : 'are'} still listed and should be removed.</span></div>;
  }
  return <p className="text-muted" style={{ margin: 16, fontSize: 13 }}>Receiving events from {gateway.name}.</p>;
}

const METHOD_LABEL = { UPI: 'UPI', Card: 'Card', 'Net Banking': 'Net banking', Wallet: 'Wallet', Cash: 'Cash' };

// One payment: the money breakdown, its refunds and disputes, and the gateway events recorded for it.
function PaymentDrawer({ id, onClose, canRefund, canDispute }) {
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    setPayment(null); setError('');
    api(`/api/admin/payments/${id}`).then((d) => setPayment(d.payment)).catch((err) => setError(err.message));
  }, [id]);
  if (!id) return null;
  const p = payment;
  return (
    <div className="modal modal--drawer" role="dialog" aria-modal="true" aria-labelledby="payment-drawer-title">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel modal__panel--drawer">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="credit-card" /></div>
          <div><h2 id="payment-drawer-title" className="mono">{p ? p.transactionId : id}</h2><p>{p ? `${p.patientName} · ${p.hospitalName}` : 'Loading…'}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body" style={{ flex: 1 }}>
          {error && <div className="alert alert--error"><Icon name="alert-triangle" /><span>{error}</span></div>}
          {!p && !error && <div className="skeleton" style={{ height: 160 }}></div>}
          {p && (
            <>
              <dl className="kv">
                <div><dt>Payment</dt><dd className="mono">{p.id}</dd></div>
                <div><dt>Type</dt><dd>{p.purpose === 'TOKEN' ? 'Booking token (Gmedic, non-refundable)' : 'Consultation fee (collected at the hospital)'}</dd></div>
                <div><dt>Status</dt><dd><span className={`badge badge--${p.paymentStatus === 'PAID' ? 'confirmed' : p.paymentStatus === 'FAILED' ? 'cancelled' : 'pending'}`}>{p.paymentStatus}</span></dd></div>
                <div><dt>Appointment</dt><dd><span className="mono">{p.appointmentId}</span> · {formatDate(p.date)} · {p.doctorName}</dd></div>
                <div><dt>Method</dt><dd>{METHOD_LABEL[p.method] || p.method || '—'}</dd></div>
                <div><dt>Paid at</dt><dd>{p.paidAt ? formatDateTime(p.paidAt) : '—'}</dd></div>
                <div><dt>Receipt</dt><dd className="mono">{p.receiptNumber || '—'}</dd></div>
                <div><dt>Gateway</dt><dd>{p.gateway}{p.gatewayOrderId ? <span className="cell-sub mono">{p.gatewayOrderId}</span> : null}</dd></div>
                {p.failureReason && <div className="kv--full"><dt>Failure reason</dt><dd>{p.failureReason}</dd></div>}
              </dl>
              <h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Amount</h3>
              <dl className="kv">
                <div><dt>Total charged</dt><dd><strong>{money(p.amount)}</strong></dd></div>
                <div><dt>Refunded</dt><dd>{money(p.refunded)}{p.refundable > 0 && p.paymentStatus === 'PAID' ? ` · ${money(p.refundable)} still refundable` : ''}</dd></div>
              </dl>
              {p.refunds.length > 0 && (<><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Refunds</h3><dl className="kv">{p.refunds.map((r) => <div key={r.id}><dt>{r.id} · {formatDate(r.createdAt)}</dt><dd>{money(r.amount)} · {r.status.toLowerCase()} · {r.reason}</dd></div>)}</dl></>)}
              {p.disputes.length > 0 && (<><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Disputes</h3><dl className="kv">{p.disputes.map((d) => <div key={d.id}><dt>{d.id} · {formatDate(d.createdAt)}</dt><dd>{money(d.amount)} · {d.status.toLowerCase().replace('_', ' ')} · {d.reason}</dd></div>)}</dl></>)}
              {p.events.length > 0 && (<><h3 style={{ fontSize: 14, margin: '20px 0 8px' }}>Gateway events</h3><ol className="drawer__timeline">{p.events.map((e) => <li key={e.id} className="is-done">{e.eventType} · {e.status.toLowerCase()}{e.failureReason ? ` (${e.failureReason})` : ''}<span className="cell-sub">{formatDateTime(e.receivedAt)}</span></li>)}</ol></>)}
            </>
          )}
        </div>
        <div className="modal__foot">
          {p && p.paymentStatus === 'PAID' && canRefund && p.refundable > 0 && <a className="btn btn--ghost" href={`/admin/refunds?issue=${encodeURIComponent(p.appointmentId)}`}><Icon name="refresh" />Issue refund</a>}
          {p && p.paymentStatus === 'PAID' && canDispute && <a className="btn btn--ghost" href={`/admin/disputes?raise=${encodeURIComponent(p.id)}`}><Icon name="alert-triangle" />Raise dispute</a>}
          <button type="button" className="btn btn--ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function PaymentsPage() {
  const can = usePermissions();
  // Filters can be preset from the URL, e.g. the dashboard's "needs attention" links.
  const params = useSearchParams();
  const [tab, setTab] = useState('payments');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(() => params.get('status') || '');
  // TOKEN: booking tokens paid in the app (Gmedic's revenue); CONSULTATION: fees collected at hospitals.
  const [purpose, setPurpose] = useState(() => params.get('purpose') || '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hospitalId, setHospitalId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [doctors, setDoctors] = useState([]);
  const hospitals = useHospitalOptions();
  const [detailId, setDetailId] = useState(null);
  const [hideSample, setHideSample] = useState(false);

  const [webhooks, setWebhooks] = useState([]);
  const [whLoading, setWhLoading] = useState(false);
  const [whMeta, setWhMeta] = useState(null);

  const [page, setPage] = usePager(JSON.stringify([q, status, purpose, from, to, hospitalId, doctorId]));
  const [pages, setPages] = useState(1);
  const loadPayments = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (q) qs.set('q', q);
      if (status) qs.set('status', status);
      if (purpose) qs.set('purpose', purpose);
      if (from) qs.set('from', from);
      if (to) qs.set('to', to);
      if (hospitalId) qs.set('hospitalId', hospitalId);
      if (doctorId) qs.set('doctorId', doctorId);
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/payments?${qs}`);
      setItems(data.items);
      setSummary(data.summary);
      setTotal(data.total); setPages(data.pages || 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [q, status, purpose, from, to, hospitalId, doctorId, page]);

  const loadWebhooks = useCallback(async () => {
    setWhLoading(true);
    try {
      const data = await api(`/api/admin/webhooks?pageSize=25${hideSample ? '&sample=hide' : ''}`);
      setWebhooks(data.items);
      setWhMeta({ gateway: data.gateway, sampleCount: data.sampleCount });
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setWhLoading(false);
    }
  }, [hideSample]);

  // Doctors can only be picked once a hospital is chosen (a platform-wide list would be capped and unwieldy).
  useEffect(() => {
    setDoctorId('');
    if (!hospitalId) { setDoctors([]); return; }
    api(`/api/admin/doctors?hospitalId=${encodeURIComponent(hospitalId)}&pageSize=100`).then((d) => setDoctors(d.items)).catch(() => setDoctors([]));
  }, [hospitalId]);

  useEffect(() => { if (tab === 'payments') loadPayments(); }, [tab, loadPayments]);
  const scope = scopeLabel({ from, to, q, status });
  useEffect(() => { if (tab === 'webhooks') loadWebhooks(); }, [tab, loadWebhooks]);

  async function resync(id) {
    try {
      const res = await api(`/api/admin/webhooks/${id}/resync`, { method: 'POST' });
      toast(res.message, 'success');
      loadWebhooks();
    } catch (err) {
      toast(err.message, 'error');
      loadWebhooks(); // a failed retry still updates the event's reason and retry count
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
          <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="rupee" /></span><div><div className="mini-stat__label">Collected amount</div><div className="mini-stat__value">{money(summary.collected)}</div><div className="mini-stat__hint">{scope} · gross, before refunds</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-red"><Icon name="alert" /></span><div><div className="mini-stat__label">Failed amount</div><div className="mini-stat__value">{money(summary.failedAmount)}</div><div className="mini-stat__hint">{scope}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="check-circle" /></span><div><div className="mini-stat__label">Successful payments</div><div className="mini-stat__value">{summary.paidCount ?? '–'}</div><div className="mini-stat__hint">{scope}</div></div></div>
          <div className="card mini-stat"><span className="stat__icon tone-amber"><Icon name="x" /></span><div><div className="mini-stat__label">Failed payments</div><div className="mini-stat__value">{summary.failedCount ?? '–'}</div><div className="mini-stat__hint">{scope}</div></div></div>
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
              <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Patient, doctor, transaction or appointment ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            </div>
            <div className="field toolbar__item">
              <label>Hospital</label>
              <select className="select" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
                <option value="">All</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="field toolbar__item">
              <label>Doctor</label>
              <select className="select" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} disabled={!hospitalId} title={hospitalId ? undefined : 'Choose a hospital first'}>
                <option value="">{hospitalId ? 'All' : 'Choose a hospital'}</option>
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field toolbar__item">
              <label>Status</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="field toolbar__item">
              <label>Type</label>
              <select className="select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="">All</option>
                <option value="TOKEN">Booking tokens</option>
                <option value="CONSULTATION">Consultation fees (at hospital)</option>
              </select>
            </div>
            <div className="field toolbar__item"><label>Paid from</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="field toolbar__item"><label>Paid to</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
            <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setStatus(''); setPurpose(''); setFrom(''); setTo(''); setHospitalId(''); setDoctorId(''); }}><Icon name="refresh" />Reset</button>
          </div>
          <div className="table-wrap">
            <table className="table table--stack">
              <thead><tr><th>Transaction</th><th>Type</th><th>Patient</th><th>Hospital</th><th>Doctor</th><th className="num">Amount</th><th>Method</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={9}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
                {!loading && items.length === 0 && (
                  <tr><td colSpan={9} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="credit-card" /></div><h3>No transactions found</h3></div></td></tr>
                )}
                {items.map((p) => (
                  <tr key={p.id}>
                    <td data-label="Transaction" className="cell-primary mono">{p.payment?.transactionId || '—'}</td>
                    <td data-label="Type">{p.purpose === 'TOKEN' ? 'Booking token' : 'Consultation fee'}</td>
                    <td data-label="Patient">{p.patientName}</td>
                    <td data-label="Hospital" className="text-muted">{p.hospitalName}</td>
                    <td data-label="Doctor" className="text-muted">{p.doctorName}</td>
                    <td data-label="Amount" className="num fee">{money(p.fee)}</td>
                    <td data-label="Method">{p.payment?.method || '—'}</td>
                    <td data-label="Status"><span className={`badge badge--${p.paymentStatus === 'PAID' ? 'confirmed' : p.paymentStatus === 'PENDING' ? 'pending' : 'cancelled'}`}>{p.paymentStatus}</span></td>
                    <td className="col-actions"><button type="button" className="action-btn" onClick={() => setDetailId(p.id)}><Icon name="eye" />View</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager total={total} page={page} pages={pages} noun="transaction" onPage={setPage} />
        </article>
      )}

      {tab === 'webhooks' && (
        <article className="card card--flush">
          <WebhookSourceNotice meta={whMeta} />
          {whMeta && whMeta.sampleCount > 0 && (
            <label className="check-row" style={{ margin: '0 16px 12px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={hideSample} onChange={(e) => setHideSample(e.target.checked)} /> Hide the {whMeta.sampleCount} sample event{whMeta.sampleCount === 1 ? '' : 's'}
            </label>
          )}
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
                    <td data-label="Status"><span className={`badge badge--${w.status === 'FAILED' ? 'cancelled' : 'confirmed'}`}>{w.status}</span>{w.failureReason && <span className="cell-sub">{w.failureReason}</span>}{w.retryCount > 0 && <span className="cell-sub">retried {w.retryCount}×</span>}</td>
                    <td data-label="Sync"><span className={`badge badge--${w.syncStatus === 'SYNCED' ? 'confirmed' : w.syncStatus === 'NOT_REQUIRED' ? 'neutral' : 'pending'}`}>{w.syncStatus}</span></td>
                    <td data-label="Received" className="text-muted">{w.receivedAt ? formatDateTime(w.receivedAt) : '—'}</td>
                    <td className="col-actions">{can('webhooks.manage') && (w.status === 'FAILED' || w.syncStatus === 'PENDING' || w.syncStatus === 'FAILED') && <button type="button" className="action-btn" onClick={() => resync(w.id)}><Icon name="refresh" />Retry sync</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      )}
      <PaymentDrawer id={detailId} onClose={() => setDetailId(null)} canRefund={can('refunds.manage')} canDispute={can('disputes.manage')} />
    </>
  );
}

// useSearchParams needs a Suspense boundary for the production build.
export default function PaymentsPageRoute() {
  return <Suspense fallback={null}><PaymentsPage /></Suspense>;
}
