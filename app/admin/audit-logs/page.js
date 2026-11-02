'use client';

import { useEffect, useState, useCallback } from 'react';
import Icon from '../../../components/Icon';
import Pager, { usePager } from '../../../components/admin/Pager';
import { formatDateTime } from '../../../lib/format';

const toast = (msg, type = 'success') => { if (typeof window !== 'undefined' && window.G) window.G.toast(msg, type); };

async function api(url, opts = {}) {
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { window.location.href = '/login?expired=1&role=SUPER_ADMIN'; throw new Error('Session expired'); }
  if (!res.ok) { const err = new Error(data.error || 'Something went wrong.'); err.fields = data.fields; throw err; }
  return data;
}

function DetailModal({ entry, onClose }) {
  if (!entry) return null;
  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose}></div>
      <div className="modal__panel">
        <div className="modal__head">
          <div className="modal__icon tone-teal"><Icon name="clipboard-list" /></div>
          <div><h2>{entry.action}</h2><p>{formatDateTime(entry.createdAt)}</p></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div className="modal__body">
          <dl className="kv">
            <div><dt>User</dt><dd>{entry.userName} ({entry.role})</dd></div>
            <div><dt>Entity</dt><dd>{entry.entityType} {entry.entityId ? `· ${entry.entityId}` : ''}</dd></div>
            <div className="kv--full"><dt>Summary</dt><dd>{entry.summary || '—'}</dd></div>
            <div><dt>IP</dt><dd className="mono">{entry.ipAddress || '—'}</dd></div>
          </dl>
          {entry.previousValue && (
            <div style={{ marginTop: 14 }}>
              <strong>Before</strong>
              <pre className="mono" style={{ background: 'var(--surface-2, #f4f6f8)', padding: 10, borderRadius: 4, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(entry.previousValue, null, 2)}</pre>
            </div>
          )}
          {entry.newValue && (
            <div style={{ marginTop: 14 }}>
              <strong>After</strong>
              <pre className="mono" style={{ background: 'var(--surface-2, #f4f6f8)', padding: 10, borderRadius: 4, overflowX: 'auto', fontSize: 12 }}>{JSON.stringify(entry.newValue, null, 2)}</pre>
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function AuditLogsPage() {
  const [items, setItems] = useState([]);
  const [actions, setActions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [users, setUsers] = useState([]);
  const [entityType, setEntityType] = useState('');
  const [userId, setUserId] = useState('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [detail, setDetail] = useState(null);

  const [page, setPage] = usePager(JSON.stringify([q, action, entityType, userId, from, to]));
  const [pages, setPages] = useState(1);
  // The filters as a query string, shared by the list and the CSV export so the file matches what is on screen.
  const filterQs = () => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (action) qs.set('action', action);
    if (entityType) qs.set('entityType', entityType);
    if (userId) qs.set('userId', userId);
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return qs;
  };
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = filterQs();
      qs.set('pageSize', '25');
      qs.set('page', String(page));
      const data = await api(`/api/admin/audit-logs?${qs}`);
      setItems(data.items);
      setActions(data.actions || []);
      setEntityTypes(data.entityTypes || []);
      setUsers(data.users || []);
      setTotal(data.total); setPages(data.pages || 1);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, action, entityType, userId, from, to, page]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit Logs</h1>
          <p>Every admin action: who, what, when. Read-only and append-only.</p>
        </div>
        <div className="page-head__actions">
          <a className="btn btn--ghost" href={`/api/admin/audit-logs/export?${filterQs()}`} download><Icon name="download" />Export CSV</a>
        </div>
      </div>

      <article className="card card--flush">
        <div className="toolbar">
          <div className="field toolbar__search">
            <label>Search</label>
            <div className="input-wrap"><Icon name="search" /><input className="input" placeholder="Summary, user or entity ID" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          </div>
          <div className="field toolbar__item">
            <label>Action</label>
            <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>Record</label>
            <select className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
              <option value="">All</option>
              {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field toolbar__item">
            <label>User</label>
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">All</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="field toolbar__item"><label>From</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field toolbar__item"><label>To</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <button type="button" className="btn btn--ghost" onClick={() => { setQ(''); setAction(''); setEntityType(''); setUserId(''); setFrom(''); setTo(''); }}><Icon name="refresh" />Reset</button>
        </div>

        <div className="table-wrap">
          <table className="table table--stack">
            <thead><tr><th>When</th><th>User</th><th>Action</th><th>Entity</th><th>Summary</th><th className="col-actions">Details</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6}><div className="skeleton skeleton--row"></div><div className="skeleton skeleton--row"></div></td></tr>}
              {!loading && items.length === 0 && (
                <tr><td colSpan={6} style={{ whiteSpace: 'normal' }}><div className="empty"><div className="empty__icon"><Icon name="clipboard-list" /></div><h3>No audit entries found</h3></div></td></tr>
              )}
              {items.map((e) => (
                <tr key={e.id}>
                  <td data-label="When" className="text-muted nowrap">{formatDateTime(e.createdAt)}</td>
                  <td data-label="User">{e.userName}<span className="cell-sub">{e.role}</span></td>
                  <td data-label="Action" className="mono">{e.action}</td>
                  <td data-label="Entity">{e.entityType}{e.entityId ? <span className="cell-sub mono">{e.entityId}</span> : null}</td>
                  <td data-label="Summary" className="text-muted">{e.summary}</td>
                  <td className="col-actions"><button type="button" className="action-btn" onClick={() => setDetail(e)}><Icon name="eye" />View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager total={total} page={page} pages={pages} noun="entry" plural="entries" onPage={setPage} />
      </article>

      <DetailModal entry={detail} onClose={() => setDetail(null)} />
    </>
  );
}
