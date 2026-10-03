(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;

  const filters = $('[data-filters]');
  const tbody = $('[data-pay-rows]');
  const pager = $('[data-pager]');
  const state = { q: '', from: '', to: '', doctorId: '', paymentStatus: '', page: 1 };
  let controller;

  const RANGES = {
    today: () => ({ from: G.todayISO(), to: G.todayISO() }),
    '7d': () => ({ from: G.addDaysISO(-6), to: G.todayISO() }),
    '30d': () => ({ from: G.addDaysISO(-29), to: G.todayISO() }),
    all: () => ({ from: '', to: '' }),
  };

  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) if (params.get(key)) state[key] = params.get(key);
  if (RANGES[params.get('range')]) Object.assign(state, RANGES[params.get('range')]());
  state.page = Number(state.page) || 1;

  function syncInputs() {
    for (const k of ['q', 'from', 'to', 'doctorId', 'paymentStatus']) filters.elements[k].value = state[k];
    const active = Object.keys(RANGES).find((k) => {
      const r = RANGES[k]();
      return r.from === state.from && r.to === state.to;
    });
    $$('[data-range]').forEach((c) => c.classList.toggle('is-active', c.dataset.range === active));
  }

  function queryString(extra = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...extra })) if (v && !(k === 'page' && v === 1)) qs.set(k, v);
    return qs.toString();
  }

  function render(data) {
    const s = data.summary;
    $('[data-sum="collected"]').textContent = G.money(s.collected);
    $('[data-sum="pendingAmount"]').textContent = G.money(s.pendingAmount);
    $('[data-sum="paidCount"]').textContent = s.paidCount;
    $('[data-sum="pendingCount"]').textContent = s.pendingCount;

    if (!data.items.length) {
      tbody.innerHTML = G.emptyRow(8, 'No payments found', 'Try a different date range or filter.', 'wallet');
    } else {
      tbody.innerHTML = data.items.map((p) => `
        <tr>
          <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(p.patientName, 'sm')}<span><span class="person__name">${esc(p.patientName)}</span><small>${esc(p.id)}</small></span></div></td>
          <td data-label="Doctor">${esc(p.doctorName)}<span class="cell-sub">${esc(p.specialization)}</span></td>
          <td data-label="Date" class="nowrap">${esc(G.date(p.date))}</td>
          <td data-label="Time" class="mono">${G.time(p.time)}</td>
          <td data-label="Fee" class="num fee">${G.money(p.fee)}</td>
          <td data-label="Method">${p.payment ? `${esc(p.payment.method)}<span class="cell-sub mono">${esc(p.payment.transactionId)}</span>` : '<span class="text-muted">—</span>'}</td>
          <td data-label="Payment">${G.badge(p.paymentStatus)}</td>
          <td class="col-actions">${p.paymentStatus === 'paid' ? `<button type="button" class="action-btn" data-request-refund
              data-appointment-id="${esc(p.id)}" data-patient-name="${esc(p.patientName)}" data-fee="${p.fee}">${icon('refresh')}Request Refund</button>` : ''}</td>
        </tr>`).join('');
    }
    G.renderPager(pager, data, (page) => { state.page = page; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 'payments');
  }

  async function load() {
    syncInputs();
    history.replaceState(null, '', `${location.pathname}${queryString() ? `?${queryString()}` : ''}`);
    if (state.from && state.to && state.from > state.to) {
      G.toast('The "From" date must be before the "To" date.', 'error');
      return;
    }
    if (controller) controller.abort();
    controller = new AbortController();
    tbody.style.opacity = '0.55';
    try {
      render(await api(`/api/payments?${queryString({ pageSize: 10 })}`, { signal: controller.signal }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="8"><div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    } finally {
      tbody.style.opacity = '';
    }
  }

  api('/api/doctors').then((data) => {
    const select = filters.elements.doctorId;
    select.insertAdjacentHTML('beforeend', data.doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join(''));
    select.value = state.doctorId;
  }).catch(() => {});

  const update = (patch) => { Object.assign(state, patch, { page: 1 }); load(); };
  filters.addEventListener('submit', (e) => e.preventDefault());
  filters.elements.q.addEventListener('input', G.debounce(() => update({ q: filters.elements.q.value.trim() }), 250));
  for (const k of ['from', 'to', 'doctorId', 'paymentStatus']) {
    filters.elements[k].addEventListener('change', (e) => update({ [k]: e.target.value }));
  }
  filters.addEventListener('reset', (e) => {
    e.preventDefault();
    update({ q: '', from: '', to: '', doctorId: '', paymentStatus: '' });
  });
  $('[data-date-chips]').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-range]');
    if (chip) update(RANGES[chip.dataset.range]());
  });

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-request-refund]');
    if (!btn) return;
    window.dispatchEvent(new CustomEvent('refund:request', {
      detail: { appointmentId: btn.dataset.appointmentId, patientName: btn.dataset.patientName, fee: Number(btn.dataset.fee) },
    }));
  });

  load();
})();
