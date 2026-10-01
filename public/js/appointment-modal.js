/* Appointment details modal with status update. Fires `appointments:changed`. */
(function () {
  'use strict';
  const { $, esc, icon, api } = G;
  const modal = $('#appointment-modal');
  if (!modal) return;

  const body = $('[data-appt-body]', modal);
  const statusSelect = $('[data-appt-status]', modal);
  const saveBtn = $('[data-appt-save]', modal);
  let current = null;

  function render(a) {
    const pay = a.payment;
    body.innerHTML = `
      <div class="person" style="margin-bottom:20px">
        ${G.avatar(a.patientName, 'lg')}
        <div>
          <div class="person__name" style="font-size:17px">${esc(a.patientName)}</div>
          <small>Appointment ${esc(a.id)} · Booked ${esc(G.timeAgo(a.createdAt).toLowerCase())} via ${esc(a.source)}</small>
        </div>
      </div>
      <dl class="kv">
        <div><dt>Doctor</dt><dd>${esc(a.doctorName)}</dd></div>
        <div><dt>Specialist</dt><dd>${esc(a.specialization)}</dd></div>
        <div><dt>Date</dt><dd>${esc(G.date(a.date, { weekday: true }))}</dd></div>
        <div><dt>Time</dt><dd>${G.time(a.time)}</dd></div>
        <div><dt>Appointment status</dt><dd>${G.badge(a.status)}</dd></div>
        <div><dt>Appointment fee</dt><dd>${G.money(a.fee)}</dd></div>
      </dl>
      <div class="divider"></div>
      <dl class="kv">
        <div><dt>Payment status</dt><dd>${G.badge(a.paymentStatus)}</dd></div>
        ${pay
          ? `<div><dt>Paid via</dt><dd>${esc(pay.method)}</dd></div>
             <div><dt>Transaction ID</dt><dd class="mono">${esc(pay.transactionId)}</dd></div>
             <div><dt>Paid on</dt><dd>${esc(`${G.date(pay.paidAt)}, ${new Date(pay.paidAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`)}</dd></div>`
          : `<div class="kv--full"><dt>Note</dt><dd style="font-weight:500;color:var(--muted)">${a.status === 'cancelled' ? 'Appointment cancelled — no payment due.' : 'Awaiting payment from the patient in the Gmedic app.'}</dd></div>`}
      </dl>`;
    statusSelect.value = a.status;
    saveBtn.disabled = true;
  }

  G.openAppointment = async function (id) {
    current = null;
    body.innerHTML = '<div class="skeleton skeleton--row"></div>'.repeat(3);
    statusSelect.disabled = true;
    saveBtn.disabled = true;
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
})();
