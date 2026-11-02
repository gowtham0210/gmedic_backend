(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;

  const filters = $('[data-filters]');
  const tbody = $('[data-token-rows]');
  const state = { q: '', date: G.todayISO(), doctorId: '', status: '' };
  let tokens = [];
  let highlightId = null;
  let controller;

  /* ---------- State from URL ---------- */
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) if (params.get(key)) state[key] = params.get(key);
  if (state.date === 'today') state.date = G.todayISO();

  function syncInputs() {
    filters.elements.q.value = state.q;
    filters.elements.date.value = state.date;
    filters.elements.doctorId.value = state.doctorId;
    filters.elements.status.value = state.status;
    $$('[data-status]').forEach((t) => {
      const active = t.dataset.status === state.status;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    const label = state.date === G.todayISO() ? `Showing today, ${G.date(state.date)}.` : `Showing ${G.date(state.date, { weekday: true })}.`;
    $('[data-date-label]').textContent = label;
  }

  function queryString() {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v && !(k === 'date' && v === G.todayISO())) qs.set(k, v);
    return qs.toString();
  }

  /* ---------- Table ---------- */
  function pillClass(t) {
    if (t.status === 'called') return ' is-called';
    if (t.status === 'cancelled') return ' is-muted';
    return '';
  }

  function quickAction(t) {
    if (t.status === 'waiting') return `<button type="button" class="action-btn" data-quick="called" data-id="${esc(t.id)}">${icon('megaphone')}Call</button>`;
    // Completing needs the consultation step first (models/tokenModel.js TRANSITIONS).
    if (t.status === 'called') return `<button type="button" class="action-btn" data-quick="in_consultation" data-id="${esc(t.id)}">${icon('stethoscope')}Send in</button>`;
    if (t.status === 'in_consultation') return `<button type="button" class="action-btn" data-quick="completed" data-id="${esc(t.id)}">${icon('check')}Complete</button>`;
    // A skipped patient who turns up later goes straight back to the doctor.
    if (t.status === 'skipped') return `<button type="button" class="action-btn" data-quick="called" data-id="${esc(t.id)}">${icon('megaphone')}Recall</button>`;
    return '';
  }

  function render(data) {
    for (const [k, n] of Object.entries(data.summary)) {
      const sum = $(`[data-sum="${k}"]`);
      if (sum) sum.textContent = n;
      const count = $(`[data-count="${k}"]`);
      if (count) count.textContent = n;
    }
    tokens = data.items;
    if (!tokens.length) {
      const filtered = state.q || state.doctorId || state.status;
      tbody.innerHTML = filtered
        ? G.emptyRow(7, 'No tokens found', 'Try another doctor, status or search.', 'ticket')
        : G.emptyRow(7, 'No tokens for this date', 'Tokens appear here as soon as appointments are booked for this date.', 'ticket');
      $('[data-token-count]').textContent = '';
      return;
    }
    tbody.innerHTML = tokens.map((t) => `
      <tr class="is-clickable${t.id === highlightId ? ' is-highlight' : ''}" data-token="${esc(t.id)}" tabindex="0">
        <td data-label="Token"><span class="token-pill${pillClass(t)}">${esc(t.code)}</span>${t.emergency ? ` ${G.badge('emergency', 'Emergency')}` : ''}</td>
        <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(t.patientName, 'sm')}<span><span class="person__name">${esc(t.patientName)}</span><small>${esc(t.appointmentId)}</small></span></div></td>
        <td data-label="Doctor">${esc(t.doctorName)}</td>
        <td data-label="Specialist" class="text-muted">${esc(t.specialization)}</td>
        <td data-label="Time" class="mono">${G.time(t.time)}</td>
        <td data-label="Status">${G.badge(t.status)}</td>
        <td class="col-actions"><div class="action-group">${quickAction(t)}<button type="button" class="action-btn" data-view="${esc(t.id)}">${icon('eye')}View</button></div></td>
      </tr>`).join('');
    $('[data-token-count]').textContent = `Showing ${tokens.length} token${tokens.length === 1 ? '' : 's'}`;
  }

  async function load() {
    syncInputs();
    history.replaceState(null, '', `${location.pathname}${queryString() ? `?${queryString()}` : ''}`);
    if (controller) controller.abort();
    controller = new AbortController();
    tbody.style.opacity = '0.55';
    try {
      const qs = new URLSearchParams({ date: state.date });
      if (state.doctorId) qs.set('doctorId', state.doctorId);
      if (state.status) qs.set('status', state.status);
      if (state.q) qs.set('q', state.q);
      render(await api(`/api/tokens?${qs}`, { signal: controller.signal }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    } finally {
      tbody.style.opacity = '';
    }
  }

  async function setStatus(id, status) {
    const res = await api(`/api/tokens/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { status } });
    G.toast(res.message, 'success');
    highlightId = id;
    await load();
    return res.token;
  }

  /* ---------- Filters ---------- */
  const update = (patch) => { Object.assign(state, patch); load(); };
  filters.addEventListener('submit', (e) => e.preventDefault());
  filters.elements.q.addEventListener('input', G.debounce(() => update({ q: filters.elements.q.value.trim() }), 250));
  filters.elements.date.addEventListener('change', (e) => update({ date: e.target.value || G.todayISO() }));
  filters.elements.doctorId.addEventListener('change', (e) => update({ doctorId: e.target.value }));
  filters.elements.status.addEventListener('change', (e) => update({ status: e.target.value }));
  filters.addEventListener('reset', (e) => {
    e.preventDefault();
    update({ q: '', date: G.todayISO(), doctorId: '', status: '' });
  });
  $('[data-status-tabs]').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-status]');
    if (tab) update({ status: tab.dataset.status });
  });

  // Doctor options for the filter and the generate form.
  api('/api/doctors').then((data) => {
    const options = data.doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.specialization)}</option>`).join('');
    filters.elements.doctorId.insertAdjacentHTML('beforeend', options);
    filters.elements.doctorId.value = state.doctorId;
    $('#tg-doctor').insertAdjacentHTML('beforeend', options);
  }).catch(() => {});

  /* ---------- Row actions ---------- */
  tbody.addEventListener('click', async (e) => {
    const quick = e.target.closest('[data-quick]');
    if (quick) {
      quick.disabled = true;
      try { await setStatus(quick.dataset.id, quick.dataset.quick); } catch (err) { G.toast(err.message, 'error'); quick.disabled = false; }
      return;
    }
    const row = e.target.closest('[data-token]');
    if (row) openDetail(row.dataset.token);
  });
  tbody.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-token]')) openDetail(e.target.dataset.token);
  });

  /* ---------- Token details ---------- */
  const detailBody = $('[data-token-body]');
  const statusSelect = $('[data-token-status]');
  const saveBtn = $('[data-token-save]');
  const cancelBtn = $('[data-token-cancel]');
  const printBtn = $('[data-token-print]');
  let current = null;
  let cancelArmed = null;

  function stamp(iso) {
    if (!iso) return '—';
    return `${G.date(iso)}, ${new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  function renderDetail(t) {
    const cancelled = t.status === 'cancelled';
    detailBody.innerHTML = `
      <div class="person" style="margin-bottom:20px;gap:16px">
        <span class="token-pill token-pill--lg${pillClass(t)}">${esc(t.code)}</span>
        <div>
          <div class="person__name" style="font-size:17px">${esc(t.patientName)}</div>
          <div style="margin-top:6px">${G.badge(t.status)}${t.emergency ? ` ${G.badge('emergency', 'Emergency')}` : ''}</div>
        </div>
      </div>
      <dl class="kv">
        <div><dt>Doctor</dt><dd>${esc(t.doctorName)}</dd></div>
        <div><dt>Specialist</dt><dd>${esc(t.specialization)}</dd></div>
        <div><dt>Date</dt><dd>${esc(G.date(t.date, { weekday: true }))}</dd></div>
        <div><dt>Appointment time</dt><dd>${G.time(t.time)}</dd></div>
        <div><dt>Appointment</dt><dd>${esc(t.appointmentId)} ${t.appointmentStatus ? G.badge(t.appointmentStatus) : ''}</dd></div>
        <div><dt>Payment</dt><dd>${t.paymentStatus ? G.badge(t.paymentStatus) : '—'}</dd></div>
      </dl>
      <div class="divider"></div>
      <dl class="kv">
        <div><dt>Issued</dt><dd>${esc(stamp(t.createdAt))}</dd></div>
        <div><dt>Called</dt><dd>${esc(stamp(t.calledAt))}</dd></div>
        <div><dt>Completed</dt><dd>${esc(stamp(t.completedAt))}</dd></div>
        ${cancelled ? `<div><dt>Cancelled</dt><dd>${esc(stamp(t.cancelledAt || t.updatedAt))}</dd></div>` : ''}
      </dl>
      ${cancelled ? `<p class="note">${icon('info')}<span>This token was cancelled. Generate a new token if the patient still needs to be seen.</span></p>` : ''}`;
    $('[data-token-sub]').textContent = `Token ${t.code} · ${G.relativeDay(t.date)}`;
    // Current status plus the moves the server allows; cancelling has its own button.
    const next = (t.nextStatuses || []).filter((s) => s !== 'cancelled');
    statusSelect.innerHTML = [t.status, ...next].map((s) => `<option value="${esc(s)}">${esc(G.label(s))}</option>`).join('');
    statusSelect.value = t.status;
    statusSelect.disabled = cancelled || !next.length;
    // A finished or cancelled token has nothing left to change; only a live one gets a slip.
    $('#token-detail-modal .modal__foot').hidden = cancelled;
    printBtn.hidden = cancelled || t.status === 'completed';
    saveBtn.disabled = true;
    disarmCancel();
  }

  function disarmCancel() {
    clearTimeout(cancelArmed);
    cancelArmed = null;
    cancelBtn.querySelector('span').textContent = 'Cancel token';
  }

  async function openDetail(id) {
    current = null;
    detailBody.innerHTML = '<div class="skeleton skeleton--row"></div>'.repeat(3);
    saveBtn.disabled = true;
    $('#token-detail-modal .modal__foot').hidden = false;
    G.modal.open('token-detail-modal');
    try {
      current = (await api(`/api/tokens/${encodeURIComponent(id)}`)).token;
      renderDetail(current);
    } catch (err) {
      detailBody.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  }

  statusSelect.addEventListener('change', () => { saveBtn.disabled = !current || statusSelect.value === current.status; });

  saveBtn.addEventListener('click', async () => {
    if (!current) return;
    G.setLoading(saveBtn, true);
    try {
      current = await setStatus(current.id, statusSelect.value);
      renderDetail(current);
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(saveBtn, false);
      saveBtn.disabled = !current || statusSelect.value === current.status;
    }
  });

  // Cancelling needs a second click to confirm.
  cancelBtn.addEventListener('click', async () => {
    if (!current) return;
    if (!cancelArmed) {
      cancelBtn.querySelector('span').textContent = 'Click again to confirm';
      cancelArmed = setTimeout(disarmCancel, 4000);
      return;
    }
    disarmCancel();
    G.setLoading(cancelBtn, true);
    try {
      current = await setStatus(current.id, 'cancelled');
      renderDetail(current);
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(cancelBtn, false);
    }
  });
  $('#token-detail-modal').addEventListener('modal:close', disarmCancel);

  // A token slip for the patient (new token, or a reprint when the slip is lost), in its own window
  // so printing doesn't carry the portal around it.
  function printSlip(t) {
    const hospital = (window.GMEDIC && window.GMEDIC.hospital) || {};
    const w = window.open('', '_blank', 'width=380,height=560');
    if (!w) return G.toast('Allow pop-ups to print the token slip.', 'error');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Token ${esc(t.code)}</title>
      <style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#111;text-align:center}h1{font-size:16px;margin:0}h2{font-size:12px;font-weight:600;color:#555;margin:2px 0 16px;text-transform:uppercase;letter-spacing:.06em}
      .code{font-size:56px;font-weight:800;letter-spacing:.04em;margin:4px 0 16px}table{width:100%;border-collapse:collapse;text-align:left}td{padding:5px 0;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{color:#555;width:40%}
      .foot{margin-top:18px;color:#777;font-size:12px}</style></head><body>
      <h1>${esc(hospital.name || '')}</h1><h2>Queue token</h2>
      <div class="code">${esc(t.code)}</div>
      <table>
        <tr><td>Patient</td><td>${esc(t.patientName)}</td></tr>
        <tr><td>Doctor</td><td>${esc(t.doctorName)}${t.specialization ? ` (${esc(t.specialization)})` : ''}</td></tr>
        <tr><td>Date</td><td>${esc(G.date(t.date, { weekday: true }))}</td></tr>
        <tr><td>Appointment</td><td>${esc(G.time(t.time))} · ${esc(t.appointmentId)}</td></tr>
      </table>
      <p class="foot">Please wait until your token is called.${t.createdAt ? ` Issued ${esc(stamp(t.createdAt))}.` : ''}</p>
      <script>window.onload=function(){window.print();}<\/script></body></html>`);
    w.document.close();
  }
  printBtn.addEventListener('click', () => { if (current) printSlip(current); });

  /* ---------- Generate token ---------- */
  const genForm = $('#token-generate-form');
  const eligibleList = $('[data-eligible-list]');
  let eligibleCtl;

  async function loadEligible() {
    const date = genForm.elements.date.value;
    G.clearErrors(genForm);
    if (!date) { eligibleList.innerHTML = '<p class="text-muted">Choose a date.</p>'; return; }
    if (eligibleCtl) eligibleCtl.abort();
    eligibleCtl = new AbortController();
    eligibleList.innerHTML = '<div class="skeleton skeleton--row"></div>'.repeat(3);
    const qs = new URLSearchParams({ date });
    if (genForm.elements.doctorId.value) qs.set('doctorId', genForm.elements.doctorId.value);
    if (genForm.elements.q.value.trim()) qs.set('q', genForm.elements.q.value.trim());
    try {
      const data = await api(`/api/tokens/eligible?${qs}`, { signal: eligibleCtl.signal });
      $('[data-next-code]').textContent = data.nextCode || '—';
      $('[data-generate-submit]').disabled = !data.canIssue || !data.items.length;
      if (!data.canIssue) {
        eligibleList.innerHTML = `<p class="note">${icon('info')}<span>Tokens can only be assigned for today or upcoming appointments.</span></p>`;
        return;
      }
      if (!data.items.length) {
        eligibleList.innerHTML = `<div class="empty" style="padding:28px 12px"><div class="empty__icon">${icon('check-circle')}</div><h3>All set</h3><p>Every appointment for this date already has a token.</p></div>`;
        return;
      }
      eligibleList.innerHTML = data.items.map((a, i) => `
        <label class="elig-row">
          <input type="radio" name="appointmentId" value="${esc(a.appointmentId)}" data-token-code="${esc(a.tokenCode || '')}" ${i === 0 ? 'checked' : ''}>
          <div class="person">${G.avatar(a.patientName, 'sm')}<span><span class="person__name">${esc(a.patientName)}</span><small>${esc(a.doctorName)} · ${esc(a.specialization)}</small></span></div>
          ${G.badge(a.status)}
          <div class="elig-row__time">${G.time(a.time)}<small>${a.tokenCode ? `${esc(a.tokenCode)} · ` : ''}${esc(a.appointmentId)}</small></div>
        </label>`).join('');
      showPickedToken();
    } catch (err) {
      if (err.name === 'AbortError') return;
      eligibleList.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  }

  // The token is the one the appointment was booked with (shared with the Gmedic app); an older
  // appointment without one gets the doctor's next number when it is checked in.
  function showPickedToken() {
    const picked = eligibleList.querySelector('input[name="appointmentId"]:checked');
    $('[data-next-code]').textContent = picked ? (picked.dataset.tokenCode || 'Next for doctor') : '—';
  }
  eligibleList.addEventListener('change', showPickedToken);

  function openGenerate() {
    const today = G.todayISO();
    genForm.reset();
    genForm.elements.date.min = today;
    genForm.elements.date.value = state.date >= today ? state.date : today;
    genForm.elements.doctorId.value = state.doctorId;
    G.modal.open('token-generate-modal');
    loadEligible();
  }

  $('[data-open-generate]').addEventListener('click', openGenerate);
  genForm.elements.date.addEventListener('change', loadEligible);
  genForm.elements.doctorId.addEventListener('change', loadEligible);
  genForm.elements.q.addEventListener('input', G.debounce(loadEligible, 250));
  genForm.elements.q.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  genForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const picked = genForm.querySelector('[name="appointmentId"]:checked');
    if (!picked) return G.showErrors(genForm, { appointmentId: 'Choose an appointment.' });
    const btn = $('[data-generate-submit]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/tokens', { method: 'POST', body: { appointmentId: picked.value } });
      G.modal.close('token-generate-modal');
      G.toast(res.message, 'success');
      highlightId = res.token.id;
      Object.assign(state, { date: res.token.date, status: '', q: '' });
      load();
      // Straight to the new token, where the slip can be printed for the patient.
      openDetail(res.token.id);
    } catch (err) {
      await loadEligible();
      G.showErrors(genForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });

  if (params.get('generate') === '1') openGenerate();
  load();
})();
