'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import { formatTime, usePrefs } from '../../../lib/doctorPrefs';

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
const time12 = formatTime; // honours the 12/24-hour preference (lib/doctorPrefs)

export default function QueuePage() {
  usePrefs(); // re-renders once the saved time format is known
  const [date, setDate] = useState('');
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({});
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [editable, setEditable] = useState(true);
  const [today, setToday] = useState('');
  // The consultation just completed, while it can still be undone: { id, code, until }.
  const [undo, setUndo] = useState(null);

  const load = useCallback(async (forDate) => {
    setLoading(true);
    try {
      const data = await api(`/api/doctor/queue${forDate ? `?date=${forDate}` : ''}`);
      setDate(data.date);
      setEditable(data.editable !== false);
      setToday(data.today || data.date);
      setItems(data.items);
      setSummary(data.summary);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(date); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The undo offer disappears when its window closes.
  useEffect(() => {
    if (!undo) return undefined;
    const t = setTimeout(() => setUndo(null), Math.max(0, undo.until - Date.now()));
    return () => clearTimeout(t);
  }, [undo]);

  function onDateChange(value) {
    setDate(value);
    load(value);
  }

  const current = items.find((t) => t.status === 'in_consultation') || items.find((t) => t.status === 'called');
  // Emergency walk-ins first, then by token (the same order as bookingCore.queueOrder on the server).
  const byQueue = (a, b) => (Number(!!b.emergency) - Number(!!a.emergency)) || (a.number - b.number);
  const waiting = items.filter((t) => t.status === 'waiting').sort(byQueue);
  const rest = items.filter((t) => t !== current).sort(byQueue);

  async function act(action, id, extra) {
    setActing(id || 'call-next');
    try {
      const res = await api(action === 'call-next' ? '/api/doctor/queue/call-next' : `/api/doctor/queue/${id}/${action}`, { method: 'POST', body: extra });
      toast(res.message, 'success');
      if (action === 'complete' && res.undoMinutes) setUndo({ id, code: res.token.code, until: Date.now() + res.undoMinutes * 60000 });
      if (action === 'reopen') setUndo(null);
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
          <h1>{editable ? 'Today\u2019s Patient Queue' : 'Patient Queue'}</h1>
          <p>{date} · {editable ? 'Manage your own queue, one patient at a time.' : 'Read-only: only today\u2019s queue can be changed.'}</p>
        </div>
        <div className="page-head__actions">
          <input className="input" type="date" value={date} onChange={(e) => onDateChange(e.target.value)} style={{ maxWidth: 180 }} />
        </div>
      </div>

      {!editable && !loading && (
        <div className="alert alert--info" style={{ marginBottom: 16 }}><Icon name="info" />
          <span>You are viewing {date}. Past and future queues are read-only. <button type="button" className="btn btn--ghost btn--sm" style={{ marginLeft: 8 }} onClick={() => onDateChange(today)}>Back to today</button></span>
        </div>
      )}
      {undo && editable && (
        <div className="alert alert--success" style={{ marginBottom: 16, alignItems: 'center' }}><Icon name="check-circle" />
          <span style={{ flex: 1 }}>{undo.code} completed. Pressed by mistake? You can undo this for a few minutes.</span>
          <button type="button" className={`btn btn--ghost btn--sm${acting === undo.id ? ' is-loading' : ''}`} disabled={!!acting} onClick={() => act('reopen', undo.id)}><Icon name="refresh" />Undo</button>
        </div>
      )}

      {loading ? <div className="skeleton" style={{ height: 180, marginBottom: 24 }}></div> : (
        <article className="card" style={{ marginBottom: 24, padding: 28 }}>
          {!current ? (
            <div className="empty" style={{ padding: '10px 0' }}>
              <div className="empty__icon"><Icon name="activity" /></div>
              <h3>No patient in the chair right now</h3>
              <p>{waiting.length > 0 ? `${waiting.length} patient${waiting.length === 1 ? '' : 's'} waiting.` : 'Nobody is waiting yet.'}</p>
              {waiting.length > 0 && editable && (
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
                <div className="text-muted" style={{ marginTop: 4 }}>{time12(current.time)} · <span className={`badge badge--${current.status}`}>{STATUS_LABEL[current.status]}</span>{current.emergency && <> <span className="badge badge--emergency">Emergency</span></>}</div>
              </div>
              {editable && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
                {/* A patient already in consultation can't be skipped (models/tokenModel.js TRANSITIONS). */}
                {current.status === 'called' && (
                  <button type="button" className="btn btn--ghost btn--lg" disabled={!!acting} onClick={() => act('skip', current.id)}>
                    <Icon name="chevron-right" /><span>Skip</span>
                  </button>
                )}
              </div>}
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
                  <td data-label="Token" className="cell-primary mono">{t.code}{t.emergency && <> <span className="badge badge--emergency">Emergency</span></>}</td>
                  <td data-label="Patient">{t.patientName}</td>
                  <td data-label="Time" className="mono">{time12(t.time)}</td>
                  <td data-label="Status"><span className={`badge badge--${t.status}`}>{STATUS_LABEL[t.status]}</span></td>
                  <td className="col-actions">
                    <div className="action-group">
                      {editable && t.status === 'waiting' && !current && (
                        <button type="button" className="action-btn" disabled={!!acting} onClick={() => act('recall', t.id)}><Icon name="phone" />Call</button>
                      )}
                      {editable && t.status === 'skipped' && !current && (
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
