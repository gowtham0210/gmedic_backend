/* Appointment details modal: status update, cancel, reschedule, no-show and corrections.
   Fires `appointments:changed`. */
(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;
  const modal = $('#appointment-modal');
  if (!modal) return;

  const body = $('[data-appt-body]', modal);
  const statusSelect = $('[data-appt-status]', modal);
  const statusGroup = $('[data-appt-status-group]', modal);
  const saveBtn = $('[data-appt-save]', modal);
  const cancelBtn = $('[data-appt-cancel]', modal);
  const rescheduleBtn = $('[data-appt-reschedule]', modal);
  const collectBtn = $('[data-appt-collect]', modal);
  const noShowBtn = $('[data-appt-noshow]', modal);
  const editBtn = $('[data-appt-edit]', modal);
  const foot = $('.modal__foot', modal);
  const STATUS_LABEL = { confirmed: 'Confirmed', pending: 'Pending', completed: 'Completed' };
  let current = null;

  const statusBadge = (a) => (a.noShow ? G.badge('absent', 'No-show') : G.badge(a.status)) + (a.emergency ? ` ${G.badge('emergency', 'Emergency')}` : '');

  function paymentHtml(a) {
    const pay = a.payment;
    const paid = pay && pay.status === 'PAID';
    const rows = paid
      ? `<div><dt>Paid via</dt><dd>${esc(pay.method || '—')}</dd></div>
         <div><dt>Transaction ID</dt><dd class="mono">${esc(pay.transactionId)}</dd></div>
         <div><dt>Paid on</dt><dd>${esc(`${G.date(pay.paidAt)}, ${new Date(pay.paidAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)}</dd></div>`
      : `<div class="kv--full"><dt>Note</dt><dd style="font-weight:500;color:var(--muted)">${a.status === 'cancelled' ? 'Appointment cancelled: no payment due.' : `Consultation fee of ${G.money(a.fee)} to be paid at the hospital.`}</dd></div>`;
    // App bookings: the booking token paid online is Gmedic's and separate from the consultation fee.
    const token = a.bookingToken
      ? `<div class="kv--full"><dt>Booking token</dt><dd>${esc(G.money(a.bookingToken.amount))} paid in the Gmedic app (non-refundable, not part of the fee)</dd></div>`
      : '';
    const refunds = (a.refunds || []).length
      ? `<div class="kv--full"><dt>Refunds</dt><dd>${a.refunds.map((r) => esc(`${r.id}: ${G.money(r.amount)} · ${r.status.toLowerCase()}`)).join('<br>')}</dd></div>`
      : '';
    return `<dl class="kv"><div><dt>Consultation fee</dt><dd>${G.badge(a.paymentStatus)}</dd></div>${rows}${token}${refunds}</dl>`;
  }

  function render(a) {
    editing = false;
    const who = [a.source ? `via ${a.source}` : '', a.bookedBy ? `by ${a.bookedBy}` : ''].filter(Boolean).join(' ');
    body.innerHTML = `
      <div class="person" style="margin-bottom:20px">
        ${G.avatar(a.patientName, 'lg')}
        <div>
          <div class="person__name" style="font-size:17px">${esc(a.patientName)}</div>
          <small>Appointment ${esc(a.id)} · Booked ${esc(G.timeAgo(a.createdAt).toLowerCase())} ${esc(who)}</small>
        </div>
      </div>
      <dl class="kv">
        <div><dt>Doctor</dt><dd>${esc(a.doctorName)}</dd></div>
        <div><dt>Specialist</dt><dd>${esc(a.specialization)}</dd></div>
        <div><dt>Date</dt><dd>${esc(G.date(a.date, { weekday: true }))}${a.rescheduleCount ? ` <span class="text-muted">(rescheduled${a.rescheduleCount > 1 ? ` ${a.rescheduleCount}×` : ''})</span>` : ''}</dd></div>
        <div><dt>Time</dt><dd>${G.time(a.time)}</dd></div>
        <div><dt>Appointment status</dt><dd>${statusBadge(a)}</dd></div>
        <div><dt>Appointment fee</dt><dd>${G.money(a.fee)}</dd></div>
      </dl>
      <div class="divider"></div>
      <dl class="kv">
        <div><dt>Patient mobile</dt><dd class="mono">${a.patientMobile ? esc(a.patientMobile) : '<span class="text-muted">None on file</span>'}</dd></div>
        <div><dt>Gender · date of birth</dt><dd>${esc([a.patientGender ? G.label(a.patientGender.toLowerCase()) : '', a.patientDateOfBirth ? G.date(a.patientDateOfBirth) : ''].filter(Boolean).join(' · ') || '—')}</dd></div>
        <div class="kv--full"><dt>Reason for visit</dt><dd>${a.reason ? esc(a.reason) : '<span class="text-muted">Not given</span>'}</dd></div>
      </dl>
      <div class="divider"></div>
      ${paymentHtml(a)}
      ${a.status === 'cancelled' && a.cancelReason ? `<p class="note">${icon('info')}<span>Cancelled: ${esc(a.cancelReason)}</span></p>` : ''}
      ${a.noShow ? `<p class="note">${icon('info')}<span>Marked as a no-show. The patient did not come, so nothing is refunded and the queue token was cancelled.</span></p>` : ''}`;

    // What may still be done. Completed and cancelled are final (the queue token follows them).
    const final = a.status === 'cancelled' || a.status === 'completed';
    const today = G.todayISO();
    cancelBtn.hidden = final || a.noShow;
    // The fee of an appointment nobody has paid yet can be taken at the desk.
    collectBtn.hidden = !(a.paymentStatus === 'pending' && a.status !== 'cancelled');
    rescheduleBtn.hidden = final || a.noShow;
    editBtn.hidden = a.status === 'cancelled';
    // A no-show is marked on the day, and can be undone on the day.
    const canMark = !final && !a.noShow && a.status === 'confirmed' && a.date === today;
    const canUndo = a.noShow && a.date === today;
    noShowBtn.hidden = !(canMark || canUndo);
    noShowBtn.querySelector('span').textContent = a.noShow ? 'Undo no-show' : 'No-show';
    // The status list offers only the moves the server accepts.
    const options = a.nextStatuses || [];
    statusGroup.hidden = !options.length;
    statusSelect.innerHTML = [a.status, ...options].map((s) => `<option value="${esc(s)}">${esc(STATUS_LABEL[s] || s)}</option>`).join('');
    statusSelect.value = a.status;
    saveBtn.disabled = true;
    foot.hidden = [cancelBtn, rescheduleBtn, editBtn, noShowBtn, collectBtn].every((b) => b.hidden) && statusGroup.hidden;
  }

  let editing = false;
  function renderEdit(a) {
    editing = true;
    foot.hidden = true;
    const p = a.patientEditable;
    body.innerHTML = `
      <form data-edit-form novalidate>
        <div class="alert alert--error" hidden data-form-alert style="margin-bottom:16px">${icon('alert')}<span></span></div>
        ${p ? '' : `<p class="note" style="margin-bottom:14px">${icon('info')}<span>${a.patientSharedWithOtherHospitals ? `${esc(a.patientName)} also visits other hospitals, so only the reason for visit can be corrected here.` : `${esc(a.patientName)} has a Gmedic app account, so only the reason for visit can be corrected here. Their own details are theirs to change in the app.`}</span></p>`}
        <div class="form-grid">
          ${p ? `
          <div class="field"><label for="e-name">Patient name</label><input class="input" id="e-name" name="name" maxlength="80" value="${esc(a.patientName)}" /><p class="field__error" data-error-for="patient.name"></p></div>
          <div class="field"><label for="e-mobile">Mobile</label><input class="input" id="e-mobile" name="mobile" type="tel" inputmode="numeric" maxlength="14" value="${esc(a.patientMobile || '')}" /><p class="field__error" data-error-for="patient.mobile"></p></div>
          <div class="field"><label for="e-gender">Gender</label><select class="select" id="e-gender" name="gender"><option value="">Not given</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select><p class="field__error" data-error-for="patient.gender"></p></div>
          <div class="field"><label for="e-dob">Date of birth</label><input class="input" id="e-dob" name="dateOfBirth" type="date" max="${esc(G.todayISO())}" value="${esc(a.patientDateOfBirth || '')}" /><p class="field__error" data-error-for="patient.dateOfBirth"></p></div>` : ''}
          <div class="field field--full"><label for="e-reason">Reason for visit</label><input class="input" id="e-reason" name="reason" maxlength="300" value="${esc(a.reason || '')}" /></div>
        </div>
        <div class="action-group" style="margin-top:16px">
          <button type="submit" class="btn btn--primary" data-edit-save>${icon('check')}<span>Save</span></button>
          <button type="button" class="btn btn--ghost" data-edit-cancel>Cancel</button>
        </div>
      </form>`;
    const form = $('[data-edit-form]', body);
    if (p && a.patientGender) form.elements.gender.value = a.patientGender.toLowerCase();
    form.elements.reason.focus();
    $('[data-edit-cancel]', form).addEventListener('click', () => render(current));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('[data-edit-save]', form);
      G.clearErrors(form);
      G.setLoading(btn, true);
      try {
        const payload = { reason: form.elements.reason.value };
        if (p) payload.patient = { name: form.elements.name.value, mobile: form.elements.mobile.value, gender: form.elements.gender.value, dateOfBirth: form.elements.dateOfBirth.value };
        const res = await api(`/api/appointments/${encodeURIComponent(current.id)}`, { method: 'PATCH', body: payload });
        current = res.appointment;
        render(current);
        G.toast(res.message, 'success');
        if (res.message !== 'No changes to save.') document.dispatchEvent(new CustomEvent('appointments:changed'));
      } catch (err) {
        G.showErrors(form, err.fields || {}, err.message);
      } finally {
        G.setLoading(btn, false);
      }
    });
  }

  G.openAppointment = async function (id) {
    current = null;
    editing = false;
    body.innerHTML = '<div class="skeleton skeleton--row"></div>'.repeat(3);
    statusSelect.disabled = true;
    saveBtn.disabled = true;
    [cancelBtn, rescheduleBtn, noShowBtn, editBtn, collectBtn].forEach((b) => { b.hidden = true; });
    statusGroup.hidden = false;
    foot.hidden = false;
    G.modal.open('appointment-modal');
    try {
      const { appointment } = await api(`/api/appointments/${encodeURIComponent(id)}`);
      current = appointment;
      statusSelect.disabled = false;
      render(appointment);
    } catch (err) {
      body.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  };

  statusSelect.addEventListener('change', () => {
    saveBtn.disabled = !current || statusSelect.value === current.status;
  });

  saveBtn.addEventListener('click', async () => {
    if (!current) return;
    G.setLoading(saveBtn, true);
    try {
      const res = await api(`/api/appointments/${encodeURIComponent(current.id)}/status`, { method: 'PATCH', body: { status: statusSelect.value } });
      current = res.appointment;
      render(current);
      G.toast(`Appointment for ${current.patientName} marked as ${G.label(current.status)}.`, 'success');
      document.dispatchEvent(new CustomEvent('appointments:changed'));
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(saveBtn, false);
      saveBtn.disabled = !current || statusSelect.value === current.status;
    }
  });

  editBtn.addEventListener('click', () => { if (current) renderEdit(current); });
  collectBtn.addEventListener('click', () => { if (current && G.collectPayment) G.collectPayment(current); });
  // After a payment is recorded the open details are stale: reload them.
  document.addEventListener('payments:changed', () => { if (current && !modal.hidden) G.openAppointment(current.id); });

  /* ---------- No-show (same day, reversible) ---------- */
  noShowBtn.addEventListener('click', async () => {
    if (!current) return;
    const undo = current.noShow;
    G.setLoading(noShowBtn, true);
    try {
      const res = await api(`/api/appointments/${encodeURIComponent(current.id)}/no-show`, { method: undo ? 'DELETE' : 'POST' });
      current = res.appointment;
      render(current);
      G.toast(res.message, 'success');
      document.dispatchEvent(new CustomEvent('appointments:changed'));
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(noShowBtn, false);
    }
  });

  /* ---------- Reschedule (same doctor: new date and slot) ---------- */
  const reschedModal = $('#appointment-reschedule-modal');
  const reschedForm = $('#appointment-reschedule-form');
  const reschedGrid = $('[data-resched-grid]', reschedForm);
  const reschedSummary = $('[data-resched-summary]', reschedForm);
  const reschedSubmit = $('[data-resched-submit]', reschedForm);
  let reschedPicked = '';
  let reschedController = null;

  async function loadReschedSlots() {
    const date = reschedForm.elements.date.value;
    reschedPicked = '';
    reschedSubmit.disabled = true;
    if (!date || !current) { reschedGrid.innerHTML = ''; reschedSummary.textContent = 'Choose a date to see free slots.'; return; }
    if (reschedController) reschedController.abort();
    reschedController = new AbortController();
    reschedGrid.innerHTML = '<div class="skeleton skeleton--row"></div>';
    try {
      const data = await api(`/api/doctors/${encodeURIComponent(current.doctorId)}/slots?date=${encodeURIComponent(date)}`, { signal: reschedController.signal });
      const open = data.slots.filter((s) => s.status === 'available' && !(date === current.date && s.time === current.time));
      reschedSummary.textContent = data.closedReason || (!data.slots.length ? 'The doctor has no working hours on this day.' : open.length ? `${open.length} slot${open.length === 1 ? '' : 's'} open` : 'Every slot is full or closed for this day.');
      reschedGrid.innerHTML = data.slots.map((s) => {
        const mine = date === current.date && s.time === current.time;
        const disabled = s.status !== 'available' || mine;
        return `<button type="button" role="radio" class="slot${disabled ? ' is-full' : ''}" data-slot="${esc(s.time)}" aria-checked="false" ${disabled ? 'disabled aria-disabled="true"' : ''}>
            <span class="slot__time">${G.time(s.time)}</span><span class="slot__seats">${mine ? 'Current' : s.status === 'available' ? `${s.seatsLeft} of ${s.capacity} left` : s.status === 'full' ? 'Full' : 'Closed'}</span></button>`;
      }).join('');
    } catch (err) {
      if (err.name === 'AbortError') return;
      reschedGrid.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  }

  rescheduleBtn.addEventListener('click', () => {
    if (!current) return;
    reschedForm.reset();
    G.clearErrors(reschedForm);
    $('[data-resched-sub]', reschedForm).textContent = `${current.patientName} · ${current.doctorName} · now ${G.date(current.date)}, ${G.time(current.time)}`;
    reschedForm.elements.date.min = G.todayISO();
    reschedForm.elements.date.value = current.date >= G.todayISO() ? current.date : G.todayISO();
    G.modal.open('appointment-reschedule-modal');
    loadReschedSlots();
  });
  reschedForm.elements.date.addEventListener('change', loadReschedSlots);
  reschedGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-slot]');
    if (!btn || btn.disabled) return;
    reschedPicked = btn.dataset.slot;
    $$('[data-slot]', reschedGrid).forEach((b) => { const on = b === btn; b.classList.toggle('is-selected', on); b.setAttribute('aria-checked', String(on)); });
    reschedSubmit.disabled = false;
    const err = $('[data-error-for="time"]', reschedForm);
    if (err) err.textContent = '';
  });
  reschedForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current || !reschedPicked) return G.showErrors(reschedForm, { time: 'Choose a free slot.' });
    G.clearErrors(reschedForm);
    G.setLoading(reschedSubmit, true);
    try {
      const res = await api(`/api/appointments/${encodeURIComponent(current.id)}/reschedule`, { method: 'POST', body: { date: reschedForm.elements.date.value, time: reschedPicked } });
      current = res.appointment;
      render(current);
      G.modal.close(reschedModal);
      G.toast(res.message, 'success');
      document.dispatchEvent(new CustomEvent('appointments:changed'));
    } catch (err) {
      if (err.status === 409) loadReschedSlots();
      G.showErrors(reschedForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(reschedSubmit, false);
      reschedSubmit.disabled = !reschedPicked;
    }
  });

  /* ---------- Cancel (own dialog: reason, refund, token, notices) ---------- */
  const cancelModal = $('#appointment-cancel-modal');
  const cancelForm = $('#appointment-cancel-form');
  const quoteBox = $('[data-cancel-quote]', cancelForm);
  const cancelSubmit = $('[data-cancel-submit]', cancelForm);

  function quoteHtml(q) {
    if (q.blocker) return `<div class="alert alert--error">${icon('alert')}<span>${esc(q.blocker)}</span></div>`;
    const refund = G.money(q.refundPaise / 100);
    const text = !q.paidPaise ? 'No payment was taken, so there is nothing to refund.'
      : q.refundPaise ? `${refund} will be refunded to the patient. ${q.note}`
        : `No refund. ${q.note}`;
    return `<dl class="kv"><div class="kv--full"><dt>Refund</dt><dd>${esc(text)}</dd></div></dl>`;
  }

  cancelBtn.addEventListener('click', async () => {
    if (!current) return;
    const target = current;
    cancelForm.reset();
    G.clearErrors(cancelForm);
    $('[data-cancel-sub]', cancelForm).textContent = `${target.patientName} · ${G.date(target.date)}, ${G.time(target.time)}`;
    quoteBox.innerHTML = '<div class="skeleton skeleton--row"></div>';
    cancelSubmit.disabled = true;
    G.modal.open('appointment-cancel-modal');
    try {
      const { quote } = await api(`/api/appointments/${encodeURIComponent(target.id)}/cancel`);
      if (current !== target) return;
      quoteBox.innerHTML = quoteHtml(quote);
      cancelSubmit.disabled = Boolean(quote.blocker);
    } catch (err) {
      quoteBox.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  });

  cancelForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!current || cancelSubmit.disabled) return;
    const reason = cancelForm.elements.reason.value.trim();
    if (!reason) return G.showErrors(cancelForm, { reason: 'Enter the reason for cancelling.' });
    G.setLoading(cancelSubmit, true);
    try {
      const res = await api(`/api/appointments/${encodeURIComponent(current.id)}/cancel`, { method: 'POST', body: { reason } });
      current = res.appointment;
      render(current);
      G.modal.close(cancelModal);
      G.toast(res.message, 'success');
      document.dispatchEvent(new CustomEvent('appointments:changed'));
    } catch (err) {
      G.showErrors(cancelForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(cancelSubmit, false);
    }
  });
})();
