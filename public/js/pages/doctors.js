(function () {
  'use strict';
  const { $, esc, icon, api } = G;

  const filters = $('[data-filters]');
  const tbody = $('[data-doctor-rows]');
  let doctors = [];
  let controller;

  // Pre-fill filters from the URL, e.g. /doctors?availability=absent
  const params = new URLSearchParams(location.search);
  for (const key of ['q', 'specialization', 'availability']) {
    if (params.get(key) && filters.elements[key]) filters.elements[key].value = params.get(key);
  }

  function query() {
    const v = G.formValues(filters);
    const qs = new URLSearchParams();
    for (const [k, val] of Object.entries(v)) if (val) qs.set(k, val);
    return qs.toString();
  }

  // Why a doctor can't be booked yet, so the desk doesn't have to guess.
  function statusBadges(d) {
    const out = [];
    if (d.status === 'INACTIVE') out.push('<span class="badge badge--cancelled">Inactive</span>');
    if (d.verificationStatus === 'REJECTED') out.push('<span class="badge badge--cancelled" title="Gmedic did not verify this doctor, so they can\'t be booked.">Not verified</span>');
    else if (d.verificationStatus !== 'VERIFIED') out.push('<span class="badge badge--pending" title="Gmedic verifies a new doctor before patients and the front desk can book them.">Pending verification</span>');
    if (!d.workingBlocks) out.push('<span class="badge badge--pending" title="Open the doctor and add working hours to start taking bookings.">No working hours</span>');
    return out.join(' ');
  }

  // Absent means absent today only; a leave (several days) is set by the doctor and shows here, not as a toggle.
  function availabilityCell(d) {
    if (d.onLeave) return `<span class="badge badge--absent">On leave</span><span class="cell-sub">${esc(d.leaveNote)}</span>`;
    const on = d.availability === 'present';
    return `<label class="switch" title="Absent applies to today only; the doctor is back tomorrow">
      <input type="checkbox" data-toggle-avail="${esc(d.id)}" ${on ? 'checked' : ''} aria-label="${esc(d.name)} present today">
      <span class="switch__track"></span>
      <span class="switch__label ${on ? 'is-present' : 'is-absent'}">${on ? 'Present' : 'Absent today'}</span>
    </label>`;
  }

  function render() {
    if (!doctors.length) {
      const filtered = query() !== '';
      tbody.innerHTML = filtered
        ? G.emptyRow(6, 'No doctors found', 'Try a different search or clear the filters.')
        : G.emptyRow(6, 'No doctors yet', 'Add your first doctor to start receiving appointments.', 'user-plus');
      $('[data-doctor-count]').textContent = '';
      return;
    }
    tbody.innerHTML = doctors.map((d) => `
      <tr>
        <td class="cell-primary" data-label="Doctor">
          <a class="person" href="/doctors/${encodeURIComponent(d.id)}">${G.avatar(d.name, '', d.photoUrl)}
            <span><span class="person__name">${esc(d.name)}</span><small>${esc(d.id)}</small></span></a>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${statusBadges(d)}</div>
        </td>
        <td data-label="Specialist"><span class="nowrap">${esc(d.specialization)}</span></td>
        <td data-label="Appointment Fee" class="num fee">${G.money(d.fee)}</td>
        <td data-label="Today"><span class="text-muted">${d.todayAppointments} appt${d.todayAppointments === 1 ? '' : 's'}</span></td>
        <td data-label="Availability">${availabilityCell(d)}</td>
        <td class="col-actions">
          <div class="action-group">
            <a class="action-btn" href="/doctors/${encodeURIComponent(d.id)}">${icon('eye')}View</a>
            <button type="button" class="action-btn" data-edit="${esc(d.id)}">${icon('pencil')}Edit</button>
          </div>
        </td>
      </tr>`).join('');
    $('[data-doctor-count]').textContent = `Showing ${doctors.length} doctor${doctors.length === 1 ? '' : 's'}`;
  }

  function renderSummary(s) {
    $('[data-sum="total"]').textContent = s.total;
    $('[data-sum="present"]').textContent = s.present;
    $('[data-sum="absent"]').textContent = s.absent;
  }

  async function load() {
    if (controller) controller.abort();
    controller = new AbortController();
    const qs = query();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
    try {
      const data = await api(`/api/doctors${qs ? `?${qs}` : ''}`, { signal: controller.signal });
      doctors = data.doctors;
      renderSummary(data.summary);
      render();
    } catch (err) {
      if (err.name === 'AbortError') return;
      tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    }
  }

  filters.addEventListener('submit', (e) => e.preventDefault());
  filters.elements.q.addEventListener('input', G.debounce(load, 250));
  filters.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') load(); });
  filters.addEventListener('reset', () => setTimeout(load, 0));

  tbody.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-edit]');
    if (btn) G.doctorModals.openEdit(doctors.find((d) => d.id === btn.dataset.edit));
  });

  // Inline availability toggle.
  tbody.addEventListener('change', async (e) => {
    const input = e.target.closest('[data-toggle-avail]');
    if (!input) return;
    const d = doctors.find((x) => x.id === input.dataset.toggleAvail);
    const next = input.checked ? 'present' : 'absent';
    const label = input.parentElement.querySelector('.switch__label');
    input.disabled = true;
    try {
      const res = await api(`/api/doctors/${encodeURIComponent(d.id)}/availability`, { method: 'PATCH', body: { availability: next } });
      d.availability = res.doctor.availability;
      label.className = `switch__label ${next === 'present' ? 'is-present' : 'is-absent'}`;
      label.textContent = next === 'present' ? 'Present' : 'Absent today';
      G.toast(res.message, 'success');
      const s = await api('/api/doctors');
      renderSummary(s.summary);
      // Keep the list consistent when filtering by availability.
      if (filters.elements.availability.value) load();
    } catch (err) {
      input.checked = !input.checked;
      G.toast(err.message, 'error');
    } finally {
      input.disabled = false;
    }
  });

  document.addEventListener('doctors:changed', load);
  load();
})();
