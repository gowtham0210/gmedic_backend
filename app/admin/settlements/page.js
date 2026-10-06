'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

const STATUS_TONE = { PENDING: 'pending', PROCESSING: 'pending', PAID: 'confirmed', ON_HOLD: 'cancelled' };
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

function GenerateModal({ open, hospitals, onClose, onCreated }) {
  const [form, setForm] = useState({ hospitalId: '', periodStart: '', periodEnd: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/admin/settlements', { method: 'POST', body: form });
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
      <div className="modal__panel modal__panel--sm">
        <form onSubmit={submit}>
          <div className="modal__head">
            <div className="modal__icon tone-teal"><Icon name="wallet" /></div>
            <div><h2>Custom-period settlement</h2><p>Computed from real payments and refunds for the period.</p></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className={`field${errors.hospitalId ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Hospital *</label>
              <select className="select" value={form.hospitalId} onChange={(e) => setForm((f) => ({ ...f, hospitalId: e.target.value }))} required>
                <option value="">Select hospital</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label>Period start *</label><input className="input" type="date" value={form.periodStart} onChange={(e) => setForm((f) => ({ ...f, periodStart: e.target.value }))} required /></div>
              <div className="field"><label>Period end *</label><input className="input" type="date" value={form.periodEnd} onChange={(e) => setForm((f) => ({ ...f, periodEnd: e.target.value }))} required /></div>
            </div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Generate</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MarkPaidModal({ target, onClose, onDone }) {
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  if (!target) return null;

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api(`/api/admin/settlements/${target.id}/mark-paid`, { method: 'POST', body: { payoutReference: ref } });
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
            <div className="modal__icon tone-green"><Icon name="check-circle" /></div>
            <div><h2>Mark {target.id} as paid</h2><p>Net payout: {money(target.netPayout)}</p></div>
          </div>
          <div className="modal__body">
            <div className="field"><label>Payout reference *</label><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} required placeholder="UTR / transaction reference" /></div>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}>Mark Paid</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettlementsPage() {
  const [items, setItems] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [showGenerate, setShowGenerate] = useState(false);
  const [paidTarget, setPaidTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (status) qs.set('status', status);
      qs.set('pageSize', '25');
      const data = await api(`/api/admin/settlements?${qs}`);
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/api/admin/hospitals?pageSize=100').then((d) => setHospitals(d.items)).catch(() => {}); }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settlements</h1>
          <p>Generated automatically every week from each hospital&apos;s paid appointments, refunds and commission rule.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowGenerate(true)}><Icon name="plus" />Custom Period</button>
        </div>
      </div>

      <article className="card" style={{ marginBottom: 16 }}>
        <div className="card__head"><h2 className="card__title"><Icon name="wallet" />Commission rates</h2></div>
        <p className="text-muted" style={{ fontSize: 13, margin: '0 0 10px' }}>The Super Admin sets each hospital&apos;s commission on its page under Fee &amp; Commission. It is applied to every new settlement and recorded on it.</p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Hospital</th><th>Commission</th><th></th></tr></thead>
            <tbody>
              {hospitals.map((h) => (
                <tr key={h.id}>
                  <td>{h.name}</td>
                  <td className="num">{h.commissionType === 'PERCENT' ? `${h.commissionValue}% of collection` : `₹${h.commissionValue} per paid appointment`}</td>
                  <td className="col-actions"><a className="action-btn" href={`/admin/hospitals/${h.id}`}><Icon name="pencil" />Edit rate</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__item">
            <label>Status</label>
            <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="PROCESSING">Processing</option>
              <option value="PAID">Paid</option>
              <option value="ON_HOLD">On hold</option>
            </select>
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => setStatus('')}><Icon name="refresh" />Reset</button>
        </div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Settlement</th><th>Hospital</th><th>Period</th><th>Appts</th><th>Gross</th><th>Refunds</th><th>Commission (rate)</th><th>Net Payout</th><th>Status</th><th className="col-actions">Actions</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={10}><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={10} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="wallet" /></div><h3>No settlements found</h3><p>Generate the first settlement for a hospital and period.</p></div></td></tr>
              )}
              {items.map((s) => (
                <tr key={s.id}>
                  <td data-label="Settlement" className="cell-primary mono">{s.id}</td>
                  <td data-label="Hospital" className="text-muted">{s.hospitalName}</td>
                  <td data-label="Period" className="mono">{s.periodStart} → {s.periodEnd}</td>
 <td data-label="Appts" className="num">{s.appointmentsCount}</td>
                  <td data-label="Gross" className="num fee">{money(s.grossCollection)}</td>
                  <td data-label="Refunds" className="num">{money(s.refundsAmount)}</td>
                  <td data-label="Commission" className="num">{money(s.commissionAmount)}<div className="text-muted" style={{ fontSize: 12 }}>{s.commissionType === 'PERCENT' ? `${s.commissionValue}%` : s.commissionType === 'FLAT' ? `₹${s.commissionValue}/appt` : ''}</div></td>
                  <td data-label="Net Payout" className="num fee">{money(s.netPayout)}</td>
                  <td data-label="Status"><span className={`badge badge--${STATUS_TONE[s.status]}`}>{s.status.replace('_', ' ')}</span></td>
                  <td className="col-actions">{s.status !== 'PAID' && <button type="button" className="action-btn" onClick={() => setPaidTarget(s)}><Icon name="check" />Mark Paid</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager"><span>{total} settlement{total === 1 ? '' : 's'}</span></div>
      </article>

      <GenerateModal open={showGenerate} hospitals={hospitals} onClose={() => setShowGenerate(false)} onCreated={load} />
      <MarkPaidModal target={paidTarget} onClose={() => setPaidTarget(null)} onDone={load} />
    </>
  );
}
