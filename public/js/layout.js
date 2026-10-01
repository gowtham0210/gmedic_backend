/* App shell behaviour: sidebar, dropdowns, notifications, global search, logout. */
(function () {
  'use strict';
  const { $, $$, esc, icon, api } = G;

  /* ---------- Sidebar ----------
     Desktop: drag the right edge to resize, ☰ / double-click the edge to collapse.
     Below 1024px: off-canvas drawer opened with ☰. */
  const body = document.body;
  const root = document.documentElement;
  const desktop = window.matchMedia('(min-width: 1024px)');
  const MIN_W = 220;
  const MAX_W = 360;
  const COLLAPSE_BELOW = 160;
  const STORE_KEY = 'gmedic.sidebar';

  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (_) { return {}; } };
  const savePrefs = (patch) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch (_) { /* storage unavailable */ } };

  const setCollapsed = (collapsed) => {
    root.classList.toggle('sidebar-collapsed', collapsed);
    savePrefs({ collapsed });
  };
  const setWidth = (w) => {
    const width = Math.round(Math.min(MAX_W, Math.max(MIN_W, w)));
    root.style.setProperty('--sidebar-w-open', `${width}px`);
    return width;
  };

  const openSidebar = () => { body.classList.add('sidebar-open'); const c = $('.sidebar__close'); if (c) c.focus(); };
  const closeSidebar = () => body.classList.remove('sidebar-open');
  $$('[data-sidebar-toggle]').forEach((b) => b.addEventListener('click', () => {
    if (desktop.matches) setCollapsed(!root.classList.contains('sidebar-collapsed'));
    else openSidebar();
  }));
  $$('[data-sidebar-close]').forEach((b) => b.addEventListener('click', closeSidebar));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
  desktop.addEventListener('change', (m) => { if (m.matches) closeSidebar(); });

  const resizer = $('[data-sidebar-resizer]');
  if (resizer) {
    resizer.addEventListener('pointerdown', (e) => {
      if (!desktop.matches || e.button !== 0) return;
      e.preventDefault();
      resizer.setPointerCapture(e.pointerId);
      root.classList.add('is-resizing');
      let width = null;
      const move = (ev) => {
        const x = ev.clientX;
        if (x < COLLAPSE_BELOW) {
          root.classList.add('sidebar-collapsed');
          width = null;
        } else {
          root.classList.remove('sidebar-collapsed');
          width = setWidth(x);
        }
      };
      const up = () => {
        resizer.removeEventListener('pointermove', move);
        resizer.removeEventListener('pointerup', up);
        resizer.removeEventListener('pointercancel', up);
        root.classList.remove('is-resizing');
        const collapsed = root.classList.contains('sidebar-collapsed');
        savePrefs(width ? { width, collapsed } : { collapsed });
      };
      resizer.addEventListener('pointermove', move);
      resizer.addEventListener('pointerup', up);
      resizer.addEventListener('pointercancel', up);
    });
    resizer.addEventListener('dblclick', () => setCollapsed(!root.classList.contains('sidebar-collapsed')));
    resizer.addEventListener('keydown', (e) => {
      const current = parseInt(getComputedStyle(root).getPropertyValue('--sidebar-w-open'), 10) || 264;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        if (root.classList.contains('sidebar-collapsed')) { if (e.key === 'ArrowRight') setCollapsed(false); return; }
        if (e.key === 'ArrowLeft' && current <= MIN_W) { setCollapsed(true); return; }
        savePrefs({ width: setWidth(current + (e.key === 'ArrowRight' ? 16 : -16)) });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setCollapsed(!root.classList.contains('sidebar-collapsed'));
      }
    });
  }

  /* ---------- Dropdowns ---------- */
  const dropdowns = $$('[data-dropdown]');
  function closeAll(except) {
    dropdowns.forEach((d) => {
      if (d === except) return;
      d.classList.remove('is-open');
      const t = $('[data-dropdown-toggle]', d);
      if (t) t.setAttribute('aria-expanded', 'false');
    });
  }
  dropdowns.forEach((dd) => {
    const toggle = $('[data-dropdown-toggle]', dd);
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !dd.classList.contains('is-open');
      closeAll(dd);
      dd.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) dd.dispatchEvent(new CustomEvent('dropdown:open'));
    });
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('[data-dropdown]')) closeAll(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });

  /* ---------- Logout ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-logout]')) {
      closeAll();
      closeSidebar();
      G.modal.open('logout-modal');
    }
  });

  /* ---------- Notifications ---------- */
  const notifToggle = $('[data-notif-toggle]');
  const notifCount = $('[data-notif-count]');
  const notifList = $('[data-notif-list]');

  function setCount(n) {
    if (!notifCount) return;
    notifCount.hidden = !n;
    notifCount.textContent = n > 9 ? '9+' : String(n);
    notifToggle.setAttribute('aria-label', n ? `Notifications (${n} unread)` : 'Notifications');
  }

  function renderNotifications(items) {
    if (!items.length) {
      notifList.innerHTML = `<div class="empty" style="padding:28px 16px"><div class="empty__icon">${icon('bell')}</div><p>You're all caught up.</p></div>`;
      return;
    }
    notifList.innerHTML = items.map((n) => {
      const isPay = n.type === 'payment';
      const text = isPay
        ? `Payment of <strong>${G.money(n.amount)}</strong> received from <strong>${esc(n.patientName)}</strong> via ${esc(n.method)}`
        : `New appointment: <strong>${esc(n.patientName)}</strong> with ${esc(n.doctorName)} · ${esc(G.relativeDay(n.date))}, ${G.time(n.time)}`;
      return `<a class="notif__item${n.unread ? ' is-unread' : ''}" href="${isPay ? '/payments' : '/appointments?q=' + encodeURIComponent(n.patientName)}">
        <span class="notif__icon ${isPay ? 'tone-green' : 'tone-blue'}">${icon(isPay ? 'wallet' : 'calendar-check')}</span>
        <span><p>${text}</p><small>${esc(G.timeAgo(n.at))}</small></span>
      </a>`;
    }).join('');
  }

  async function loadNotifications() {
    try {
      const data = await api('/api/notifications');
      setCount(data.unread);
      renderNotifications(data.items);
    } catch (_) {
      if (notifList) notifList.innerHTML = '<p class="text-muted" style="padding:16px">Notifications are unavailable right now.</p>';
    }
  }
  if (notifToggle) {
    loadNotifications();
    notifToggle.closest('[data-dropdown]').addEventListener('dropdown:open', loadNotifications);
    $('[data-notif-read]').addEventListener('click', async () => {
      try {
        await api('/api/notifications/read', { method: 'POST' });
        setCount(0);
        $$('.notif__item.is-unread', notifList).forEach((el) => el.classList.remove('is-unread'));
      } catch (err) { G.toast(err.message, 'error'); }
    });
  }

  /* ---------- Global search ---------- */
  const search = $('[data-global-search]');
  if (search) {
    const input = $('[data-search-input]', search);
    const results = $('[data-search-results]', search);
    let controller;
    let activeIndex = -1;

    const hide = () => { results.hidden = true; activeIndex = -1; };
    const links = () => $$('.search-results__item', results);
    const highlight = (i) => {
      const items = links();
      items.forEach((el, idx) => el.classList.toggle('is-active', idx === i));
      if (items[i]) items[i].scrollIntoView({ block: 'nearest' });
      activeIndex = i;
    };

    const run = G.debounce(async (q) => {
      if (q.length < 2) { hide(); return; }
      if (controller) controller.abort();
      controller = new AbortController();
      try {
        const data = await api(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        let html = '';
        if (data.doctors.length) {
          html += '<div class="search-results__group">Doctors</div>' + data.doctors.map((d) => `
            <a class="search-results__item" href="/doctors/${encodeURIComponent(d.id)}">${G.avatar(d.name, 'sm')}
              <span style="flex:1;min-width:0">${esc(d.name)}<small>${esc(d.specialization)}</small></span>${G.badge(d.availability, d.availability === 'present' ? 'Present' : 'On Leave')}</a>`).join('');
        }
        if (data.patients.length) {
          html += '<div class="search-results__group">Patients</div>' + data.patients.map((p) => `
            <a class="search-results__item" href="/appointments?q=${encodeURIComponent(p.name)}">${G.avatar(p.name, 'sm')}
              <span style="flex:1;min-width:0">${esc(p.name)}<small>${p.visits} appointment${p.visits === 1 ? '' : 's'} · Last: ${esc(G.date(p.lastDate))} with ${esc(p.doctorName)}</small></span></a>`).join('');
        }
        results.innerHTML = html || `<div class="search-results__empty">No doctors or patients match “${esc(q)}”.</div>`;
        results.hidden = false;
        activeIndex = -1;
      } catch (err) {
        if (err.name !== 'AbortError') { results.innerHTML = `<div class="search-results__empty">${esc(err.message)}</div>`; results.hidden = false; }
      }
    }, 200);

    input.addEventListener('input', () => run(input.value.trim()));
    input.addEventListener('focus', () => { if (input.value.trim().length >= 2 && results.innerHTML) results.hidden = false; });
    input.addEventListener('keydown', (e) => {
      const items = links();
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); highlight((activeIndex + 1) % items.length); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); highlight((activeIndex - 1 + items.length) % items.length); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (items[activeIndex]) items[activeIndex].click();
        else if (input.value.trim()) location.href = `/appointments?q=${encodeURIComponent(input.value.trim())}`;
      } else if (e.key === 'Escape') { hide(); input.blur(); search.classList.remove('is-expanded'); }
    });
    document.addEventListener('click', (e) => {
      if (!search.contains(e.target)) { hide(); search.classList.remove('is-expanded'); }
    });

    // Mobile: the search collapses to an icon button.
    $('[data-search-toggle]', search).addEventListener('click', (e) => {
      e.stopPropagation();
      search.classList.add('is-expanded');
      input.focus();
    });

    // "/" focuses search from anywhere (except while typing).
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (/INPUT|TEXTAREA|SELECT/.test(tag) || document.activeElement.isContentEditable) return;
      if (document.querySelector('.modal:not([hidden])')) return;
      e.preventDefault();
      search.classList.add('is-expanded');
      input.focus();
    });
  }

  /* ---------- Keep profile name in sync after edits ---------- */
  document.addEventListener('profile:updated', (e) => {
    const u = e.detail;
    $$('[data-user-name]').forEach((el) => { el.textContent = u.name; });
    $$('[data-user-initials]').forEach((el) => { el.textContent = u.initials; });
  });
})();
