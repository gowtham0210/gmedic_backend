/* Working hours card on the receptionist's doctor page: the weekly blocks patients can book, added and removed
   by the front desk. GET/POST /api/doctors/:id/schedule, PATCH/DELETE /api/doctors/:id/schedule/:blockId.
   Fires `doctor:hours-changed` so the walk-in seats card follows. Changes to existing hours apply from tomorrow; new hours for today start today when that is safe. */
(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;
  const card = $('[data-hours-card]');
  const root = $('[data-doctor-id]');
  if (!card || !root) return;

  const doctorId = root.dataset.doctorId;
  const tbody = $('[data-hours-rows]', card);
  const form = $('[data-hours-form]', card);
  const addBtn = $('[data-hours-add]', card);
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const ORDER = [1, 2, 3, 4, 5, 6, 0];
  let blocks = [];

  function when(b) {
    if (b.endsToday) return 'Ends today';
    if (b.effectiveFrom && b.effectiveFrom > G.todayISO()) return `Starts ${G.date(b.effectiveFrom)}`;
    if (b.effectiveTo) return `Ends ${G.date(b.effectiveTo)}`;
    return '';
  }

  function render() {
    if (!blocks.length) {
      tbody.innerHTML = G.emptyRow(5, 'No working hours yet', 'Add the doctor\'s weekly hours below. Until then nobody can book them.', 'clock');
      return;
    }
    const sorted = [...blocks].sort((a, b) => ORDER.indexOf(a.dayOfWeek) - ORDER.indexOf(b.dayOfWeek) || a.startTime.localeCompare(b.startTime));
    tbody.innerHTML = sorted.map((b) => `
      <tr data-block="${b.id}">
        <td data-label="Day"><span class="nowrap">${DAYS[b.dayOfWeek]}</span>${when(b) ? `<br><small class="text-muted">${esc(when(b))}</small>` : ''}</td>
        <td data-label="Hours" class="nowrap">${G.time(b.startTime)}–${G.time(b.endTime)}</td>
        <td data-label="Slot" class="num">${b.slotMinutes} min</td>
        <td data-label="Per slot" class="num"><input class="input" type="number" min="1" max="50" step="1" value="${b.capacityPerSlot}" ${b.endsToday ? 'disabled' : ''} data-capacity data-original="${b.capacityPerSlot}" style="width:64px;height:32px;text-align:right" aria-label="Patients per slot, ${DAYS[b.dayOfWeek]} ${esc(b.startTime)}"></td>
        <td class="col-actions"><div class="action-group">
          <button type="button" class="action-btn" data-save-capacity hidden>${icon('check')}Save</button>
          ${b.endsToday ? '' : `<button type="button" class="action-btn" data-remove>${icon('x')}Remove</button>`}
        </div></td>
      </tr>`).join('');
  }

  async function load() {
    try {
      blocks = (await api(`/api/doctors/${encodeURIComponent(doctorId)}/schedule`)).items;
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    }
  }
  const changed = async (message) => { if (message) G.toast(message, 'success'); await load(); document.dispatchEvent(new CustomEvent('doctor:hours-changed')); document.dispatchEvent(new CustomEvent('doctors:changed')); };

  // The Save button of a row appears once its number differs from what is stored.
  tbody.addEventListener('input', (e) => {
    const input = e.target.closest('[data-capacity]');
    if (!input) return;
    $('[data-save-capacity]', input.closest('tr')).hidden = input.value === input.dataset.original;
  });

  tbody.addEventListener('click', async (e) => {
    const tr = e.target.closest('[data-block]');
    if (!tr) return;
    const id = tr.dataset.block;
    const save = e.target.closest('[data-save-capacity]');
    const remove = e.target.closest('[data-remove]');
    try {
      if (save) {
        G.setLoading(save, true);
        const res = await api(`/api/doctors/${encodeURIComponent(doctorId)}/schedule/${encodeURIComponent(id)}`, { method: 'PATCH', body: { capacityPerSlot: Number($('[data-capacity]', tr).value) } });
        await changed(res.message);
      } else if (remove) {
        const b = blocks.find((x) => String(x.id) === id);
        // Say how many upcoming bookings sit in these hours before asking.
        const imp = await api(`/api/doctors/${encodeURIComponent(doctorId)}/schedule/${encodeURIComponent(id)}/impact`);
        const n = imp.bookings.count;
        const booked = n ? `${n} appointment${n === 1 ? ' is' : 's are'} already booked in these hours (${G.date(imp.bookings.firstDate)}${imp.bookings.lastDate !== imp.bookings.firstDate ? ` to ${G.date(imp.bookings.lastDate)}` : ''}); ${n === 1 ? 'it is' : 'they are'} kept and can be moved from Appointments.` : 'No upcoming appointments are booked in these hours.';
        const ok = await G.confirm({ title: `Remove ${DAYS[b.dayOfWeek]} ${G.time(b.startTime)}–${G.time(b.endTime)}?`, body: `The doctor stops taking bookings in these hours from tomorrow. ${booked}`, action: 'Remove Hours', danger: true });
        if (!ok) return;
        const res = await api(`/api/doctors/${encodeURIComponent(doctorId)}/schedule/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await changed(res.message);
      }
    } catch (err) {
      G.toast(err.message, 'error');
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    G.clearErrors(form);
    G.setLoading(addBtn, true);
    try {
      const v = G.formValues(form);
      const res = await api(`/api/doctors/${encodeURIComponent(doctorId)}/schedule`, {
        method: 'POST',
        body: { dayOfWeek: Number(v.dayOfWeek), startTime: v.startTime, endTime: v.endTime, slotMinutes: Number(v.slotMinutes), capacityPerSlot: Number(v.capacityPerSlot) },
      });
      await changed(res.message);
    } catch (err) {
      G.showErrors(form, err.fields || {}, err.message);
    } finally {
      G.setLoading(addBtn, false);
    }
  });

  load();
}());
