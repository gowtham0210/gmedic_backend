'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import DashboardCharts, { HospitalGrowthChart } from '../../../components/admin/DashboardCharts';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url) {
  const res = await fetch(url, { credentials: 'same-origin' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api('/api/admin/analytics').then(setData).catch((err) => toast(err.message, 'error')).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="skeleton" style={{ height: 400 }}></div>;
  if (!data) return <div className="alert alert--error"><Icon name="alert" /><span>Could not load analytics.</span></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Analytics</h1>
          <p>Platform-wide trends across the last 14 days: bookings, revenue, QR conversion and hospital growth.</p>
        </div>
      </div>

      <section className="summary-strip">
        <div className="card mini-stat"><span className="stat__icon tone-blue"><Icon name="calendar" /></span><div><div className="mini-stat__label">Today&apos;s bookings</div><div className="mini-stat__value">{data.cards.todayAppointments}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-green"><Icon name="rupee" /></span><div><div className="mini-stat__label">Today&apos;s revenue</div><div className="mini-stat__value">{money(data.cards.todayRevenue)}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-teal"><Icon name="trending-up" /></span><div><div className="mini-stat__label">Payment success</div><div className="mini-stat__value">{data.cards.paymentSuccessRate}%</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-violet"><Icon name="scan" /></span><div><div className="mini-stat__label">QR scans today</div><div className="mini-stat__value">{data.cards.todayQrScans}</div></div></div>
      </section>

      <DashboardCharts bookingTrend={data.bookingTrend} revenueTrend={data.revenueTrend} qrFunnel={data.qrFunnel} />

      <article className="card">
        <div className="card__head"><h2 className="card__title"><Icon name="trending-up" />Hospital Growth (6 months)</h2></div>
        <HospitalGrowthChart hospitalGrowth={data.hospitalGrowth} />
      </article>
    </>
  );
}
