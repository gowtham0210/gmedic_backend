/* Emergency walk-in panel of the receptionist dashboard (EmergencyWalkInPanel). Reads GET /api/emergency/summary: today's counts
   and the active list, counted by the server from the real appointments and queue tokens. Refreshes every 15 seconds, and at once
   after a registration (`appointments:changed`). A workload warning is shown from the server's message; it never blocks anything. */
(function () {
  'use strict';
  const { $, $$, esc, api } = G;
  const panel = $('#emergency-panel');
  if (!panel) return;

  const rows = $('[data-ew-rows]', panel);
  const warning = $('[data-ew-warning]', panel);
  const intakeBadge = $('[data-ew-intake]', panel);
  const TRIAGE = { CRITICAL: ['emergency', 'Critical'], URGENT: ['pending', 'Urgent'], SEMI_URGENT: ['called', 'Semi-urgent'], NON_URGENT: ['neutral', 'Non-urgent'] };
  const STATUS = { waiting: 'Waiting', called: 'Called', in_consultation: 'In consultation', skipped: 'Skipped' };

  function render(s) {
    for (const key of ['activeTotal', 'awaitingTriage', 'waitingForConsultation', 'underConsultation', 'completedToday']) $(`[data-ew-k="${key}"]`, panel).textContent = s[key];
    warning.hidden = !s.warning;
    if (s.warning) $('span', warning).textContent = s.escalation;
    intakeBadge.hidden = s.intake.status !== 'PAUSED';
    if (!s.active.length) {
      rows.innerHTML = G.emptyRow(6, 'No active emergency walk-ins', 'Patients registered through Emergency Walk-in appear here until they are completed or cancelled.', 'check-circle');
      return;
    }
    rows.innerHTML = s.active.map((a) => {
      const triage = a.triage ? `<span class="badge badge--${TRIAGE[a.triage][0]}">${TRIAGE[a.triage][1]}</span>` : '<span class="badge badge--pending">Awaiting triage</span>';
      return `<tr>
        <td data-label="Token" class="cell-primary mono">${esc(a.token)}</td>
        <td data-label="Patient">${esc(a.patientName)}<span class="cell-sub">${esc(a.reason || '')}</span></td>
        <td data-label="Doctor">${esc(a.doctorName)}</td>
        <td data-label="Registered" class="nowrap">${esc(new Date(a.registeredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</td>
        <td data-label="Triage">${triage}</td>
        <td data-label="Status"><span class="badge badge--${esc(a.consultationStatus)}">${esc(STATUS[a.consultationStatus] || a.consultationStatus)}</span></td>
      </tr>`;
    }).join('');
  }

  async function load() {
    try { render(await api('/api/emergency/summary')); } catch { /* keep what is shown; the next refresh tries again */ }
  }

  document.addEventListener('appointments:changed', load);
  setInterval(() => { if (!document.hidden) load(); }, 15000);
  load();
}());
