'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../Icon';
import usePermissions from './usePermissions';

// Hospital-level control of emergency walk-ins: pause or resume intake (with a reason) and the escalation / referral instructions
// the front desk reads when intake is paused, a doctor is unavailable or the walk-in workload is high.
// There is no count to configure: registration is never refused because of a number. The workload warning level is a system
// setting (Settings > General, `emergency_walkin_warning_threshold`, default 10) and nothing has to be set for walk-ins to work.
// Changing this card needs hospitals.manage (Super Admin and Operations), checked by the API.
// GET/PUT /api/admin/hospitals/:id/emergency-intake.
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

export default function EmergencyIntakeCard({ hospitalId }) {
  const can = usePermissions();
  const manage = can('hospitals.manage');
  const [intake, setIntake] = useState(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const { intake: i } = await api(`/api/admin/hospitals/${hospitalId}/emergency-intake`);
      setIntake(i);
      setNote(i.referralNote || '');
    } catch (err) {
      toast(err.message, 'error');
    }
  }, [hospitalId]);

  useEffect(() => { load(); }, [load]);

  async function save(body, which) {
    setBusy(which);
    setErrors({});
    try {
      const res = await api(`/api/admin/hospitals/${hospitalId}/emergency-intake`, { method: 'PUT', body });
      setIntake(res.intake);
      setNote(res.intake.referralNote || '');
      if ('paused' in body) setReason('');
      toast(res.message, 'success');
    } catch (err) {
      setErrors(err.fields || { _: err.message });
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  if (!intake) return <article className="card"><div className="card__head"><h2 className="card__title"><Icon name="alert" />Emergency walk-ins</h2></div><div className="skeleton skeleton--row"></div></article>;
  const paused = intake.status === 'PAUSED';

  return (
    <article className="card" id="emergency-walkins">
      <div className="card__head">
        <div>
          <h2 className="card__title"><Icon name="alert" />Emergency walk-ins</h2>
          <p className="card__subtitle">Patients registered at the front desk without a slot. Nothing needs to be set here for them to work; pause intake only when the hospital cannot safely take more.</p>
        </div>
        <span className={`badge badge--${paused ? 'cancelled' : 'confirmed'}`}>{paused ? 'Paused' : 'Open'}</span>
      </div>

      {paused && (
        <div className="alert alert--error" style={{ marginBottom: 14, alignItems: 'flex-start' }}><Icon name="alert" />
          <span>New emergency walk-ins are refused{intake.reason ? `: ${intake.reason}` : ''}. The front desk is shown the instructions below.</span>
        </div>
      )}

      <p className="field__hint" style={{ marginBottom: 14 }}>
        The front desk sees a workload warning when {intake.warningThreshold} or more walk-ins are active. It is only a warning and never stops a registration.
        {can('settings.view') && <> The warning level is a system setting (Settings &gt; General).</>}
      </p>

      <div className={`field field--full${errors.referralNote ? ' has-error' : ''}`}>
        <label htmlFor="ei-note">Escalation and referral instructions</label>
        <textarea className="input" id="ei-note" rows={2} maxLength={500} value={note} disabled={!manage} placeholder="Who to call and where to send a patient when intake is paused, a doctor is unavailable or the workload is high" style={{ height: 'auto', paddingTop: 8 }} onChange={(e) => setNote(e.target.value)} />
        {errors.referralNote && <p className="field__error">{errors.referralNote}</p>}
      </div>
      {manage && (
        <div className="form-actions" style={{ marginTop: 12 }}>
          <button type="button" className={`btn btn--primary${busy === 'settings' ? ' is-loading' : ''}`} disabled={!!busy || note.trim() === (intake.referralNote || '')} onClick={() => save({ referralNote: note }, 'settings')}>
            <Icon name="check" />Save instructions
          </button>
        </div>
      )}

      {manage && (
        <>
          <div className="divider"></div>
          <div className={`field field--full${errors.reason ? ' has-error' : ''}`}>
            <label htmlFor="ei-reason">{paused ? 'Why is intake being resumed?' : 'Why is intake being paused?'} <span className="req">*</span></label>
            <input className="input" id="ei-reason" value={reason} maxLength={300} placeholder="3 to 300 characters. Recorded with your name and the time." onChange={(e) => setReason(e.target.value)} />
            {errors.reason && <p className="field__error">{errors.reason}</p>}
          </div>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button type="button" className={`btn ${paused ? 'btn--primary' : 'btn--danger'}${busy === 'toggle' ? ' is-loading' : ''}`} disabled={!!busy || reason.trim().length < 3} onClick={() => save({ paused: !paused, reason }, 'toggle')}>
              <Icon name={paused ? 'check' : 'alert'} />{paused ? 'Resume emergency walk-ins' : 'Pause emergency walk-ins'}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
