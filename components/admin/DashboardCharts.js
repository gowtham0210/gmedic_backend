'use client';

import { useEffect, useRef } from 'react';

// Small dependency-free wrapper: loads Chart.js from the CDN copy already
// bundled in node_modules (served by Next as a static import) once, then
// draws four charts into the given canvases.
export default function DashboardCharts({ bookingTrend, revenueTrend, qrFunnel }) {
  const bookingRef = useRef(null);
  const revenueRef = useRef(null);
  const funnelRef = useRef(null);
  const chartsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled) return;
      const destroyAll = () => { chartsRef.current.forEach((c) => c.destroy()); chartsRef.current = []; };
      destroyAll();

      const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      const teal = '#0A8F8C';
      const navy = '#0F263D';
      const red = '#EF6461';
      const font = { family: "'Plus Jakarta Sans', sans-serif" };

      chartsRef.current.push(new Chart(bookingRef.current, {
        type: 'line',
        data: {
          labels: bookingTrend.map((r) => fmtDate(r.date)),
          datasets: [
            { label: 'Booked', data: bookingTrend.map((r) => r.booked), borderColor: teal, backgroundColor: 'rgba(10,143,140,.12)', fill: true, tension: 0.35 },
            { label: 'Completed', data: bookingTrend.map((r) => r.completed), borderColor: navy, borderDash: [4, 3], tension: 0.35 },
            { label: 'Cancelled', data: bookingTrend.map((r) => r.cancelled), borderColor: red, tension: 0.35 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font, boxWidth: 10 } } }, scales: { x: { ticks: { font } }, y: { ticks: { font }, beginAtZero: true } } },
      }));

      chartsRef.current.push(new Chart(revenueRef.current, {
        type: 'bar',
        data: {
          labels: revenueTrend.map((r) => fmtDate(r.date)),
          datasets: [
            { label: 'Gross revenue (₹)', data: revenueTrend.map((r) => r.gross), backgroundColor: teal, borderRadius: 4 },
            { label: 'Refunded (₹)', data: revenueTrend.map((r) => -r.refunded), backgroundColor: red, borderRadius: 4 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font, boxWidth: 10 } } }, scales: { x: { stacked: true, ticks: { font } }, y: { stacked: true, ticks: { font } } } },
      }));

      const funnelSteps = [
        { label: 'QR Scans', value: qrFunnel.scans },
        { label: 'Hospital Links', value: qrFunnel.linked },
        { label: 'Bookings', value: qrFunnel.bookings },
        { label: 'Payments', value: qrFunnel.payments },
      ];
      chartsRef.current.push(new Chart(funnelRef.current, {
        type: 'bar',
        data: { labels: funnelSteps.map((s) => s.label), datasets: [{ data: funnelSteps.map((s) => s.value), backgroundColor: ['#CDEEEC', '#7FD4CF', '#2DBDB6', teal], borderRadius: 6 }] },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ticks: { font }, beginAtZero: true }, y: { ticks: { font } } } },
      }));
    });
    return () => { cancelled = true; chartsRef.current.forEach((c) => c.destroy()); chartsRef.current = []; };
  }, [bookingTrend, revenueTrend, qrFunnel]);

  return (
    <div className="dash-grid" style={{ marginBottom: 24 }}>
      <article className="card">
        <div className="card__head"><h2 className="card__title">Booking Overview</h2></div>
        <div style={{ height: 220 }}><canvas ref={bookingRef}></canvas></div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title">Revenue Overview</h2></div>
        <div style={{ height: 220 }}><canvas ref={revenueRef}></canvas></div>
      </article>
      <article className="card">
        <div className="card__head"><h2 className="card__title">QR Funnel</h2></div>
        <div style={{ height: 220 }}><canvas ref={funnelRef}></canvas></div>
      </article>
    </div>
  );
}

export function HospitalGrowthChart({ hospitalGrowth }) {
  const ref = useRef(null);
  useEffect(() => {
    let chart;
    let cancelled = false;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled) return;
      chart = new Chart(ref.current, {
        type: 'line',
        data: { labels: hospitalGrowth.map((r) => r.month), datasets: [{ label: 'New hospitals', data: hospitalGrowth.map((r) => r.count), borderColor: '#0A8F8C', backgroundColor: 'rgba(10,143,140,.12)', fill: true, tension: 0.3 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    });
    return () => { cancelled = true; if (chart) chart.destroy(); };
  }, [hospitalGrowth]);
  return <div style={{ height: 200 }}><canvas ref={ref}></canvas></div>;
}
