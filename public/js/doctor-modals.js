/* Add / edit doctor modal and the bulk "Update Availability" modal.
   Both fire a `doctors:changed` event on document after saving. */
(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;
  const changed = () => document.dispatchEvent(new CustomEvent('doctors:changed'));

  /* ---------- Add / edit doctor ---------- */
  const form = $('#doctor-form');
  let editing = null; // doctor being edited, or null when adding

  function openDoctorForm(doctor) {
    if (!form) return;
    editing = doctor || null;
    form.reset();
    G.clearErrors(form);
    $('#doctor-modal-title').textContent = editing ? 'Edit Doctor' : 'Add Doctor';
    $('[data-doctor-modal-sub]').textContent = editing
      ? `Update ${editing.name}'s details.`
      : `Add a doctor to ${window.GMEDIC.hospital.name}.`;
    $('[data-doctor-modal-icon]').innerHTML = icon(editing ? 'pencil' : 'user-plus');
    $('[data-doctor-submit] span').textContent = editing ? 'Save changes' : 'Save Doctor';
    if (editing) {
      form.elements.name.value = editing.name.replace(/^Dr\.?\s*/i, '');
      form.elements.specialization.value = editing.specialization;
      form.elements.fee.value = editing.fee;
      form.querySelector(`[name="availability"][value="${editing.availability}"]`).checked = true;
    }
    G.modal.open('doctor-modal');
    setTimeout(() => form.elements.name.focus(), 30);
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errors = G.validateForm(form, {
        name: (v) => (/^[A-Za-z][A-Za-z .'-]*$/.test(v.trim()) ? '' : 'Name can only contain letters, spaces, dots and hyphens.'),
      });
      if (Object.keys(errors).length) return G.showErrors(form, errors);

      const values = G.formValues(form);
      const payload = { name: values.name, specialization: values.specialization, fee: Number(values.fee), availability: values.availability };
      const btn = $('[data-doctor-submit]', form);
      G.setLoading(btn, true);
      try {
        const res = editing
          ? await api(`/api/doctors/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: payload })
          : await api('/api/doctors', { method: 'POST', body: payload });
        G.modal.close('doctor-modal');
        G.toast(res.message, 'success');
        changed();
      } catch (err) {
        G.showErrors(form, err.fields || {}, err.message);
      } finally {
        G.setLoading(btn, false);
      }
    });
  }

  /* ---------- Bulk availability ---------- */
  const availModal = $('#availability-modal');
  let doctors = [];
  let pending = new Map(); // id -> availability

  function renderAvailability() {
    const list = $('[data-avail-list]');
    const q = $('[data-avail-filter]').value.trim().toLowerCase();
    const current = (d) => pending.get(d.id) || d.availability;
    const rows = doctors.filter((d) => !q || d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q));

    const present = doctors.filter((d) => current(d) === 'present').length;
    $('[data-avail-summary]').innerHTML = `
      ${G.badge('present', `${present} Present`)}
      ${G.badge('absent', `${doctors.length - present} Absent / On Leave`)}`;

    list.innerHTML = rows.length
      ? rows.map((d) => {
        const on = current(d) === 'present';
        return `<div class="avail-row${pending.has(d.id) ? ' is-changed' : ''}">
          <div class="person">${G.avatar(d.name)}<div><div class="person__name">${esc(d.name)}</div><small>${esc(d.specialization)}</small></div></div>
          <label class="switch">
            <input type="checkbox" data-avail-id="${esc(d.id)}" ${on ? 'checked' : ''} aria-label="${esc(d.name)} present today">
            <span class="switch__track"></span>
            <span class="switch__label ${on ? 'is-present' : 'is-absent'}">${on ? 'Present' : 'Absent / On Leave'}</span>
          </label>
        </div>`;
      }).join('')
      : '<p class="text-muted" style="padding:20px 8px;text-align:center">No doctors match your search.</p>';

    const n = pending.size;
    $('[data-avail-changes]').textContent = n ? `${n} unsaved change${n === 1 ? '' : 's'}` : 'No changes yet';
    $('[data-avail-save]').disabled = !n;
  }

  async function openAvailability() {
    if (!availModal) return;
    pending = new Map();
    $('[data-avail-filter]').value = '';
    $('[data-avail-list]').innerHTML = '<div class="skeleton skeleton--row"></div>'.repeat(4);
    G.modal.open('availability-modal');
    try {
      const data = await api('/api/doctors');
      doctors = data.doctors;
      renderAvailability();
    } catch (err) {
      $('[data-avail-list]').innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  }

  if (availModal) {
    $('[data-avail-filter]').addEventListener('input', renderAvailability);
    $('[data-avail-list]').addEventListener('change', (e) => {
      const input = e.target.closest('[data-avail-id]');
      if (!input) return;
      const d = doctors.find((x) => x.id === input.dataset.availId);
      const value = input.checked ? 'present' : 'absent';
      if (value === d.availability) pending.delete(d.id); else pending.set(d.id, value);
      renderAvailability();
      const again = $(`[data-avail-id="${CSS.escape(d.id)}"]`);
      if (again) again.focus();
    });
    $('[data-avail-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      G.setLoading(btn, true);
      try {
        const changes = [...pending].map(([id, availability]) => ({ id, availability }));
        const res = await api('/api/doctors/availability', { method: 'PATCH', body: { changes } });
        G.modal.close('availability-modal');
        G.toast(res.message, 'success');
        changed();
      } catch (err) {
        G.toast(err.message, 'error');
      } finally {
        G.setLoading(btn, false);
        btn.disabled = !pending.size;
      }
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-add-doctor]')) openDoctorForm(null);
    if (e.target.closest('[data-open-availability]')) openAvailability();
  });

  G.doctorModals = { openAdd: () => openDoctorForm(null), openEdit: openDoctorForm, openAvailability };
})();
