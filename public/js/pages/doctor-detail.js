(function () {
  'use strict';
  const { $, esc, icon, api } = G;

  const id = $('[data-doctor-id]').dataset.doctorId;
  const form = $('#doctor-detail-form');
  const fields = $('[data-edit-fields]');
  const actions = $('[data-edit-actions]');
  const editBtn = $('[data-start-edit]');
  let doctor = null;

  function renderHero(d) {
    const added = G.date(d.createdAt);
    $('[data-doctor-hero]').innerHTML = `
      ${G.avatar(d.name, 'xl', d.photoUrl)}
      <div class="profile-hero__main">
        <h2>${esc(d.name)}</h2>
        <div class="profile-hero__meta">
          <span>${esc(d.specialization)}</span><span class="sep"></span>
          <span>${esc(d.id)}</span><span class="sep"></span>
          <span>Added ${esc(added)}</span>
        </div>
      </div>
      <div style="text-align:right">
        ${d.status === 'INACTIVE' ? `<span class="badge badge--cancelled" title="${esc(d.statusReason || '')}">Inactive</span>` : G.badge(d.availability)}
        <div style="margin-top:10px;font-size:22px;font-weight:800;color:var(--ink)">${G.money(d.fee)}</div>
        <div class="text-muted" style="font-size:12.5px">Appointment fee</div>
      </div>`;
    $('[data-doctor-kpis]').innerHTML = `
      <div class="kpi"><span>Today</span><strong>${d.stats.today}</strong></div>
      <div class="kpi"><span>Upcoming</span><strong>${d.stats.upcoming}</strong></div>
      <div class="kpi"><span>Completed</span><strong>${d.stats.completed}</strong></div>`;
    $('[data-crumb]').textContent = d.name;
    document.title = `${d.name} · Gmedic Receptionist Portal`;
  }

  function fillForm(d) {
    form.elements.name.value = d.name.replace(/^Dr\.?\s*/i, '');
    form.elements.specialization.value = d.specialization;
    form.elements.fee.value = d.fee;
    form.querySelector(`[name="availability"][value="${d.availability}"]`).checked = true;
  }

  function setEditing(on) {
    fields.disabled = !on;
    actions.hidden = !on;
    editBtn.hidden = on;
    $('[data-edit-hint]').textContent = on ? 'Update the details and click Save.' : "Click Edit to update this doctor's details.";
    if (on) form.elements.name.focus();
  }

  function renderSchedule(rows) {
    const tbody = $('[data-schedule-rows]');
    if (!rows.length) {
      tbody.innerHTML = G.emptyRow(3, 'No upcoming appointments', 'New bookings for this doctor will show here.', 'calendar');
      return;
    }
    tbody.innerHTML = rows.map((a) => `
      <tr class="is-clickable" data-appt="${esc(a.id)}" tabindex="0">
        <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(a.patientName, 'sm')}<span class="person__name">${esc(a.patientName)}</span></div></td>
        <td data-label="When">${esc(G.relativeDay(a.date))}<span class="cell-sub mono">${G.time(a.time)}</span></td>
        <td data-label="Status">${G.badge(a.status)}</td>
      </tr>`).join('');
  }

  // Why this doctor can't be booked yet.
  function renderNotices(d) {
    const out = [];
    if (d.status === 'INACTIVE') out.push(`${icon('alert')}<span>This doctor is deactivated and can't be booked.${d.statusReason ? ` Reason: ${esc(d.statusReason)}` : ''}</span>`);
    if (d.verificationStatus === 'REJECTED') out.push(`${icon('alert')}<span>Gmedic did not verify this doctor${d.verificationNote ? ` (${esc(d.verificationNote)})` : ''}, so they can't be booked. Contact Gmedic support.</span>`);
    else if (d.verificationStatus !== 'VERIFIED') out.push(`${icon('info')}<span><strong>Pending verification.</strong> Gmedic verifies a new doctor before patients and the front desk can book them. You can set up their working hours meanwhile.</span>`);
    if (d.workingBlocks === 0) out.push(`${icon('info')}<span><strong>No working hours yet.</strong> Add the weekly hours under Working hours so this doctor can take bookings.</span>`);
    if (d.onLeave) out.push(`${icon('info')}<span>On leave today: ${esc(d.leaveNote)}.</span>`);
    $('[data-doctor-notices]').innerHTML = out.map((h) => `<div class="alert alert--info" style="margin-bottom:12px">${h}</div>`).join('');
  }

  function renderLeaves(leaves) {
    const tbody = $('[data-leave-rows]');
    if (!leaves.length) { tbody.innerHTML = G.emptyRow(3, 'No leaves planned', 'The doctor adds leave from their own portal.', 'calendar'); return; }
    tbody.innerHTML = leaves.map((l) => `
      <tr${l.bookedAppointments ? ' class="is-attention"' : ''}>
        <td data-label="Dates" class="nowrap">${esc(G.date(l.startDate))}${l.endDate !== l.startDate ? ` – ${esc(G.date(l.endDate))}` : ''}</td>
        <td data-label="Reason" class="text-muted">${esc(l.reason || '—')}</td>
        <td data-label="Booked">${l.bookedAppointments ? `<a href="/appointments?doctorId=${encodeURIComponent(id)}&from=${esc(l.startDate)}&to=${esc(l.endDate)}">${l.bookedAppointments} appointment${l.bookedAppointments === 1 ? '' : 's'} to move</a>` : '<span class="text-muted">None</span>'}</td>
      </tr>`).join('');
  }

  async function load() {
    try {
      const data = await api(`/api/doctors/${encodeURIComponent(id)}`);
      doctor = data.doctor;
      renderNotices(doctor);
      renderLeaves(data.leaves || []);
      renderHero(doctor);
      renderStatusButton(doctor);
      renderLogin(doctor);
      fillForm(doctor);
      renderSchedule(data.schedule);
    } catch (err) {
      G.toast(err.message, 'error');
    }
  }

  /* ---------- Deactivate / reactivate (doctor left the hospital) ---------- */
  const statusBtn = $('[data-doctor-status]');
  const statusForm = $('#doctor-status-form');
  function renderStatusButton(d) {
    const inactive = d.status === 'INACTIVE';
    statusBtn.hidden = false;
    statusBtn.style.color = inactive ? '' : 'var(--red-600)';
    statusBtn.innerHTML = `${icon(inactive ? 'user-check' : 'user-x')}<span>${inactive ? 'Reactivate doctor' : 'Deactivate doctor'}</span>`;
  }
  statusBtn.addEventListener('click', async () => {
    if (!doctor) return;
    const inactive = doctor.status === 'INACTIVE';
    statusForm.reset();
    G.clearErrors(statusForm);
    $('[data-status-title]').textContent = `${inactive ? 'Reactivate' : 'Deactivate'} ${doctor.name}?`;
    $('[data-status-body]').textContent = inactive ? 'They can be booked again by patients and the front desk.' : 'They stop being bookable by patients and the front desk, and their portal login is locked. Their history is kept.';
    $('[data-status-fields]').hidden = inactive;
    const submit = $('[data-status-submit]');
    submit.className = `btn ${inactive ? 'btn--primary' : 'btn--danger'}`;
    submit.textContent = inactive ? 'Reactivate Doctor' : 'Deactivate Doctor';
    G.modal.open('doctor-status-modal');
    if (!inactive) {
      $('[data-status-impact]').textContent = 'Checking upcoming appointments…';
      try {
        const imp = await api(`/api/doctors/${encodeURIComponent(id)}/status`);
        $('[data-status-impact]').textContent = imp.upcomingAppointments
          ? `${imp.upcomingAppointments} upcoming appointment${imp.upcomingAppointments === 1 ? '' : 's'} (${G.date(imp.firstDate)}${imp.lastDate !== imp.firstDate ? ` to ${G.date(imp.lastDate)}` : ''}) will need to be rescheduled or cancelled from Appointments.`
          : 'No upcoming appointments are booked with this doctor.';
      } catch (_) { $('[data-status-impact]').textContent = 'Could not check upcoming appointments.'; }
    }
  });
  statusForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inactive = doctor.status === 'INACTIVE';
    const reason = statusForm.elements.reason.value.trim();
    if (!inactive && !reason) return G.showErrors(statusForm, { reason: 'Enter the reason for deactivating this doctor.' });
    const submit = $('[data-status-submit]');
    G.setLoading(submit, true);
    try {
      const res = await api(`/api/doctors/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status: inactive ? 'ACTIVE' : 'INACTIVE', reason } });
      G.modal.close('doctor-status-modal');
      G.toast(res.message, 'success');
      load();
    } catch (err) {
      G.showErrors(statusForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(submit, false);
    }
  });

  /* ---------- Doctor portal login (invite / new temporary password) ---------- */
  const loginBody = $('[data-login-body]');
  const loginForm = $('#doctor-login-form');
  function renderLogin(d) {
    const l = d.portalLogin;
    if (!l) {
      loginBody.innerHTML = d.status === 'INACTIVE'
        ? '<p class="text-muted" style="margin:0">No login. Reactivate the doctor to invite them.</p>'
        : `<p class="text-muted" style="margin:0 0 12px">Not invited yet. Invite the doctor so they can see their queue and add their own leave.</p>
           <button type="button" class="btn btn--primary btn--sm" data-login-invite>${icon('user-check')}<span>Invite to Portal</span></button>`;
      return;
    }
    const state = l.status === 'ACTIVE'
      ? (l.lastLoginAt ? '<span class="badge badge--present">Active</span>' : '<span class="badge badge--pending">Invited · not signed in yet</span>')
      : '<span class="badge badge--cancelled">Locked</span>';
    loginBody.innerHTML = `
      <dl class="kv">
        <div><dt>Sign in with</dt><dd class="mono">${esc(l.email)}</dd></div>
        <div><dt>Status</dt><dd>${state}</dd></div>
        <div><dt>Last sign-in</dt><dd>${l.lastLoginAt ? esc(G.date(l.lastLoginAt)) : '—'}</dd></div>
      </dl>
      ${l.status === 'ACTIVE' && !l.lastLoginAt ? `<button type="button" class="btn btn--ghost btn--sm" style="margin-top:12px" data-login-reset>${icon('lock')}<span>Re-issue invitation</span></button>`
        : l.status === 'ACTIVE' ? '<p class="text-muted" style="margin:12px 0 0;font-size:12.5px">Forgot their password? Gmedic support resets it, so only the doctor can sign in as themselves.</p>'
        : `<p class="text-muted" style="margin:12px 0 0;font-size:12.5px">${d.status === 'INACTIVE' ? 'Locked because the doctor is deactivated.' : 'This login is locked.'} Contact Gmedic support to unlock it.</p>`}`;
  }
  function showCreds(c) {
    $('[data-creds-login]').textContent = c.login;
    $('[data-creds-password]').textContent = c.tempPassword;
    G.modal.open('doctor-creds-modal');
  }
  loginBody.addEventListener('click', async (e) => {
    if (e.target.closest('[data-login-invite]')) {
      loginForm.reset();
      G.clearErrors(loginForm);
      G.modal.open('doctor-login-modal');
      loginForm.elements.email.focus();
      return;
    }
    const reset = e.target.closest('[data-login-reset]');
    if (!reset) return;
    const ok = await G.confirm({ title: `Re-issue ${doctor.name}'s invitation?`, body: 'A new temporary password replaces the one given before. Share it with the doctor; they must change it at first sign-in.', action: 'Re-issue Invitation' });
    if (!ok) return;
    G.setLoading(reset, true);
    try {
      const res = await api(`/api/doctors/${encodeURIComponent(id)}/login/reset-password`, { method: 'POST' });
      showCreds(res.credentials);
      load();
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(reset, false);
    }
  });
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = G.formValues(loginForm);
    if (!v.email.trim()) return G.showErrors(loginForm, { email: 'Enter the email the doctor will sign in with.' });
    const submit = $('[data-login-submit]');
    G.setLoading(submit, true);
    try {
      const res = await api(`/api/doctors/${encodeURIComponent(id)}/login`, { method: 'POST', body: { email: v.email.trim(), phone: v.phone.trim() } });
      G.modal.close('doctor-login-modal');
      G.toast(res.message, 'success');
      showCreds(res.credentials);
      load();
    } catch (err) {
      G.showErrors(loginForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(submit, false);
    }
  });

  editBtn.addEventListener('click', () => setEditing(true));
  $('[data-cancel-edit]').addEventListener('click', () => {
    G.clearErrors(form);
    fillForm(doctor);
    setEditing(false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = G.validateForm(form, {
      name: (v) => (/^[A-Za-z][A-Za-z .'-]*$/.test(v.trim()) ? '' : 'Name can only contain letters, spaces, dots and hyphens.'),
    });
    if (Object.keys(errors).length) return G.showErrors(form, errors);
    const v = G.formValues(form);
    // A new fee or specialist applies to bookings from now on: confirm it.
    const feeNow = Number(v.fee);
    if (feeNow !== doctor.fee || v.specialization !== doctor.specialization) {
      const parts = [];
      if (feeNow !== doctor.fee) parts.push(`the fee from ${G.money(doctor.fee)} to ${G.money(feeNow)}`);
      if (v.specialization !== doctor.specialization) parts.push(`the specialist from ${doctor.specialization} to ${v.specialization}`);
      const ok = await G.confirm({ title: `Change ${doctor.name}'s details?`, body: `This changes ${parts.join(' and ')}. Patients and the front desk see the new details straight away. Appointments already booked keep the fee they were booked at.`, action: 'Save Changes' });
      if (!ok) return;
    }
    const btn = form.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api(`/api/doctors/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: { name: v.name, specialization: v.specialization, fee: Number(v.fee), availability: v.availability },
      });
      doctor = res.doctor;
      renderHero(doctor);
      fillForm(doctor);
      setEditing(false);
      G.clearErrors(form);
      G.toast(res.message, 'success');
    } catch (err) {
      G.showErrors(form, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });

  const schedule = $('[data-schedule-rows]');
  const openRow = (row) => row && G.openAppointment(row.dataset.appt);
  schedule.addEventListener('click', (e) => openRow(e.target.closest('[data-appt]')));
  schedule.addEventListener('keydown', (e) => { if (e.key === 'Enter') openRow(e.target.closest('[data-appt]')); });
  document.addEventListener('appointments:changed', load);
  document.addEventListener('doctors:changed', load);

  load();
})();
