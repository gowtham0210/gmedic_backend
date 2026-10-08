'use client';

import { useEffect, useRef } from 'react';
import { formatShortDate } from '../../lib/format';

// Shared restrained styling: the data line is the primary visual, area fills
// are a faint supporting layer, and gridlines are barely there (horizontal
// only, no axis borders).
const FONT = { family: "'Plus Jakarta Sans', sans-serif" };
const GRID = 'rgba(15, 38, 61, 0.06)';
const TICKS = { font: FONT, color: '#7a8796' };
const AREA = 'rgba(10, 143, 140, 0.04)';
const valueAxis = (extra = {}) => ({ ticks: TICKS, grid: { color: GRID }, border: { display: false }, ...extra });
const categoryAxis = (extra = {}) => ({ ticks: TICKS, grid: { display: false }, border: { display: false }, ...extra });
const LINE = { tension: 0.25, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHitRadius: 12 };
// A series that is zero across the whole range is left out of the chart and
// its legend, so the legend never lists a line the reader can't find.
const hasValues = (ds) => ds.data.some((v) => Number(v) !== 0);
const byDataset = (a, b) => a.datasetIndex - b.datasetIndex;
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

// Small dependency-free wrapper: loads Chart.js from the CDN copy already
// bundled in node_modules (served by Next as a static import) once, then
// draws the booking and revenue charts. The QR funnel (HTML, not a chart) is
// rendered when `qrFunnel` is passed (Analytics shows it; the Dashboard doesn't).
// `children` are extra cards placed in the same grid (Analytics adds Hospital Growth).
export default function DashboardCharts({ bookingTrend, revenueTrend, qrFunnel, children }) {
  const bookingRef = useRef(null);
  const revenueRef = useRef(null);
  const chartsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled) return;
      const destroyAll = () => { chartsRef.current.forEach((c) => c.destroy()); chartsRef.current = []; };
      destroyAll();

      const teal = '#0A8F8C';
      const navy = '#0F263D';
      const red = '#EF6461';
      const font = FONT;

      chartsRef.current.push(new Chart(bookingRef.current, {
        type: 'line',
        data: {
          labels: bookingTrend.map((r) => formatShortDate(r.date)),
          datasets: [
            { label: 'Booked', data: bookingTrend.map((r) => r.booked), borderColor: teal, backgroundColor: AREA, fill: true, ...LINE, borderWidth: 2.5, pointBackgroundColor: teal },
            // Drawn on top (order -1): on days where every booking was completed the
            // two lines coincide, and Booked would otherwise hide Completed entirely.
            // Square hover marker (Booked/Cancelled use circles) so identical values still read as two series.
            { label: 'Completed', data: bookingTrend.map((r) => r.completed), borderColor: navy, borderDash: [4, 3], ...LINE, borderWidth: 1.75, order: -1, pointStyle: 'rect', pointBackgroundColor: navy, pointHoverRadius: 4.5 },
            { label: 'Cancelled', data: bookingTrend.map((r) => r.cancelled), borderColor: red, ...LINE, borderWidth: 1.75, pointBackgroundColor: red },
          ].filter(hasValues),
        },
        options: {
          responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
          // Keep legend/tooltip in reading order (Booked, Completed, Cancelled) despite the draw order above.
          plugins: { legend: { position: 'bottom', labels: { font, boxWidth: 10, sort: byDataset } }, tooltip: { itemSort: byDataset } },
          scales: { x: categoryAxis(), y: valueAxis({ beginAtZero: true }) },
        },
      }));

      const revenueSets = [
        { label: 'Gross revenue (₹)', data: revenueTrend.map((r) => r.gross), backgroundColor: teal, borderRadius: 4 },
        { label: 'Refunded (₹)', data: revenueTrend.map((r) => -r.refunded), backgroundColor: red, borderRadius: 4 },
      ].filter(hasValues);
      chartsRef.current.push(new Chart(revenueRef.current, {
        type: 'bar',
        data: { labels: revenueTrend.map((r) => formatShortDate(r.date)), datasets: revenueSets },
        // A one-series legend adds nothing; the totals in the card header name it.
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: revenueSets.length > 1, position: 'bottom', labels: { font, boxWidth: 10 } } }, scales: { x: categoryAxis({ stacked: true }), y: valueAxis({ stacked: true }) } },
      }));

    });
    return () => { cancelled = true; chartsRef.current.forEach((c) => c.destroy()); chartsRef.current = []; };
  }, [bookingTrend, revenueTrend]);

  // Period totals, shown as figures so a ₹0 refund total is stated, not implied by an invisible bar.
  const grossTotal = revenueTrend.reduce((t, r) => t + r.gross, 0);
  const refundedTotal = revenueTrend.reduce((t, r) => t + r.refunded, 0);

  return (
    <div className="dash-grid dash-grid--charts" style={{ marginBottom: 24 }}>
      <article className="card">
        <div className="card__head"><div><h2 className="card__title">Booking Overview</h2><p className="card__subtitle">Last 14 days · bookings by status</p></div></div>
        <div style={{ height: 220 }}><canvas ref={bookingRef}></canvas></div>
      </article>
      <article className="card">
        <div className="card__head">
          <div><h2 className="card__title">Revenue Overview</h2><p className="card__subtitle">Last 14 days · gross revenue vs refunds</p></div>
          <dl className="chart-totals">
            <div><dt>Gross</dt><dd>{money(grossTotal)}</dd></div>
            <div><dt>Refunded</dt><dd className={refundedTotal > 0 ? 'is-red' : undefined}>{money(refundedTotal)}</dd></div>
          </dl>
        </div>
        <div style={{ height: 220 }}><canvas ref={revenueRef}></canvas></div>
      </article>
      {qrFunnel && (
        <article className="card">
          <QrFunnel funnel={qrFunnel} />
        </article>
      )}
      {children}
    </div>
  );
}

