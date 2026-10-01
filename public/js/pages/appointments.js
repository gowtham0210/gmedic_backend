(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;

  const filters = $('[data-filters]');
  const tbody = $('[data-appt-rows]');
  const pager = $('[data-pager]');
  const state = { q: '', date: '', from: '', to: '', doctorId: '', paymentStatus: '', status: '', page: 1, sort: 'date_desc' };
  let controller;

  /* ---------- Initial state from the URL ---------- */
  const params = new URLSearchParams(location.search);
  for (const key of Object.keys(state)) if (params.get(key)) state[key] = params.get(key);
  if (state.date === 'today') state.date = G.todayISO();
  state.page = Number(state.page) || 1;

  function syncInputs() {
    filters.elements.q.value = state.q;
    filters.elements.date.value = state.date;
    filters.elements.doctorId.value = state.doctorId;
    filters.elements.paymentStatus.value = state.paymentStatus;
    $$('[data-status]').forEach((t) => {
      const active = t.dataset.status === state.status;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', String(active));
    });
    const today = G.todayISO();
    const range =
      state.date === today && !state.from ? 'today' :
      state.date === G.addDaysISO(1) && !state.from ? 'tomorrow' :
      state.from === today && state.to === G.addDaysISO(6) ? 'week' :
      !state.date && !state.from && !state.to ? 'all' : '';
    $$('[data-range]').forEach((c) => c.classList.toggle('is-active', c.dataset.range === range));
    $('[data-sort-arrow]').textContent = state.sort === 'date_asc' ? '↑' : '↓';
  }

  function queryString(extra = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...state, ...extra })) if (v && !(k === 'page' && v === 1) && !(k === 'sort' && v === 'date_desc')) qs.set(k, v);
    return qs.toString();
  }

  /* ---------- Rendering ---------- */
  function render(data) {
    for (const [k, n] of Object.entries(data.counts)) {
      const el = $(`[data-count="${k}"]`);
      if (el) el.textContent = n;
    }
    if (!data.items.length) {
      tbody.innerHTML = G.emptyRow(9, 'No appointments found', 'Try another date, doctor or status filter.', 'calendar');
    } else {
      tbody.innerHTML = data.items.map((a) => `
        <tr class="is-clickable" data-appt="${esc(a.id)}" tabindex="0">
          <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(a.patientName, 'sm')}<span><span class="person__name">${esc(a.patientName)}</span><small>${esc(a.id)}</small></span></div></td>
          <td data-label="Doctor">${esc(a.doctorName)}</td>
          <td data-label="Specialist" class="text-muted">${esc(a.specialization)}</td>
          <td data-label="Date" class="nowrap">${esc(G.date(a.date))}${a.date === G.todayISO() ? ' <span class="badge badge--teal badge--plain" style="padding:1px 7px;font-size:11px">Today</span>' : ''}</td>
          <td data-label="Time" class="mono">${G.time(a.time)}</td>
          <td data-label="Fee" class="num fee">${G.money(a.fee)}</td>
          <td data-label="Payment">${G.badge(a.paymentStatus)}</td>
          <td data-label="Status">${G.badge(a.status)}</td>
          <td class="col-actions"><button type="button" class="action-btn" tabindex="-1">${icon('eye')}View</button></td>
        </tr>`).join('');
    }
    G.renderPager(pager, data, (page) => { state.page = page; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 'appointments');
  }

  async function load() {
    syncInputs();
    history.replaceState(null, '', `${location.pathname}${queryString() ? `?${queryString()}` : ''}`);
    if (controller) controller.abort();
    controller = new AbortController();
    tbody.style.opacity = '0.55';
    try {
      const data = await api(`/api/appointments?${queryString({ pageSize: 10 })}`, { signal: controller.signal });
      render(data);
    } catch (err) {
      if (err.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="9"><div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    } finally {
      tbody.style.opacity = '';
    }
  }

  /* ---------- Doctor filter options ---------- */
  api('/api/doctors').then((data) => {
    const select = filters.elements.doctorId;
    select.insertAdjacentHTML('beforeend', data.doctors.map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.specialization)}</option>`).join(''));
    select.value = state.doctorId;
  }).catch(() => {});

  /* ---------- Events ---------- */
  const update = (patch) => { Object.assign(state, patch, { page: 1 }); load(); };

  filters.addEventListener('submit', (e) => e.preventDefault());
  filters.elements.q.addEventListener('input', G.debounce(() => update({ q: filters.elements.q.value.trim() }), 250));
  filters.elements.date.addEventListener('change', (e) => update({ date: e.target.value, from: '', to: '' }));
  filters.elements.doctorId.addEventListener('change', (e) => update({ doctorId: e.target.value }));
  filters.elements.paymentStatus.addEventListener('change', (e) => update({ paymentStatus: e.target.value }));
  filters.addEventListener('reset', (e) => {
    e.preventDefault();
    update({ q: '', date: '', from: '', to: '', doctorId: '', paymentStatus: '', status: '' });
  });

  $('[data-status-tabs]').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-status]');
    if (tab) update({ status: tab.dataset.status });
  });

  $('[data-date-chips]').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-range]');
    if (!chip) return;
    const today = G.todayISO();
    const ranges = {
      today: { date: today, from: '', to: '' },
      tomorrow: { date: G.addDaysISO(1), from: '', to: '' },
      week: { date: '', from: today, to: G.addDaysISO(6), sort: 'date_asc' },
      all: { date: '', from: '', to: '' },
    };
    update(ranges[chip.dataset.range]);
  });

  $('[data-sort]').addEventListener('click', () => update({ sort: state.sort === 'date_asc' ? 'date_desc' : 'date_asc' }));

  const openRow = (row) => row && G.openAppointment(row.dataset.appt);
  tbody.addEventListener('click', (e) => openRow(e.target.closest('[data-appt]')));
  tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') openRow(e.target.closest('[data-appt]')); });
  document.addEventListener('appointments:changed', load);

  load();
})();
