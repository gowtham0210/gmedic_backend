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
  const MAX_W = 300;
  const COLLAPSE_BELOW = 160;
  const STORE_KEY = 'gmedic.sidebar';

  const readPrefs = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch (_) { return {}; } };
  const savePrefs = (patch) => { try { localStorage.setItem(STORE_KEY, JSON.stringify({ ...readPrefs(), ...patch })); } catch (_) { /* storage unavailable */ } };

  // Tell assistive tech whether the sidebar is expanded (desktop) / open (drawer).
  const syncToggles = () => {
    const expanded = desktop.matches ? !root.classList.contains('sidebar-collapsed') : body.classList.contains('sidebar-open');
    $$('[data-sidebar-toggle]').forEach((b) => b.setAttribute('aria-expanded', String(expanded)));
  };
  const setCollapsed = (collapsed) => {
    root.classList.toggle('sidebar-collapsed', collapsed);
    savePrefs({ collapsed });
    syncToggles();
  };
  const setWidth = (w) => {
    const width = Math.round(Math.min(MAX_W, Math.max(MIN_W, w)));
    root.style.setProperty('--sidebar-w-open', `${width}px`);
    return width;
  };

  // Restore the saved width / collapsed state (the root layout's inline script
  // already applied it before first paint; this keeps both in sync).
  const prefs = readPrefs();
  if (prefs.width) setWidth(prefs.width);
  root.classList.toggle('sidebar-collapsed', !!prefs.collapsed);

  const openSidebar = () => { body.classList.add('sidebar-open'); syncToggles(); const c = $('.sidebar__close'); if (c) c.focus(); };
  const closeSidebar = () => { body.classList.remove('sidebar-open'); syncToggles(); };
  $$('[data-sidebar-toggle]').forEach((b) => b.addEventListener('click', () => {
    if (desktop.matches) setCollapsed(!root.classList.contains('sidebar-collapsed'));
    else openSidebar();
  }));
  $$('[data-sidebar-close]').forEach((b) => b.addEventListener('click', closeSidebar));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSidebar(); });
  desktop.addEventListener('change', (m) => { if (m.matches) closeSidebar(); syncToggles(); });
  syncToggles();

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

  /* ---------- Collapsed-sidebar tooltips ----------
     When the desktop sidebar is icon-only, hovering or focusing an item shows its
     label to the right of the sidebar after a short delay. */
  const TOOLTIP_DELAY = 400;
  const tooltip = document.createElement('div');
  tooltip.className = 'sidebar-tooltip';
  tooltip.setAttribute('role', 'presentation');
  tooltip.hidden = true;
  body.appendChild(tooltip);
  let tipTimer = null;
  let tipFor = null;
  const hideTip = () => {
    clearTimeout(tipTimer);
    tipFor = null;
    tooltip.classList.remove('is-visible');
    tooltip.hidden = true;
  };
  const showTip = (link, delay) => {
    if (!desktop.matches || !root.classList.contains('sidebar-collapsed')) return;
    const text = $('.nav__text', link);
    if (!text || tipFor === link) return;
    clearTimeout(tipTimer);
    tipFor = link;
    tipTimer = setTimeout(() => {
      const r = link.getBoundingClientRect();
      const sb = $('.sidebar').getBoundingClientRect();
      tooltip.textContent = text.textContent.trim();
      tooltip.style.left = `${sb.right + 10}px`;
      tooltip.style.top = `${r.top + r.height / 2}px`;
      tooltip.hidden = false;
      requestAnimationFrame(() => tooltip.classList.add('is-visible'));
    }, delay);
  };
  const navLinkFrom = (e) => e.target.closest && e.target.closest('.sidebar .nav__link');
  document.addEventListener('pointerover', (e) => { const l = navLinkFrom(e); if (l) showTip(l, TOOLTIP_DELAY); });
  document.addEventListener('pointerout', (e) => { const l = navLinkFrom(e); if (l && !l.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', (e) => { const l = navLinkFrom(e); if (l && l.matches(':focus-visible')) showTip(l, 0); else hideTip(); });
  document.addEventListener('click', hideTip, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  $('.sidebar') && $('.sidebar').addEventListener('scroll', hideTip, { passive: true });
  new MutationObserver(() => { if (!root.classList.contains('sidebar-collapsed')) hideTip(); }).observe(root, { attributes: true, attributeFilter: ['class'] });

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
    const ICON = { NEW_APPOINTMENT: ['calendar-check', 'tone-blue'], APPOINTMENT_CANCELLED: ['calendar-x', 'tone-red'], PAYMENT_SUCCESS: ['wallet', 'tone-green'] };
    notifList.innerHTML = items.map((n) => {
      const [name, tone] = ICON[n.eventKey] || ['bell', 'tone-teal'];
      return `<a class="notif__item${n.unread ? ' is-unread' : ''}" href="${esc(n.link || '#')}" data-notif-id="${esc(n.id)}">
        <span class="notif__icon ${tone}">${icon(name)}</span>
        <span><p><strong>${esc(n.title)}</strong> — ${esc(n.body)}</p><small>${esc(G.timeAgo(n.at))}</small></span>
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
    // Opening one marks just that one read (the link still navigates).
    notifList.addEventListener('click', (e) => {
      const item = e.target.closest('[data-notif-id]');
      if (!item || !item.classList.contains('is-unread')) return;
      item.classList.remove('is-unread');
      // keepalive: the request survives the page navigating to the notification's link.
      fetch(`/api/notifications/${encodeURIComponent(item.dataset.notifId)}/read`, { method: 'POST', keepalive: true, credentials: 'same-origin' })
        .then((r) => r.json()).then((d) => setCount(d.unread)).catch(() => {});
    });
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
            <a class="search-results__item" href="/appointments?q=${encodeURIComponent(p.id)}">${G.avatar(p.name, 'sm')}
              <span style="flex:1;min-width:0">${esc(p.name)}<small>${esc(p.id)}${p.mobile ? ` · ${esc(p.mobile)}` : ''} · ${p.visits} appointment${p.visits === 1 ? '' : 's'} · Last: ${esc(G.date(p.lastDate))} with ${esc(p.doctorName)}</small></span></a>`).join('');
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
