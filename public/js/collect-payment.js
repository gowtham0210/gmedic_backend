/* Collect a fee at the front desk. G.collectPayment(appointment) opens the dialog; on success it shows a
   printable receipt. Fires `appointments:changed` and `payments:changed`. */
(function () {
  'use strict';
  const { $, esc, icon, api } = G;
  const modal = $('#collect-payment-modal');
  if (!modal) return;

  const form = $('#collect-payment-form', modal);
  const receipt = $('[data-collect-receipt]', modal);
  const submit = $('[data-collect-submit]', modal);
  const refField = $('[data-collect-ref-field]', modal);
  const refLabel = $('[data-collect-ref-label]', modal);
  let target = null;
  let paid = null;

  function syncMethod() {
    const method = form.elements.method.value;
    refField.hidden = method === 'Cash';
    refLabel.innerHTML = `${method === 'UPI' ? 'UPI reference' : 'Card slip / approval number'} <span class="req">*</span>`;
    if (method === 'Cash') form.elements.reference.value = '';
  }
  form.elements.method.addEventListener('change', syncMethod);

  G.collectPayment = function (appointment) {
    target = appointment;
    paid = null;
    form.reset();
    G.clearErrors(form);
    syncMethod();
    form.hidden = false;
    receipt.hidden = true;
    $('[data-collect-sub]', modal).textContent = `${appointment.patientName} · ${appointment.doctorName} · ${G.date(appointment.date)}, ${G.time(appointment.time)}`;
    $('[data-collect-amount]', modal).textContent = G.money(appointment.fee);
    G.modal.open('collect-payment-modal');
  };

  function receiptHtml(a) {
    const p = a.payment;
    return `<dl class="kv">
      <div><dt>Receipt</dt><dd class="mono">${esc(p.receiptNumber || '—')}</dd></div>
      <div><dt>Paid</dt><dd>${esc(G.money(p.amount))} by ${esc(p.method)}${p.reference ? ` · <span class="mono">${esc(p.reference)}</span>` : ''}</dd></div>
      <div><dt>Patient</dt><dd>${esc(a.patientName)}</dd></div>
      <div><dt>Appointment</dt><dd>${esc(a.doctorName)} · ${esc(G.date(a.date))}, ${G.time(a.time)}</dd></div>
    </dl>`;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!target) return;
    G.clearErrors(form);
    G.setLoading(submit, true);
    try {
      const res = await api(`/api/appointments/${encodeURIComponent(target.id)}/payment`, { method: 'POST', body: { method: form.elements.method.value, reference: form.elements.reference.value } });
      paid = res.appointment;
      form.hidden = true;
      receipt.hidden = false;
      $('[data-receipt-sub]', receipt).textContent = `Receipt ${paid.payment.receiptNumber || ''}`;
      $('[data-receipt-body]', receipt).innerHTML = receiptHtml(paid);
      document.dispatchEvent(new CustomEvent('appointments:changed'));
      document.dispatchEvent(new CustomEvent('payments:changed'));
    } catch (err) {
      G.showErrors(form, err.fields || {}, err.message);
    } finally {
      G.setLoading(submit, false);
    }
  });

  // A plain receipt in its own window, so printing doesn't carry the portal around it.
  $('[data-receipt-print]', receipt).addEventListener('click', () => {
    if (!paid) return;
    const p = paid.payment;
    const w = window.open('', '_blank', 'width=480,height=640');
    if (!w) return G.toast('Allow pop-ups to print the receipt.', 'error');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt ${esc(p.receiptNumber || '')}</title>
      <style>body{font:14px/1.5 system-ui,sans-serif;margin:32px;color:#111}h1{font-size:18px;margin:0 0 2px}h2{font-size:13px;font-weight:600;color:#555;margin:0 0 20px}
      table{width:100%;border-collapse:collapse}td{padding:6px 0;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{color:#555;width:38%}.total{font-size:18px;font-weight:700}
      .foot{margin-top:24px;color:#777;font-size:12px}</style></head><body>
      <h1>${esc(paid.hospitalName)}</h1><h2>Payment receipt</h2>
      <table>
        <tr><td>Receipt no.</td><td>${esc(p.receiptNumber || '')}</td></tr>
        <tr><td>Date</td><td>${esc(G.date(p.paidAt))}, ${esc(new Date(p.paidAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))}</td></tr>
        <tr><td>Patient</td><td>${esc(paid.patientName)}</td></tr>
        <tr><td>Doctor</td><td>${esc(paid.doctorName)} (${esc(paid.specialization || '')})</td></tr>
        <tr><td>Appointment</td><td>${esc(G.date(paid.date))}, ${esc(G.time(paid.time))} · ${esc(paid.id)}${paid.tokenCode ? ` · token ${esc(paid.tokenCode)}` : ''}</td></tr>
        <tr><td>Paid by</td><td>${esc(p.method)}${p.reference ? ` · ${esc(p.reference)}` : ''}</td></tr>
        <tr><td>Amount</td><td class="total">${esc(G.money(p.amount))}</td></tr>
      </table>
      <p class="foot">Thank you. This receipt was issued at the front desk.</p>
      <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  });
}());
