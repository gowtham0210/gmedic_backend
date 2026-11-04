/* Emergency walk-in registration (EmergencyWalkInModal). Opened by any [data-open-emergency] button, which may carry
   data-doctor-id to preselect a doctor. The buttons are hidden until GET /api/emergency/options says this receptionist is
   allowed; the server checks the permission again on every registration. No slot is picked: the form posts
   { departmentId, doctorId, emergencyReason, patient } to POST /api/emergency/walk-ins, then shows the new emergency token.
   The doctor list shows each doctor's department and whether they can see an emergency now (the same availability and working
   hours the server rechecks at registration); an unavailable doctor cannot be picked. A high workload shows a warning with the
   hospital's escalation instructions, and never blocks the form. Fires `appointments:changed` after a registration. */
(function () {
  'use strict';
  const { $, $$, esc, api } = G;
  const modal = $('#emergency-walkin-modal');
  if (!modal) return;

  const form = $('#emergency-form', modal);
  const formBody = $('[data-ew-form]', modal);
  const resultBody = $('[data-ew-result]', modal);
  const notice = $('[data-ew-notice]', modal);
  const workloadNote = $('[data-ew-workload]', modal);
  const submit = $('[data-ew-submit]', modal);
  const another = $('[data-ew-another]', modal);
  const cancel = $('[data-ew-cancel]', modal);
  const list = $('[data-ew-doctors]', modal);
  const patientHint = $('[data-ew-patient-hint]', modal);
  const conflict = $('[data-ew-conflict]', modal);
  const HINT_DEFAULT = 'If this number is already on file, the patient is found automatically.';
  let options = null;
  let found = null;       // the patient on file for the typed number
  let chosen = null;      // { patientId } once the desk confirmed it is that person
  let different = false;  // the desk confirmed it is someone else sharing the number
  let same = false;       // the desk confirmed it is the person who owns a number not yet known at this hospital
  let picked = null;      // { id, departmentId } of the chosen doctor

  const allDoctors = () => options.departments.flatMap((dep) => dep.doctors.map((d) => ({ ...d, departmentId: dep.id, departmentName: dep.name })));
  const showNotice = (text) => { notice.hidden = !text; if (text) $('span', notice).textContent = text; };

  // Reveal the buttons for an allowed receptionist. (A failure here just leaves them hidden.)
  api('/api/emergency/options').then((o) => { $$('[data-open-emergency]').forEach((b) => { b.hidden = !o.allowed; }); }).catch(() => {});

  // What stops a registration for the whole hospital, before a doctor is even chosen.
  function intakeBlocker() {
    const i = options.intake;
    if (!options.allowed) return 'You are not allowed to register emergency walk-ins. Ask an administrator to enable Emergency Booking for your account.';
    if (i.status === 'PAUSED') return `Emergency walk-ins are paused at this hospital${i.reason ? `: ${i.reason}.` : '.'}${i.referralNote ? ` ${i.referralNote}` : ' Follow the hospital\'s emergency escalation procedure.'}`;
    return '';
  }

  function renderDoctors() {
    const filter = form.elements.departmentFilter.value;
    const doctors = allDoctors().filter((d) => !filter || d.departmentId === filter);
    const eligible = allDoctors().filter((d) => d.available).length;
    const blocker = intakeBlocker();
    let text = blocker;
    if (!text && eligible === 0) text = `No doctor can see an emergency walk-in right now (everyone is absent, on leave, not working today or finished for the day). ${options.intake.referralNote || 'Follow the hospital\'s emergency escalation procedure.'}`;
    showNotice(text);
    if (picked && !doctors.some((d) => d.id === picked.id && d.available)) picked = null;
    list.innerHTML = doctors.length ? doctors.map((d) => `
      <label class="ew-doctor${d.available ? '' : ' is-disabled'}${picked && picked.id === d.id ? ' is-selected' : ''}">
        <input type="radio" name="doctorId" value="${esc(d.id)}" data-dept="${esc(d.departmentId)}" ${d.available && !blocker ? '' : 'disabled'} ${picked && picked.id === d.id ? 'checked' : ''}>
        <span class="ew-doctor__main"><strong>${esc(d.name)}</strong><small>${esc(d.departmentName)}${d.specialization ? ` · ${esc(d.specialization)}` : ''}</small></span>
        <span class="ew-doctor__status">
          <span class="badge badge--${d.available ? 'confirmed' : 'neutral'}">${d.available ? 'Available now' : 'Unavailable'}</span>
          ${d.available ? '' : `<small>${esc(d.reason || '')}</small>`}
        </span>
      </label>`).join('') : '<p class="text-muted" style="margin:0">No doctors in this department.</p>';
    submit.disabled = !!blocker || !picked;
  }

  function showWorkload(w) {
    workloadNote.hidden = !(w && w.warning);
    if (w && w.warning) $('span', workloadNote).textContent = w.escalation;
  }

  list.addEventListener('change', (e) => {
    const r = e.target.closest('input[name="doctorId"]');
    if (!r) return;
    picked = { id: r.value, departmentId: r.dataset.dept };
    $$('.ew-doctor', list).forEach((el) => el.classList.toggle('is-selected', el.contains(r)));
    G.clearErrors(form);
    submit.disabled = !!intakeBlocker();
  });

  function resetPatientChoice() { found = null; chosen = null; different = false; same = false; conflict.hidden = true; patientHint.textContent = HINT_DEFAULT; }

  async function lookupNumber() {
    const digits = String(form.elements.mobile.value || '').replace(/\D/g, '').slice(-10);
    resetPatientChoice();
    if (digits.length !== 10) return;
    try {
      const { patient } = await api(`/api/patients/lookup?mobile=${digits}`);
      if (String(form.elements.mobile.value || '').replace(/\D/g, '').slice(-10) !== digits) return;
      found = patient;
      if (!patient) { patientHint.textContent = 'A new patient will be registered with this number.'; return; }
      if (patient.masked) { patientHint.textContent = "A patient is registered on Gmedic with this number. Enter the patient's name to continue."; return; }
      patientHint.innerHTML = `On file: <strong>${esc(patient.name)}</strong>.`;
      if (!form.elements.name.value.trim()) form.elements.name.value = patient.name;
      if (patient.gender && !form.elements.gender.value) form.elements.gender.value = patient.gender.toLowerCase();
    } catch { /* the registration itself checks the number */ }
  }
  form.elements.mobile.addEventListener('input', G.debounce(lookupNumber, 300));
  form.elements.name.addEventListener('input', () => { chosen = null; different = false; same = false; conflict.hidden = true; });

  // The number is on file under another name: ask whether it is the same person.
  function askWho(fields) {
    $('[data-ew-conflict-text]', conflict).textContent = `This number belongs to ${fields.existingPatientName}, but you entered "${form.elements.name.value.trim()}". Which is it?`;
    const sameBtn = $('[data-ew-same]', conflict);
    const diff = $('[data-ew-different]', conflict);
    sameBtn.textContent = `Same person: register ${fields.existingPatientName}`;
    diff.textContent = `Different person sharing this number: ${form.elements.name.value.trim()}`;
    sameBtn.onclick = () => { if (fields.existingPatientId) chosen = { patientId: fields.existingPatientId }; else same = true; conflict.hidden = true; form.requestSubmit(); };
    diff.onclick = () => { different = true; conflict.hidden = true; form.requestSubmit(); };
    conflict.hidden = false;
  }

  form.elements.departmentFilter.addEventListener('change', renderDoctors);

  function showResult(res) {
    const a = res.appointment;
    $('[data-ew-message]', modal).textContent = res.message;
    $('[data-ew-token]', modal).textContent = a.tokenCode;
    $('[data-ew-r-patient]', modal).textContent = `${a.patientName} · ${a.patientMobile || ''}`.replace(/ · $/, '');
    $('[data-ew-r-doctor]', modal).textContent = a.doctorName;
    $('[data-ew-r-time]', modal).textContent = new Date(a.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    $('[data-ew-r-status]', modal).textContent = 'Waiting · awaiting triage by the doctor';
    $('[data-ew-r-reason]', modal).textContent = a.emergencyReason || '';
    const warn = $('[data-ew-r-warning]', modal);
    warn.hidden = !(res.workload && res.workload.warning);
    if (!warn.hidden) $('span', warn).textContent = res.workload.escalation;
    formBody.hidden = true;
    resultBody.hidden = false;
    submit.hidden = true;
    another.hidden = false;
    cancel.textContent = 'Close';
  }

  function showForm() {
    formBody.hidden = false;
    resultBody.hidden = true;
    submit.hidden = false;
    another.hidden = true;
    cancel.textContent = 'Cancel';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = G.formValues(form);
    const errors = {};
    if (!picked) errors.doctorId = 'Choose a doctor who is available now.';
    if (!/^[6-9]\d{9}$/.test(String(v.mobile || '').replace(/\D/g, '').slice(-10))) errors['patient.mobile'] = 'Enter a valid 10-digit mobile number.';
    if (String(v.name || '').trim().length < 2) errors['patient.name'] = "Enter the patient's name.";
    const reason = String(v.emergencyReason || '').trim();
    if (reason.length < 3 || reason.length > 300) errors.emergencyReason = 'Enter the emergency reason (3 to 300 characters).';
    if (Object.keys(errors).length) return G.showErrors(form, errors);

    G.clearErrors(form);
    G.setLoading(submit, true);
    try {
      const res = await api('/api/emergency/walk-ins', {
        method: 'POST',
        body: {
          departmentId: picked.departmentId,
          doctorId: picked.id,
          emergencyReason: reason,
          ...(chosen ? chosen : { patient: { name: v.name, mobile: v.mobile, gender: v.gender || undefined, ...(different ? { differentPerson: true } : {}), ...(same ? { samePerson: true } : {}) } }),
        },
      });
      G.toast(res.message, 'success');
      showResult(res);
      document.dispatchEvent(new CustomEvent('appointments:changed', { detail: res.appointment }));
    } catch (err) {
      if (err.fields && err.fields.existingPatientName) { askWho(err.fields); return; }
      // Only plain field messages go to the fields; the referral note and alternatives are in the message.
      const fields = Object.fromEntries(Object.entries(err.fields || {}).filter(([, msg]) => typeof msg === 'string'));
      G.showErrors(form, fields, err.message);
      // The server rechecks availability at registration: refresh the list so a doctor who just became unavailable is greyed out.
      try { options = await api('/api/emergency/options'); showWorkload(options.workload); renderDoctors(); } catch { /* the form keeps what it had */ }
    } finally {
      G.setLoading(submit, false);
    }
  });

  async function open(doctorId) {
    form.reset();
    G.clearErrors(form);
    resetPatientChoice();
    showForm();
    showNotice('');
    showWorkload(null);
    picked = null;
    G.modal.open('emergency-walkin-modal');
    try {
      options = await api('/api/emergency/options');
    } catch (err) {
      G.showErrors(form, {}, err.message);
      return;
    }
    $('[data-ew-hospital]', modal).value = options.hospital.name;
    form.elements.departmentFilter.innerHTML = '<option value="">All departments</option>' + options.departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
    const wanted = doctorId && allDoctors().find((d) => d.id === doctorId && d.available);
    if (wanted) picked = { id: wanted.id, departmentId: wanted.departmentId };
    showWorkload(options.workload);
    renderDoctors();
  }

  another.addEventListener('click', () => open(''));
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-open-emergency]');
    if (btn) open(btn.dataset.doctorId || '');
  });
}());