const pct = (part, whole) => (whole > 0 ? `${Math.round((part / whole) * 1000) / 10}%` : '—');

// QR funnel as sequential stages: each stage is a subset of the one before
// (see lib/admin/getDashboardData.js), so the step and overall conversion
// rates are real. Bar widths are relative to QR scans.
function QrFunnel({ funnel }) {
  const stages = [
    { label: 'QR Scans', value: funnel.scans },
    { label: 'Hospital Links', value: funnel.linked },
    { label: 'Bookings', value: funnel.bookings },
    { label: 'Payments', value: funnel.payments },
  ];
  const top = funnel.scans;
  return (
    <>
      <div className="card__head">
        <div><h2 className="card__title">QR Funnel</h2><p className="card__subtitle">Last 30 days · scan to paid booking</p></div>
        <dl className="chart-totals">
          <div><dt>Scan → paid booking</dt><dd>{pct(funnel.payments, top)}</dd></div>
        </dl>
      </div>
      {top === 0 ? (
        <div className="empty chart-empty">
          <h3>No QR scans in the last 30 days</h3>
          <p>Conversion will appear once patients start scanning hospital QR codes.</p>
        </div>
      ) : (
        <ol className="funnel">
          {stages.map((st, i) => (
            <li key={st.label}>
              {i > 0 && <p className="funnel__step"><span aria-hidden="true">↓</span> {pct(st.value, stages[i - 1].value)} <span className="sr-only">of {stages[i - 1].label}</span></p>}
              <div className="funnel__row">
                <span className="funnel__label">{st.label}</span>
                <span className="funnel__value">{st.value.toLocaleString('en-IN')}</span>
              </div>
              <div className="funnel__track"><div className="funnel__bar" style={{ width: `${(st.value / top) * 100}%`, minWidth: st.value > 0 ? 2 : 0 }} /></div>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

const fmtMonth = (ym) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });

export function HospitalGrowthChart({ hospitalGrowth }) {
  const ref = useRef(null);
  const hasData = hospitalGrowth.some((r) => r.count > 0);
  useEffect(() => {
    if (!hasData) return undefined;
    let chart;
    let cancelled = false;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled) return;
      chart = new Chart(ref.current, {
        type: 'line',
        data: { labels: hospitalGrowth.map((r) => fmtMonth(r.month)), datasets: [{ label: 'New hospitals', data: hospitalGrowth.map((r) => r.count), borderColor: '#0A8F8C', backgroundColor: AREA, fill: true, ...LINE, borderWidth: 2.5 }] },
        options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } }, scales: { x: categoryAxis(), y: valueAxis({ beginAtZero: true, ticks: { ...TICKS, precision: 0 } }) } },
      });
    });
    return () => { cancelled = true; if (chart) chart.destroy(); };
  }, [hospitalGrowth, hasData]);

  // No new hospitals in the window: an explicit empty state, not blank axes.
  if (!hasData) {
    return (
      <div className="empty chart-empty">
        <h3>No hospital growth data yet</h3>
        <p>Growth trends will appear as hospitals are added to the Gmedic platform.</p>
      </div>
    );
  }
  return <div style={{ height: 200 }}><canvas ref={ref}></canvas></div>;
}
