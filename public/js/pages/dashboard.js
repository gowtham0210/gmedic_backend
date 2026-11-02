(function () {
  'use strict';
  const { $, esc, icon, api } = G;

  /* ---------- Greeting & date ---------- */
  function tick() {
    const now = new Date();
    const h = now.getHours();
    $('[data-greeting]').textContent = h < 12 ? 'Good Morning' : h < 17 ? 'Good Afternoon' : 'Good Evening';
    $('[data-today-date]').textContent = G.date(G.todayISO());
    $('[data-today-day]').textContent = now.toLocaleDateString('en-GB', { weekday: 'long' });
    $('[data-today-time]').textContent = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 30 * 1000);

  /* ---------- Summary cards ---------- */
  function statCard({ href, tone, iconName, label, value, meta, metaClass = '', valueClass = '' }) {
    return `<a class="card stat fade-in" href="${href}">
      <span class="stat__icon ${tone}">${icon(iconName)}</span>
      <div style="min-width:0">
        <div class="stat__label">${esc(label)}</div>
        <div class="stat__value ${valueClass}">${esc(value)}</div>
        <div class="stat__meta ${metaClass}">${meta}</div>
      </div>
    </a>`;
  }

  function renderStats(s) {
    const change = s.changePct;
    const changeMeta = s.yesterdayAppointments
      ? `${icon(change >= 0 ? 'arrow-up' : 'arrow-down')}${Math.abs(change)}% from yesterday`
      : 'No appointments yesterday';
    $('#stats').innerHTML = [
      statCard({
        href: '/doctors', tone: 'tone-blue', iconName: 'user', label: 'Total Doctors', value: s.totalDoctors,
        meta: s.newThisMonth ? `${icon('arrow-up')}${s.newThisMonth} new this month` : 'No new doctors this month',
        metaClass: s.newThisMonth ? 'is-up' : '',
      }),
      statCard({
        href: '/doctors?availability=present', tone: 'tone-green', iconName: 'user-check', label: 'Present Today',
        value: s.present, meta: `${s.presentPct}% of total doctors`,
      }),
      statCard({
        href: '/doctors?availability=absent', tone: 'tone-red', iconName: 'user-x', label: 'On Leave / Absent',
        value: s.absent, valueClass: s.absent ? 'value-red' : '', meta: `${s.absentPct}% of total doctors`,
      }),
      statCard({
        href: '/appointments?date=today', tone: 'tone-violet', iconName: 'calendar', label: "Today's Appointments",
        value: s.todayAppointments, meta: changeMeta, metaClass: s.yesterdayAppointments ? (change >= 0 ? 'is-up' : 'is-down') : '',
      }),
      statCard({
        href: '/payments?range=today', tone: 'tone-teal', iconName: 'receipt', label: 'Paid Appointments',
        value: s.paidToday, meta: `${s.paidPct}% payment completed`, metaClass: 'is-up',
      }),
    ].join('');
  }

  /* ---------- Doctor availability ---------- */
  function renderAvailability(a) {
    const R = 58;
    const C = 2 * Math.PI * R;
    const presentLen = a.total ? (a.present / a.total) * C : 0;
    const absentLen = a.total ? (a.absent / a.total) * C : 0;
    const gap = a.present && a.absent ? 3 : 0;

    const qv = a.bySpecialization.slice(0, 6).map((s) => `
      <div class="quickview__item" title="${esc(s.name)}: ${s.present} of ${s.total} present">
        <span class="qv-icon">${icon(G.specIcon(s.name))}</span>
        <span class="qv-name">${esc(s.name)}</span>
        <strong>${s.total}</strong>
      </div>`).join('');

    $('[data-availability]').innerHTML = `
      <div class="donut-row">
        <div class="donut" role="img" aria-label="${a.present} of ${a.total} doctors present, ${a.absent} on leave or absent">
          <svg viewBox="0 0 140 140">
            <circle class="donut__track" cx="70" cy="70" r="${R}"></circle>
            <circle class="donut__seg" data-seg="present" cx="70" cy="70" r="${R}" stroke="#0A8F8C" stroke-dasharray="0 ${C}"></circle>
            <circle class="donut__seg" data-seg="absent" cx="70" cy="70" r="${R}" stroke="#EF6461" stroke-dasharray="0 ${C}" stroke-dashoffset="${-presentLen}"></circle>
          </svg>
          <div class="donut__center"><strong>${a.total}</strong><span>Total Doctors</span></div>
        </div>
        <div class="legend">
          <div class="legend__item"><span><i class="legend__dot" style="background:#0A8F8C"></i>Present</span><strong>${a.present}</strong></div>
          <div class="legend__item"><span><i class="legend__dot" style="background:#EF6461"></i>On Leave</span><strong>${a.absent}</strong></div>
          <button type="button" class="btn btn--ghost btn--sm" data-open-availability style="margin-top:4px">${icon('user-check')}Update</button>
        </div>
      </div>
      <div class="quickview">
        <h3>Quick View</h3>
        <div class="quickview__grid">${qv || '<p class="text-muted">No doctors yet.</p>'}</div>
      </div>`;

    // Animate the segments in.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const p = $('[data-seg="present"]');
      const ab = $('[data-seg="absent"]');
      if (p) p.setAttribute('stroke-dasharray', `${Math.max(presentLen - gap, 0)} ${C}`);
      if (ab) ab.setAttribute('stroke-dasharray', `${Math.max(absentLen - gap, 0)} ${C}`);
    }));
  }

  /* ---------- Tables ---------- */
  function renderToday(rows, total) {
    const tbody = $('[data-today-rows]');
    if (!rows.length) {
      tbody.innerHTML = G.emptyRow(6, 'No appointments today', 'New bookings will appear here.', 'calendar');
      return;
    }
    tbody.innerHTML = rows.map((a) => `
      <tr class="is-clickable" data-appt="${esc(a.id)}" tabindex="0">
        <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(a.patientName, 'sm')}<span class="person__name">${esc(a.patientName)}</span></div></td>
        <td data-label="Doctor">${esc(a.doctorName)}</td>
        <td data-label="Specialist" class="text-muted">${esc(a.specialization)}</td>
        <td data-label="Time" class="mono">${G.time(a.time)}</td>
        <td data-label="Status">${G.badge(a.status)}</td>
        <td data-label="Payment">${G.badge(a.paymentStatus)}</td>
      </tr>`).join('');
    const title = $('#today-card .card__title');
    title.innerHTML = `${icon('calendar')}Today's Appointments <span class="badge badge--teal badge--plain">${total}</span>`;
  }

  function renderRecent(rows) {
    const tbody = $('[data-recent-rows]');
    if (!rows.length) {
      tbody.innerHTML = G.emptyRow(8, 'No recent appointments', 'New bookings will appear here.', 'calendar');
      return;
    }
    tbody.innerHTML = rows.map((a) => `
      <tr class="is-clickable" data-appt="${esc(a.id)}" tabindex="0">
        <td data-label="Date" class="nowrap">${esc(G.date(a.date))}</td>
        <td class="cell-primary" data-label="Patient"><div class="person">${G.avatar(a.patientName, 'sm')}<span class="person__name">${esc(a.patientName)}</span></div></td>
        <td data-label="Doctor">${esc(a.doctorName)}</td>
        <td data-label="Specialist" class="text-muted">${esc(a.specialization)}</td>
        <td data-label="Time" class="mono">${G.time(a.time)}</td>
        <td data-label="Fee" class="num fee">${G.money(a.fee)}</td>
        <td data-label="Payment">${G.badge(a.paymentStatus)}</td>
        <td data-label="Status">${G.badge(a.status)}</td>
      </tr>`).join('');
  }

  /* ---------- Today's tokens ---------- */
  function renderTokens(t) {
    const calling = t.nowCalling.length
      ? `<div class="token-now">${icon('megaphone')}<span>Now calling <strong>${t.nowCalling.map((c) => esc(c.code)).join(', ')}</strong> · ${esc(t.nowCalling[0].patientName)} with ${esc(t.nowCalling[0].doctorName)}</span></div>`
      : `<div class="token-now is-idle">${icon('megaphone')}<span>No token is being called right now.</span></div>`;
    $('[data-token-summary]').innerHTML = `
      <div class="token-stats">
        <div class="token-stat token-stat--total"><strong>${t.total}</strong><span><em>Total</em></span></div>
        <div class="token-stat token-stat--waiting"><strong>${t.waiting}</strong><span><em>Waiting</em></span></div>
        <div class="token-stat token-stat--called"><strong>${t.called}</strong><span><em>Called</em></span></div>
        <div class="token-stat token-stat--completed"><strong>${t.completed}</strong><span><em>Completed</em></span></div>
      </div>
      ${calling}
      <a class="btn btn--outline btn--block" href="/tokens" style="margin-top:14px">${icon('ticket')}Manage Tokens ${icon('arrow-right')}</a>`;
  }

  async function load() {
    try {
      const data = await api('/api/dashboard');
      renderStats(data.stats);
      renderAvailability(data.availability);
      renderToday(data.today, data.todayTotal);
      renderRecent(data.recent);
      renderTokens(data.tokens);
    } catch (err) {
      G.toast(err.message, 'error');
      $('#stats').innerHTML = `<div class="card alert alert--error" style="grid-column:1/-1">${icon('alert')}<span>Couldn't load the dashboard. ${esc(err.message)}</span></div>`;
    }
  }

  // Rows open the appointment details (cancel, reschedule, collect payment) in place.
  for (const sel of ['[data-today-rows]', '[data-recent-rows]']) {
    const tbody = $(sel);
    const open = (row) => row && G.openAppointment && G.openAppointment(row.dataset.appt);
    tbody.addEventListener('click', (e) => open(e.target.closest('[data-appt]')));
    tbody.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(e.target.closest('[data-appt]')); });
  }

  load();
  document.addEventListener('doctors:changed', load);
  document.addEventListener('appointments:changed', load);
})();
