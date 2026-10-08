'use client';

import { useEffect, useState } from 'react';
import Icon from '../../../components/Icon';
import DashboardCharts, { HospitalGrowthChart } from '../../../components/admin/DashboardCharts';
import { paymentSuccessTone } from '../../../lib/admin/kpiTone';

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
        <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="calendar" /></span><div><div className="mini-stat__label">Today&apos;s bookings</div><div className="mini-stat__value">{data.cards.todayAppointments}</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="rupee" /></span><div><div className="mini-stat__label">Today&apos;s revenue</div><div className="mini-stat__value">{money(data.cards.todayRevenue)}</div></div></div>
        <div className="card mini-stat"><span className={`stat__icon ${paymentSuccessTone(data.cards.paymentSuccessRate)}`}><Icon name="trending-up" /></span><div><div className="mini-stat__label">Payment success rate</div><div className="mini-stat__value">{data.cards.paymentSuccessRate}%</div></div></div>
        <div className="card mini-stat"><span className="stat__icon tone-neutral"><Icon name="scan" /></span><div><div className="mini-stat__label">Today&apos;s QR scans</div><div className="mini-stat__value">{data.cards.todayQrScans}</div></div></div>
      </section>

      {/* 2×2 grid: Booking | Revenue, QR Funnel | Hospital Growth */}
      <DashboardCharts bookingTrend={data.bookingTrend} revenueTrend={data.revenueTrend} qrFunnel={data.qrFunnel}>
        <article className="card">
          <div className="card__head"><div><h2 className="card__title">Hospital Growth</h2><p className="card__subtitle">Last 6 months · new hospitals per month</p></div></div>
          <HospitalGrowthChart hospitalGrowth={data.hospitalGrowth} />
        </article>
      </DashboardCharts>
    </>
  );
}
