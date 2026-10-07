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

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const time12 = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
};

function AddModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({ dayOfWeek: '1', startTime: '09:00', endTime: '13:00', slotMinutes: '15', capacityPerSlot: '1' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  if (!open) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/doctor/schedule', { method: 'POST', body: { ...form, dayOfWeek: Number(form.dayOfWeek), slotMinutes: Number(form.slotMinutes), capacityPerSlot: Number(form.capacityPerSlot) } });
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
            <div className="modal__icon tone-teal"><Icon name="clock" /></div>
            <div><h2>Add Working Hours</h2></div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
          </div>
          <div className="modal__body">
            <div className="form-grid">
              <div className="field field--full">
                <label>Day</label>
                <select className="select" value={form.dayOfWeek} onChange={set('dayOfWeek')}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </div>
              <div className={`field${errors.startTime ? ' has-error' : ''}`}><label>Start Time</label><input className="input" type="time" value={form.startTime} onChange={set('startTime')} required /></div>
              <div className={`field${errors.endTime ? ' has-error' : ''}`}><label>End Time</label><input className="input" type="time" value={form.endTime} onChange={set('endTime')} required />{errors.endTime && <p className="field__error">{errors.endTime}</p>}</div>
              <div className="field field--full">
                <label>Appointment duration (minutes)</label>
                <select className="select" value={form.slotMinutes} onChange={set('slotMinutes')}>
                  {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} minutes</option>)}
                </select>
              </div>
              <div className={`field field--full${errors.capacityPerSlot ? ' has-error' : ''}`}>
                <label>Patients per slot</label>
                <input className="input" type="number" min="1" max="50" value={form.capacityPerSlot} onChange={set('capacityPerSlot')} required />
                {errors.capacityPerSlot && <p className="field__error">{errors.capacityPerSlot}</p>}
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Tip: for a lunch break, add two separate blocks for the same day (e.g. 09:00–13:00 and 16:00–19:00).</p>
          </div>
          <div className="modal__foot">
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="check" /><span>Save Schedule</span></button>
          </div>
        </form>
      </div>
    </div>
  );
}

function LeavesCard() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ startDate: '', endDate: '', reason: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setItems((await api('/api/doctor/leaves')).items); } catch (err) { toast(err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function add(e) {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const res = await api('/api/doctor/leaves', { method: 'POST', body: form });
      toast(res.message, 'success');
      setForm({ startDate: '', endDate: '', reason: '' });
      load();
    } catch (err) {
      setErrors(err.fields || {});
      if (!err.fields) toast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    try { toast((await api(`/api/doctor/leaves/${id}`, { method: 'DELETE' })).message, 'success'); load(); } catch (err) { toast(err.message, 'error'); }
  }

  return (
    <article className="card" style={{ marginTop: 24 }}>
      <div className="card__head"><h2 className="card__title"><Icon name="calendar-x" />My Leaves</h2></div>
      <form onSubmit={add} className="action-group" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 }}>
        <div className={`field${errors.startDate ? ' has-error' : ''}`}><label>From</label><input className="input" type="date" value={form.startDate} onChange={set('startDate')} required />{errors.startDate && <p className="field__error">{errors.startDate}</p>}</div>
        <div className={`field${errors.endDate ? ' has-error' : ''}`}><label>To</label><input className="input" type="date" value={form.endDate} onChange={set('endDate')} required />{errors.endDate && <p className="field__error">{errors.endDate}</p>}</div>
        <div className={`field${errors.reason ? ' has-error' : ''}`}><label>Reason (optional)</label><input className="input" type="text" maxLength={200} value={form.reason} onChange={set('reason')} />{errors.reason && <p className="field__error">{errors.reason}</p>}</div>
        <button type="submit" className={`btn btn--primary${saving ? ' is-loading' : ''}`} disabled={saving}><Icon name="plus" /><span>Add Leave</span></button>
      </form>
      <div className="action-group" style={{ flexWrap: 'wrap', marginTop: 12 }}>
        {items.length === 0 && <span className="text-muted">No leaves added.</span>}
        {items.map((l) => (
          <span key={l.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {l.startDate} → {l.endDate}{l.reason && <span className="text-muted">({l.reason})</span>}
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove leave" onClick={() => remove(l.id)}><Icon name="x" /></button>
          </span>
        ))}
      </div>
    </article>
  );
}

export default function SchedulePage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api('/api/doctor/schedule');
      setItems(data.items);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(id) {
    try {
      const res = await api(`/api/doctor/schedule/${id}`, { method: 'DELETE' });
      toast(res.message, 'success');
      load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  const byDay = DAYS.map((label, i) => ({ label, blocks: items.filter((s) => s.dayOfWeek === i) }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Schedule</h1>
          <p>Your weekly working hours. Patients can only book during these windows.</p>
        </div>
        <div className="page-head__actions">
          <button type="button" className="btn btn--primary" onClick={() => setShowAdd(true)}><Icon name="plus" />Add Schedule</button>
        </div>
      </div>

      {loading ? <div className="skeleton" style={{ height: 300 }}></div> : (
        <div className="dash-stack">
          {byDay.map((d) => (
            <article className="card" key={d.label}>
              <div className="card__head"><h2 className="card__title">{d.label}</h2>{d.blocks.length === 0 && <span className="badge badge--neutral">OFF</span>}</div>
              {d.blocks.length > 0 && (
                <div className="action-group" style={{ flexWrap: 'wrap' }}>
                  {d.blocks.map((b) => (
                    <span key={b.id} className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      {time12(b.startTime)} – {time12(b.endTime)} <span className="text-muted">({b.slotMinutes} min slots · {b.capacityPerSlot} per slot)</span>
                      <button type="button" className="icon-btn icon-btn--sm" aria-label="Remove" onClick={() => remove(b.id)}><Icon name="x" /></button>
                    </span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      <LeavesCard />

      <AddModal open={showAdd} onClose={() => setShowAdd(false)} onCreated={load} />
    </>
  );
}
