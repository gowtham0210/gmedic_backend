/* Walk-in seats card on the receptionist's doctor page: per schedule block, how many seats of each
   slot are held back for front-desk bookings (the Gmedic app can book the rest), and how many emergency
   walk-ins (0-3) a full slot can still take. GET/PUT /api/doctors/:id/walk-in-seats. */
(function () {
  'use strict';
  const { $, $$, esc, api } = G;
  const card = $('[data-walkin-card]');
  const root = $('[data-doctor-id]');
  if (!card || !root) return;

  const doctorId = root.dataset.doctorId;
  const form = $('[data-walkin-form]', card);
  const tbody = $('[data-walkin-rows]', card);
  const save = $('[data-walkin-save]', card);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let blocks = [];

  function when(b) {
    if (b.effectiveFrom && b.effectiveFrom > G.todayISO()) return `From ${G.date(b.effectiveFrom)}`;
    if (b.effectiveTo) return `Until ${G.date(b.effectiveTo)}`;
    return '';
  }

  function render() {
    if (!blocks.length) {
      tbody.innerHTML = G.emptyRow(5, 'No working hours yet', 'Add working hours above first; then set how many seats of each slot are held for walk-ins.', 'calendar');
      save.disabled = true;
      return;
    }
    tbody.innerHTML = blocks.map((b) => `
      <tr data-block="${b.scheduleId}">
        <td data-label="Hours"><span class="nowrap">${DAYS[b.dayOfWeek]} ${G.time(b.startTime)}–${G.time(b.endTime)}</span>${when(b) ? `<br><small class="text-muted">${esc(when(b))}</small>` : ''}</td>
        <td data-label="Per slot" class="num">${b.capacityPerSlot}</td>
        <td data-label="Walk-in" class="num">
          <input class="input" type="number" inputmode="numeric" min="0" max="${b.capacityPerSlot}" step="1" value="${b.walkInSeats}"
            style="width:72px;height:32px;text-align:right" aria-label="Walk-in seats, ${DAYS[b.dayOfWeek]} ${esc(b.startTime)}" data-walkin-input>
        </td>
        <td data-label="App" class="num" data-online>${b.onlineSeats}</td>
        <td data-label="Emergency" class="num">
          <input class="input" type="number" inputmode="numeric" min="0" max="3" step="1" value="${b.emergencySeats}"
            style="width:72px;height:32px;text-align:right" aria-label="Emergency walk-ins over a full slot, ${DAYS[b.dayOfWeek]} ${esc(b.startTime)}" data-emergency-input>
        </td>
      </tr>`).join('');
    save.disabled = true;
  }

  async function load() {
    try {
      blocks = (await api(`/api/doctors/${encodeURIComponent(doctorId)}/walk-in-seats`)).blocks;
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="alert alert--error">${G.icon('alert')}<span>${esc(err.message)}</span></div></td></tr>`;
    }
  }

  // Changed rows: [{ block, seats, emergency }]
  function changes() {
    return $$('[data-block]', tbody).map((tr) => {
      const block = blocks.find((b) => String(b.scheduleId) === tr.dataset.block);
      const seats = Number($('[data-walkin-input]', tr).value);
      const emergency = Number($('[data-emergency-input]', tr).value);
      return { block, seats, emergency, tr };
    }).filter((c) => c.seats !== c.block.walkInSeats || c.emergency !== c.block.emergencySeats);
  }

  const validEmergency = (n) => Number.isInteger(n) && n >= 0 && n <= 3;

  tbody.addEventListener('input', (e) => {
    const input = e.target.closest('[data-walkin-input], [data-emergency-input]');
    if (!input) return;
    const tr = input.closest('[data-block]');
    const block = blocks.find((b) => String(b.scheduleId) === tr.dataset.block);
    const value = Number(input.value);
    if (input.matches('[data-emergency-input]')) {
      input.closest('td').classList.toggle('has-error', !validEmergency(value));
    } else {
      const valid = Number.isInteger(value) && value >= 0 && value <= block.capacityPerSlot;
      input.closest('td').classList.toggle('has-error', !valid);
      $('[data-online]', tr).textContent = valid ? block.capacityPerSlot - value : '–';
    }
    save.disabled = !changes().length || $$('td.has-error', tbody).length > 0;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const todo = changes();
    const bad = todo.find((c) => !Number.isInteger(c.seats) || c.seats < 0 || c.seats > c.block.capacityPerSlot);
    if (bad) return G.showErrors(form, {}, `Walk-in seats must be 0 to ${bad.block.capacityPerSlot} for ${DAYS[bad.block.dayOfWeek]} ${bad.block.startTime}.`);
    const badEmergency = todo.find((c) => !validEmergency(c.emergency));
    if (badEmergency) return G.showErrors(form, {}, `Emergency walk-ins must be 0 to 3 for ${DAYS[badEmergency.block.dayOfWeek]} ${badEmergency.block.startTime}.`);
    G.clearErrors(form);
    G.setLoading(save, true);
    try {
      for (const c of todo) {
        await api(`/api/doctors/${encodeURIComponent(doctorId)}/walk-in-seats`, { method: 'PUT', body: { walkInSeats: c.seats, emergencySeats: c.emergency, scheduleId: c.block.scheduleId } });
      }
      G.toast(`Walk-in and emergency seats saved for ${todo.length} block${todo.length === 1 ? '' : 's'}.`, 'success');
      await load();
    } catch (err) {
      G.showErrors(form, {}, err.message);
    } finally {
      G.setLoading(save, false);
      save.disabled = !changes().length;
    }
  });

  // Hours added or removed above change the blocks listed here.
  document.addEventListener('doctor:hours-changed', load);
  load();
}());
