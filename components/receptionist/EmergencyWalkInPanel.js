import Icon from '../Icon';

// Today's emergency walk-ins on the receptionist dashboard: counts and the active list, read from the real appointments and queue
// tokens (GET /api/emergency/summary, refreshed by public/js/emergency-summary.js). Nothing here is typed in by anyone.
// Every patient is in exactly one of awaiting triage / waiting for consultation / under consultation, so the three add up to
// "Active"; completed and cancelled patients are not active. The warning is only a workload alert, registration stays open.
export default function EmergencyWalkInPanel() {
  return (
    <article className="card card--flush" id="emergency-panel" style={{ marginBottom: 24 }}>
      <div className="card__head">
        <div>
          <h2 className="card__title"><Icon name="alert" />Emergency walk-ins today</h2>
          <p className="card__subtitle">Live from the queue. Completed and cancelled patients are not counted as active.</p>
        </div>
        <span className="badge badge--cancelled" hidden data-ew-intake>Intake paused</span>
      </div>

      <div className="alert alert--warning" role="alert" hidden data-ew-warning style={{ margin: '0 16px 14px', alignItems: 'flex-start' }}><Icon name="alert" /><span></span></div>

      <div className="ew-kpis" data-ew-kpis>
        <div className="kpi"><span>Active</span><strong data-ew-k="activeTotal">–</strong></div>
        <div className="kpi"><span>Awaiting triage</span><strong data-ew-k="awaitingTriage">–</strong></div>
        <div className="kpi"><span>Waiting for consultation</span><strong data-ew-k="waitingForConsultation">–</strong></div>
        <div className="kpi"><span>Under consultation</span><strong data-ew-k="underConsultation">–</strong></div>
        <div className="kpi"><span>Completed today</span><strong data-ew-k="completedToday">–</strong></div>
      </div>

      <div className="table-wrap" style={{ padding: '0 8px 8px' }}>
        <table className="table table--compact table--stack">
          <thead><tr><th>Token</th><th>Patient</th><th>Doctor</th><th>Registered</th><th>Triage</th><th>Status</th></tr></thead>
          <tbody data-ew-rows><tr><td colSpan={6}><div className="skeleton skeleton--row"></div></td></tr></tbody>
        </table>
      </div>
    </article>
  );
}
