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
      ${G.avatar(d.name, 'xl')}
      <div class="profile-hero__main">
        <h2>${esc(d.name)}</h2>
        <div class="profile-hero__meta">
          <span>${esc(d.specialization)}</span><span class="sep"></span>
          <span>${esc(d.id)}</span><span class="sep"></span>
          <span>Added ${esc(added)}</span>
        </div>
      </div>
      <div style="text-align:right">
        ${G.badge(d.availability)}
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

  async function load() {
    try {
      const data = await api(`/api/doctors/${encodeURIComponent(id)}`);
      doctor = data.doctor;
      renderHero(doctor);
      fillForm(doctor);
      renderSchedule(data.schedule);
    } catch (err) {
      G.toast(err.message, 'error');
    }
  }

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

  load();
})();
