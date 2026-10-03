'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';

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

const STATUS_LABEL = { waiting: 'Waiting', called: 'Called', in_consultation: 'In Consultation', completed: 'Completed', cancelled: 'Cancelled', skipped: 'Skipped' };
const time12 = (hhmm) => {
  if (!hhmm) return '—';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

export default function QueuePage() {
  const [date, setDate] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = useCallback(async (forDate) => {
    setLoading(true);
    try {
      const data = await api(`/api/doctor/queue${forDate ? `?date=${forDate}` : ''}`);
      setDate(data.date);
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onDateChange(value) {
    setDate(value);
    load(value);
  }

  const current = items.find((t) => t.status === 'in_consultation') || items.find((t) => t.status === 'called');
  const waiting = items.filter((t) => t.status === 'waiting').sort((a, b) => a.number - b.number);
  const rest = items.filter((t) => t !== current).sort((a, b) => a.number - b.number);

  async function act(action, id, extra) {
    setActing(id || 'call-next');
    try {
      const res = await api(action === 'call-next' ? '/api/doctor/queue/call-next' : `/api/doctor/queue/${id}/${action}`, { method: 'POST', body: extra });
      toast(res.message, 'success');
      load(date);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setActing(null);
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Today&apos;s Patient Queue</h1>
          <p>{date} · Manage your own queue, one patient at a time.</p>
        </div>
        <div className="page-head__actions">
          <input className="input" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} style={{ maxWidth: 180 }} />
        </div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 180, marginBottom: 24 }}></div> : (
        <article className="card" style={{ marginBottom: 24, padding: 28 }}>
          {!current ? (
            <div className="empty" style={{ padding: '10px 0' }}>
              <div className="empty__icon"><Icon name="activity" /></div>
              <h3>No patient in the chair right now</h3>
              <p>{waiting.length > 0 ? `${waiting.length} patient${waiting.length === 1 ? '' : 's'} waiting.` : 'Nobody is waiting yet.'}</p>
              {waiting.length > 0 && (
                <button type="button" className={`btn btn--primary btn--lg${acting === 'call-next' ? ' is-loading' : ''}`} disabled={!!acting} onClick={() => act('call-next', null, { date })} style={{ marginTop: 14 }}>
                  <Icon name="phone" /><span>Call Next Patient</span>
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase' }}>Current Token</div>
                <div style={{ fontSize: 56, fontWeight: 800, color: 'var(--teal-600)', lineHeight: 1 }}>{current.code}</div>
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{current.patientName}</div>
                <div className="text-muted" style={{ marginTop: 4 }}>{time12(current.time)} · <span className={`badge badge--${current.status}`}>{STATUS_LABEL[current.status]}</span></div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {current.status === 'called' && (
                  <button type="button" className={`btn btn--primary btn--lg${acting === current.id ? ' is-loading' : ''}`} disabled={!!acting} onClick={() => act('start', current.id)}>
                    <Icon name="stethoscope" /><span>Start Consultation</span>
                  </button>
                )}
                {current.status === 'in_consultation' && (
                  <button type="button" className={`btn btn--primary btn--lg${acting === current.id ? ' is-loading' : ''}`} disabled={!!acting} onClick={() => act('complete', current.id)}>
                    <Icon name="check-circle" /><span>Complete Consultation</span>
                  </button>
                )}
                {waiting.length > 0 && (
                  <button type="button" className={`btn btn--outline btn--lg${acting === 'call-next' ? ' is-loading' : ''}`} disabled={!!acting} onClick={() => act('call-next', null, { date })}>
                    <Icon name="phone" /><span>Call Next</span>
                  </button>
                )}
                <button type="button" className="btn btn--ghost btn--lg" disabled={!!acting} onClick={() => act('skip', current.id)}>
                  <Icon name="chevron-right" /><span>Skip</span>
                </button>
              </div>
            </div>
          )}
        </article>
      )}

      <article className="card card--flush">
        <div className="card__head"><h2 className="card__title"><Icon name="activity" />Queue</h2></div>
        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>Token</th><th>Patient</th><th>Appointment Time</th><th>Status</th><th className="col-actions">Action</th></tr></thead>
            <tbody>
              {!loading && rest.length === 0 && (
                <tr><td colSpan={5} style={{ whiteSpace: 'normal' }}><p className="text-muted" style={{ padding: 16 }}>No other tokens for this date.</p></td></tr>
              )}
              {rest.map((t) => (
                <tr key={t.id}>
                  <td data-label="Token" className="cell-primary mono">{t.code}</td>
                  <td data-label="Patient">{t.patientName}</td>
                  <td data-label="Time" className="mono">{time12(t.time)}</td>
                  <td data-label="Status"><span className={`badge badge--${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {(t.status === 'skipped' || t.status === 'waiting') && !current && (
                        <button type="button" className="action-btn" disabled={!!acting} onClick={() => act('recall', t.id)}><Icon name="phone" />Call</button>
                      )}
                      {t.status === 'skipped' && (
                        <button type="button" className="action-btn" disabled={!!acting} onClick={() => act('recall', t.id)}><Icon name="refresh" />Recall</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>{summary.total || 0} total · {summary.waiting || 0} waiting · {summary.completed || 0} completed · {summary.skipped || 0} skipped</span>
        </div>
      </article>
    </>
  );
}
