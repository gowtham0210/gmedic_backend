/* Front-desk booking modal (BookAppointmentModal). Opened by any [data-open-book] button, which may
   carry data-doctor-id to preselect a doctor. Slots stream live from GET /api/doctors/:id/slots/stream
   while the modal is open, so a seat taken at another counter or in the Gmedic app greys out here within
   a second (if the stream can't be opened, GET /api/doctors/:id/slots is polled every 20 seconds instead).
   Normal appointments only: emergencies are registered with the separate Emergency Walk-in form (emergency-walkin.js).
   Fires `appointments:changed` after a booking. */
(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;
  const modal = $('#book-appointment-modal');
  if (!modal) return;

  const form = $('#book-form', modal);
  const grid = $('[data-slot-grid]', modal);
  const summary = $('[data-slot-summary]', modal);
  const submit = $('[data-book-submit]', modal);
  const submitLabel = $('[data-book-label]', modal);
  const liveState = $('[data-live-state]', modal);
  const REFRESH_MS = 20000;
  const hint = $('[data-patient-hint]', modal);
  const conflict = $('[data-patient-conflict]', modal);
  let picked = '';
  let slotsByTime = {};
  let timer = null;
  let source = null;       // the live EventSource, while the modal is open
  let found = null;      // the patient on file for the typed number, from /api/patients/lookup
  let chosen = null;     // { patientId } once the desk confirmed it is that person
  let different = false; // the desk confirmed it is someone else sharing the number
  let same = false;      // the desk confirmed it is the person who owns a number not yet known at this hospital
  let controller = null;
  let doctorsLoaded = false;

  async function loadDoctors() {
    if (doctorsLoaded) return;
    const data = await api('/api/doctors');
    form.elements.doctorId.insertAdjacentHTML('beforeend', data.doctors
      .map((d) => `<option value="${esc(d.id)}">${esc(d.name)} · ${esc(d.specialization)}</option>`).join(''));
    doctorsLoaded = true;
  }

  function seatsText(s) {
    if (s.status === 'unavailable') return 'Closed';
    if (s.status === 'full') return 'Full';
    return `${s.seatsLeft} of ${s.capacity} left`;
  }

  const pickable = (s) => s && s.status === 'available';

  // Why a slot cannot be picked, in a few words (null when it can). `closed` is the day-level reason from the
  // server (doctor on leave or absent, deactivated, hospital closed, date passed...).
  function whyDisabled(s, closed) {
    if (pickable(s)) return null;
    if (closed) return /doctor|leave|absent/i.test(closed) ? 'Doctor unavailable' : 'Day closed';
    if (s.status === 'unavailable') return 'Slot ended';
    return 'Normal capacity full';
  }

  function render(data) {
    const slots = data.slots;
    if (data.closedReason) {
      summary.textContent = data.closedReason;
    } else if (!slots.length) {
      summary.textContent = 'The doctor has no working hours on this day.';
    } else {
      const open = slots.filter((s) => s.status === 'available');
      const seats = open.reduce((n, s) => n + s.seatsLeft, 0);
      const walkIn = Math.max(...slots.map((s) => s.walkInSeats));
      summary.textContent = (open.length
        ? `${open.length} of ${slots.length} slots open · ${seats} seat${seats === 1 ? '' : 's'} left`
        : 'Every slot is full or closed for this day.')
        + (walkIn ? ` · ${walkIn} per slot held for walk-ins` : '');
    }
    slotsByTime = Object.fromEntries(slots.map((s) => [s.time, s]));
    const now = slotsByTime[picked];
    if (picked && !pickable(now)) {
      G.toast(`The ${G.time(picked)} slot just filled. Pick another time.`, 'error');
      picked = '';
    }
    grid.innerHTML = slots.map((s) => {
      const disabled = !pickable(s);
      // Seats left only for the desk: the app's share of this slot is used up.
      const why = whyDisabled(s, data.closedReason);
      const walkIn = why ? `<small class="slot__walkin">${esc(why)}</small>`
        : s.online.seatsLeft === 0 ? '<small class="slot__walkin">App full</small>' : '';
      return `<button type="button" role="radio" class="slot${disabled ? ' is-full' : ''}${s.time === picked ? ' is-selected' : ''}"
          data-slot="${esc(s.time)}" aria-checked="${s.time === picked}" ${disabled ? 'disabled aria-disabled="true"' : ''}
          title="${esc(`${why ? `${why}. ` : ''}${s.booked} booked of ${s.capacity}${s.walkInSeats ? ` · ${s.walkInSeats} held for walk-ins` : ''} · app: ${s.online.seatsLeft} left`)}">
          <span class="slot__time">${G.time(s.time)}</span>
          <span class="slot__seats">${seatsText(s)}</span>${walkIn}
        </button>`;
    }).join('');
  }

  async function loadSlots({ quiet = false } = {}) {
    const doctorId = form.elements.doctorId.value;
    const date = form.elements.date.value;
    if (!doctorId || !date) {
      grid.innerHTML = '';
      slotsByTime = {};
      summary.textContent = 'Choose a doctor and date to see free slots.';
      return;
    }
    if (controller) controller.abort();
    controller = new AbortController();
    if (!quiet) grid.innerHTML = '<div class="skeleton skeleton--row"></div>';
    try {
      render(await api(`/api/doctors/${encodeURIComponent(doctorId)}/slots?date=${encodeURIComponent(date)}`, { signal: controller.signal }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      grid.innerHTML = `<div class="alert alert--error">${icon('alert')}<span>${esc(err.message)}</span></div>`;
    }
  }

  // Live seats: one stream per doctor + date. If the browser or the server can't keep it open, fall back
  // to polling, and say which one is running so the desk knows how fresh the grid is.
  function startRefresh() {
    stopRefresh();
    const doctorId = form.elements.doctorId.value;
    const date = form.elements.date.value;
    if (!doctorId || !date) return;
    if (!window.EventSource) return startPolling();
    source = new EventSource(`/api/doctors/${encodeURIComponent(doctorId)}/slots/stream?date=${encodeURIComponent(date)}`);
    source.addEventListener('slots', (e) => {
      try { render(JSON.parse(e.data)); } catch { return; }
      liveState.textContent = 'Live';
    });
    source.addEventListener('problem', () => { stopRefresh(); startPolling(); });
    source.onerror = () => {
      // CONNECTING: the browser retries on its own. CLOSED: the server refused (e.g. session ended).
      if (source && source.readyState === EventSource.CLOSED) { stopRefresh(); startPolling(); } else liveState.textContent = 'Reconnecting…';
    };
  }
  function startPolling() {
    liveState.textContent = 'Updates every 20 s';
    timer = setInterval(() => { if (!document.hidden) loadSlots({ quiet: true }); }, REFRESH_MS);
  }
  function stopRefresh() {
    if (timer) clearInterval(timer);
    timer = null;
    if (source) source.close();
    source = null;
    liveState.textContent = '';
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-slot]');
    if (!btn || btn.disabled) return;
    picked = btn.dataset.slot;
    $$('[data-slot]', grid).forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-selected', on);
      b.setAttribute('aria-checked', String(on));
    });
    const err = $('[data-error-for="time"]', form);
    if (err) err.textContent = '';
  });

  const HINT_DEFAULT = 'If this number is already on file, you can pick that patient.';
  function resetPatientChoice() { found = null; chosen = null; different = false; same = false; conflict.hidden = true; hint.textContent = HINT_DEFAULT; }

  // When a full number is typed, say who is on file for it, so the desk uses them instead of retyping.
  async function lookupNumber() {
    const digits = String(form.elements.mobile.value || '').replace(/\D/g, '').slice(-10);
    resetPatientChoice();
    if (digits.length !== 10) return;
    try {
      const { patient, sharing } = await api(`/api/patients/lookup?mobile=${digits}`);
      if (String(form.elements.mobile.value || '').replace(/\D/g, '').slice(-10) !== digits) return; // typed on meanwhile
      found = patient;
      if (!patient) { hint.textContent = 'A new patient will be registered with this number.'; return; }
      if (patient.masked) { hint.textContent = `A patient (${patient.name}) is registered on Gmedic with this number. Enter the patient's name to continue.`; return; }
      const visits = `${patient.appointmentsHere} visit${patient.appointmentsHere === 1 ? '' : 's'} here${patient.lastVisit ? `, last ${G.date(patient.lastVisit)}` : ''}`;
      hint.innerHTML = `On file: <strong>${esc(patient.name)}</strong> (${esc(visits)})${sharing.length ? `; also shares this number: ${esc(sharing.map((s) => s.name).join(', '))}` : ''}.`;
      if (!form.elements.name.value.trim()) form.elements.name.value = patient.name;
      if (patient.gender && !form.elements.gender.value) form.elements.gender.value = patient.gender.toLowerCase();
    } catch { /* the booking itself still checks the number */ }
  }
  form.elements.mobile.addEventListener('input', G.debounce(lookupNumber, 300));
  // A choice made for one name does not carry over to another.
  form.elements.name.addEventListener('input', () => { chosen = null; different = false; same = false; conflict.hidden = true; });

  // The server found the number under another name: ask whether it is the same person.
  function askWho(fields) {
    $('[data-conflict-text]', conflict).textContent = `This number belongs to ${fields.existingPatientName}, but you entered "${form.elements.name.value.trim()}". Which is it?`;
    const sameBtn = $('[data-conflict-same]', conflict);
    const diff = $('[data-conflict-different]', conflict);
    sameBtn.textContent = `Same person: book for ${fields.existingPatientName}`;
    diff.textContent = `Different person sharing this number: ${form.elements.name.value.trim()}`;
    sameBtn.onclick = () => { if (fields.existingPatientId) chosen = { patientId: fields.existingPatientId }; else same = true; conflict.hidden = true; form.requestSubmit(); };
    diff.onclick = () => { different = true; conflict.hidden = true; form.requestSubmit(); };
    conflict.hidden = false;
  }

  form.elements.doctorId.addEventListener('change', () => { picked = ''; loadSlots(); startRefresh(); });
  form.elements.date.addEventListener('change', () => { picked = ''; loadSlots(); startRefresh(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = G.formValues(form);
    const errors = {};
    if (!v.doctorId) errors.doctorId = 'Choose a doctor.';
    if (!v.date) errors.date = 'Choose a date.';
    if (!picked) errors.time = 'Choose a free slot.';
    if (picked && !pickable(slotsByTime[picked])) errors.time = 'That slot is no longer free. Choose another.';
    if (!/^[6-9]\d{9}$/.test(String(v.mobile || '').replace(/\D/g, '').slice(-10))) errors['patient.mobile'] = 'Enter a valid 10-digit mobile number.';
    if (String(v.name || '').trim().length < 2) errors['patient.name'] = "Enter the patient's name.";
    if (Object.keys(errors).length) return G.showErrors(form, errors);

    G.clearErrors(form);
    G.setLoading(submit, true);
    try {
      const res = await api('/api/appointments', {
        method: 'POST',
        body: {
          doctorId: v.doctorId,
          date: v.date,
          time: picked,
          ...(chosen ? chosen : { patient: { name: v.name, mobile: v.mobile, gender: v.gender || undefined, ...(different ? { differentPerson: true } : {}), ...(same ? { samePerson: true } : {}) } }),
          reason: v.reason || undefined,
          channel: v.channel === 'phone' ? 'phone' : undefined,
        },
      });
      G.toast(res.message, 'success');
      G.modal.close(modal);
      document.dispatchEvent(new CustomEvent('appointments:changed', { detail: res.appointment }));
    } catch (err) {
      if (err.status === 409) loadSlots({ quiet: true });
      if (err.fields && err.fields.existingPatientName) { askWho(err.fields); return; }
      G.showErrors(form, err.fields || {}, err.message);
    } finally {
      G.setLoading(submit, false);
    }
  });

  async function open(doctorId) {
    form.reset();
    G.clearErrors(form);
    resetPatientChoice();
    picked = '';
    slotsByTime = {};
    grid.innerHTML = '';
    form.elements.date.min = G.todayISO();
    form.elements.date.value = G.todayISO();
    G.modal.open('book-appointment-modal');
    try {
      await loadDoctors();
    } catch (err) {
      G.showErrors(form, {}, err.message);
      return;
    }
    if (doctorId) form.elements.doctorId.value = doctorId;
    loadSlots();
    startRefresh();
  }

  modal.addEventListener('modal:close', stopRefresh);
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-book]');
    if (btn) open(btn.dataset.doctorId || '');
  });
}());
