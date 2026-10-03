'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };
const STATUS_TONE = { OPEN: 'pending', IN_PROGRESS: 'pending', RESOLVED: 'confirmed', CLOSED: 'neutral' };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

const FAQS = [
  { q: 'How do I mark an appointment as completed?', a: 'Open Appointments, click View on the appointment, then choose Mark Completed in the drawer — or complete it directly from Today\'s Queue.' },
  { q: 'How do I change my availability?', a: 'Go to Availability from the sidebar and set yourself as Available or Unavailable. Patients booking through the app see this instantly.' },
  { q: 'Can I edit my specialization or consultation fee?', a: 'No — those are verified fields managed by your hospital administrator. Contact them to request a change.' },
  { q: 'How does the queue work?', a: 'Call Next brings the next waiting patient to "Called". Start Consultation moves them to "In Consultation". Complete finishes the visit. Skip sets them aside without losing their place — Recall brings them back.' },
];

export default function SupportPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ category: 'TECHNICAL', subject: '', description: '' });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    api('/api/doctor/support').then((d) => setTickets(d.items)).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api('/api/doctor/support', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm({ category: 'TECHNICAL', subject: '', description: '' });
      load();
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Help &amp; Support</h1>
          <p>Frequently asked questions, and a direct line to Gmedic support.</p>
        </div>
      </div>

      <article className="card" style={{ marginBottom: 24 }}>
        <div className="card__head"><h2 className="card__title"><Icon name="info" />Frequently Asked Questions</h2></div>
        <dl className="kv" style={{ gridTemplateColumns: '1fr' }}>
          {FAQS.map((f) => (
            <div key={f.q} className="kv--full" style={{ marginBottom: 14 }}>
              <dt style={{ marginBottom: 4 }}>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </article>

      <div className="two-col">
        <article className="card card--flush">
          <div className="card__head"><h2 className="card__title"><Icon name="ticket" />Your Requests</h2></div>
          <div className="table-wrap">
            <table className="table table--compact table--stack">
              <thead><tr><th>Ticket</th><th>Subject</th><th>Created</th><th>Status</th></tr></thead>
              <tbody>
                {loading && <tr><td colSpan={4}><div className="skeleton skeleton--row"></div></td></tr>}
                {!loading && tickets.length === 0 && <tr><td colSpan={4} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No support requests yet.</p></td></tr>}
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td data-label="Ticket" className="mono">{t.id}</td>
                    <td data-label="Subject">{t.subject}</td>
                    <td data-label="Created" className="text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td data-label="Status"><span className={`badge badge--${STATUS_TONE[t.status]}`}>{t.status.replace('_', ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <div className="card__head"><h2 className="card__title"><Icon name="life-buoy" />Create Support Request</h2></div>
          <form onSubmit={submit}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Category</label>
              <select className="select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {['BOOKING', 'PAYMENT', 'ACCOUNT', 'TECHNICAL', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className={`field${errors.subject ? ' has-error' : ''}`} style={{ marginBottom: 14 }}>
              <label>Subject *</label>
              <input className="input" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} required />
              {errors.subject && <p className="field__error">{errors.subject}</p>}
            </div>
            <div className={`field${errors.description ? ' has-error' : ''}`} style={{ marginBottom: 18 }}>
              <label>Description *</label>
              <textarea className="textarea" rows={4} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} required />
              {errors.description && <p className="field__error">{errors.description}</p>}
            </div>
            <button type="submit" className={`btn btn--primary btn--block${submitting ? ' is-loading' : ''}`} disabled={submitting}><Icon name="check" /><span>Submit Request</span></button>
          </form>
        </article>
      </div>
    </>
  );
}
