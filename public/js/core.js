/* Shared helpers for the Gmedic receptionist portal (window.G). */
(function () {
  'use strict';

  const G = (window.G = window.G || {});

  /* ---------- Strings & icons ---------- */
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  G.esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESC[c]);

  G.icon = (name, cls = '') =>
    `<svg class="icon${cls ? ` ${cls}` : ''}" aria-hidden="true" focusable="false"><use href="/images/icons.svg#${name}"></use></svg>`;

  G.$ = (sel, root = document) => root.querySelector(sel);
  G.$$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  G.debounce = (fn, wait = 250) => {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  };

  /* ---------- API ---------- */
  G.api = async function api(url, { method = 'GET', body, signal } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const e = new Error('Unable to reach the server. Check your connection and try again.');
      e.network = true;
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch (_) { /* empty body */ }

    if (res.status === 401 && !url.startsWith('/auth/') && !url.startsWith('/api/auth/')) {
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/login?expired=1&next=${next}`;
      throw new Error('Session expired.');
    }
    if (!res.ok) {
      const e = new Error((data && data.error) || 'Something went wrong. Please try again.');
      e.status = res.status;
      e.fields = data && data.fields;
      throw e;
    }
    return data;
  };

  /* ---------- Formatting ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  G.isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  G.todayISO = () => G.isoDate(new Date());
  G.addDaysISO = (days, from = new Date()) => {
    const d = new Date(from);
    d.setDate(d.getDate() + days);
    return G.isoDate(d);
  };
  G.parseISO = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  G.money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // "28 Sep 2025"; pass { weekday: true } for "Mon, 28 Sep 2025".
  G.date = (iso, { weekday = false } = {}) => {
    if (!iso) return '—';
    const d = typeof iso === 'string' && iso.length === 10 ? G.parseISO(iso) : new Date(iso);
    const s = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    return weekday ? `${DAYS[d.getDay()]}, ${s}` : s;
  };
  G.time = (hhmm) => {
    if (!hhmm) return '—';
    const [h, m] = hhmm.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    return `${pad(((h + 11) % 12) + 1)}:${pad(m)} ${suffix}`;
  };
  G.relativeDay = (iso) => {
    const today = G.todayISO();
    if (iso === today) return 'Today';
    if (iso === G.addDaysISO(1)) return 'Tomorrow';
    if (iso === G.addDaysISO(-1)) return 'Yesterday';
    return G.date(iso);
  };
  G.timeAgo = (isoDateTime) => {
    const diff = (Date.now() - Date.parse(isoDateTime)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
    const days = Math.floor(diff / 86400);
    return days === 1 ? 'Yesterday' : `${days} days ago`;
  };

  /* ---------- Badges & avatars ---------- */
  const LABELS = {
    confirmed: 'Confirmed',
    pending: 'Pending',
    completed: 'Completed',
    cancelled: 'Cancelled',
    paid: 'Paid',
    present: 'Present',
    absent: 'Absent / On Leave',
    waiting: 'Waiting',
    called: 'Called',
  };
  G.label = (key) => LABELS[key] || key;
  G.badge = (key, text) => `<span class="badge badge--${G.esc(key)}">${G.esc(text || G.label(key))}</span>`;

  G.initials = (name) =>
    String(name || '')
      .replace(/^Dr\.?\s+/i, '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');

  G.avatar = (name, size = '') => {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `<span class="avatar${size ? ` avatar--${size}` : ''} av-${h % 8}" aria-hidden="true">${G.esc(G.initials(name))}</span>`;
  };

  const SPEC_ICONS = {
    Cardiologist: 'heart-pulse',
    Dermatologist: 'sparkles',
    Orthopedist: 'bone',
    Pediatrician: 'baby',
    'ENT Specialist': 'ear',
    Gynecologist: 'female',
    Neurologist: 'activity',
    Ophthalmologist: 'eye',
  };
  G.specIcon = (spec) => SPEC_ICONS[spec] || 'stethoscope';

  G.emptyRow = (colspan, title, text, icon = 'search') =>
    `<tr class="is-empty"><td colspan="${colspan}" style="white-space:normal"><div class="empty"><div class="empty__icon">${G.icon(icon)}</div><h3>${G.esc(title)}</h3><p>${G.esc(text)}</p></div></td></tr>`;

  G.skeletonRows = (colspan, n = 4) =>
    `<tr><td colspan="${colspan}">${'<div class="skeleton skeleton--row"></div>'.repeat(n)}</td></tr>`;

  /* ---------- Toasts ---------- */
  G.toast = function toast(message, type = 'success', timeout = 4200) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const icon = type === 'error' ? 'x' : type === 'info' ? 'info' : 'check';
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `<span class="toast__icon">${G.icon(icon)}</span><div class="toast__body">${G.esc(message)}</div><button type="button" class="toast__close" aria-label="Dismiss">${G.icon('x')}</button>`;
    const remove = () => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', remove);
    host.appendChild(el);
    setTimeout(remove, timeout);
  };

  /* ---------- Modals ---------- */
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const stack = [];

  G.modal = {
    open(id) {
      const modal = document.getElementById(id);
      if (!modal || !modal.hidden) return modal;
      modal._returnFocus = document.activeElement;
      modal.hidden = false;
      stack.push(modal);
      document.body.style.overflow = 'hidden';
      requestAnimationFrame(() => {
        const target = modal.querySelector('[autofocus]') || modal.querySelector('.modal__body ' + FOCUSABLE) || modal.querySelector(FOCUSABLE);
        if (target) target.focus({ preventScroll: true });
      });
      modal.dispatchEvent(new CustomEvent('modal:open'));
      return modal;
    },
    close(id) {
      const modal = typeof id === 'string' ? document.getElementById(id) : id;
      if (!modal || modal.hidden) return;
      modal.hidden = true;
      const i = stack.indexOf(modal);
      if (i > -1) stack.splice(i, 1);
      if (!stack.length) document.body.style.overflow = '';
      if (modal._returnFocus && document.contains(modal._returnFocus)) modal._returnFocus.focus({ preventScroll: true });
      modal.dispatchEvent(new CustomEvent('modal:close'));
    },
  };

  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-modal-close]');
    if (closer) G.modal.close(closer.closest('.modal'));
  });

  document.addEventListener('keydown', (e) => {
    const top = stack[stack.length - 1];
    if (!top) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      G.modal.close(top);
    } else if (e.key === 'Tab') {
      const items = G.$$(FOCUSABLE, top).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- Forms ---------- */
  function labelText(el) {
    if (el.dataset.label) return el.dataset.label;
    const field = el.closest('.field');
    const label = (el.labels && el.labels[0]) || (field && field.querySelector('label, legend'));
    return label ? label.textContent.replace('*', '').trim() : el.name;
  }

  G.formValues = (form) => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.disabled) continue;
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; continue; }
      if (el.type === 'checkbox') { out[el.name] = el.checked; continue; }
      out[el.name] = el.value.trim();
    }
    return out;
  };

  // Client-side validation using the inputs' HTML attributes.
  G.validateForm = (form, custom = {}) => {
    const errors = {};
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    for (const el of form.elements) {
      if (!el.name || el.disabled || el.readOnly || el.type === 'hidden' || errors[el.name]) continue;
      const label = labelText(el);
      if (el.type === 'radio') {
        if (el.required && !form.querySelector(`[name="${el.name}"]:checked`)) errors[el.name] = `Select ${label.toLowerCase()}.`;
        continue;
      }
      const v = el.value.trim();
      if (!v) {
        if (el.required) errors[el.name] = el.tagName === 'SELECT' ? `Select a ${label.toLowerCase()}.` : `${label} is required.`;
        continue;
      }
      if (el.minLength > 0 && v.length < el.minLength) errors[el.name] = `${label} must be at least ${el.minLength} characters.`;
      else if (el.type === 'number') {
        const n = Number(v);
        if (!Number.isFinite(n)) errors[el.name] = `${label} must be a number.`;
        else if (el.step === '1' && !Number.isInteger(n)) errors[el.name] = `${label} must be a whole number.`;
        else if (el.min !== '' && n < Number(el.min)) errors[el.name] = `${label} must be at least ${el.min}.`;
        else if (el.max !== '' && n > Number(el.max)) errors[el.name] = `${label} must be at most ${el.max}.`;
      } else if (el.type === 'email' && !EMAIL.test(v)) errors[el.name] = 'Enter a valid email address.';
      else if (el.type === 'tel') {
        const digits = v.replace(/\D/g, '');
        if (!/^\+?[\d\s()-]+$/.test(v) || digits.length < 10 || digits.length > 15) errors[el.name] = 'Enter a valid phone number (10–15 digits).';
      } else if (el.pattern && !new RegExp(`^(?:${el.pattern})$`).test(v)) {
        errors[el.name] = el.dataset.patternMessage || `${label} is not valid.`;
      }
    }
    for (const [name, check] of Object.entries(custom)) {
      if (errors[name]) continue;
      const msg = check(form.elements[name] ? form.elements[name].value : undefined, form);
      if (msg) errors[name] = msg;
    }
    return errors;
  };

  G.clearErrors = (form) => {
    G.$$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
    G.$$('[data-error-for]', form).forEach((p) => { p.textContent = ''; });
    const alert = G.$('[data-form-alert]', form);
    if (alert) alert.hidden = true;
  };

  G.showErrors = (form, errors = {}, message) => {
    G.clearErrors(form);
    let first = null;
    for (const [name, msg] of Object.entries(errors)) {
      const slot = G.$(`[data-error-for="${name}"]`, form);
      if (slot) {
        slot.innerHTML = `${G.icon('alert', 'icon--xs')}<span>${G.esc(msg)}</span>`;
        slot.closest('.field').classList.add('has-error');
      }
      const input = form.elements[name];
      const el = input && (input.length && !input.tagName ? input[0] : input);
      if (!first && el && el.focus) first = el;
    }
    const alert = G.$('[data-form-alert]', form);
    if (alert && (message || !first)) {
      alert.querySelector('span').textContent = message || 'Please correct the highlighted fields.';
      alert.hidden = false;
    }
    if (first) first.focus();
  };

  // Clear a field's error as soon as the user edits it.
  document.addEventListener('input', (e) => {
    const field = e.target.closest && e.target.closest('.field.has-error');
    if (field) {
      field.classList.remove('has-error');
      const slot = G.$('[data-error-for]', field);
      if (slot) slot.textContent = '';
    }
  });

  G.setLoading = (btn, loading) => {
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('is-loading', loading);
    btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  };

  /* ---------- Password visibility ---------- */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle-password]');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.togglePassword);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.innerHTML = G.icon(show ? 'eye-off' : 'eye');
  });

  /* ---------- Pagination ---------- */
  G.renderPager = (host, { page, pages, total, pageSize }, onPage, noun = 'results') => {
    if (!host) return;
    if (!total) { host.innerHTML = `<span>No ${noun}</span>`; return; }
    const from = (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    const nums = [];
    const window = new Set([1, pages, page - 1, page, page + 1]);
    let last = 0;
    for (let i = 1; i <= pages; i++) {
      if (!window.has(i)) continue;
      if (i - last > 1) nums.push('<span aria-hidden="true">…</span>');
      nums.push(`<button type="button" class="btn btn--ghost btn--sm pager__page${i === page ? ' is-active' : ''}" data-page="${i}"${i === page ? ' aria-current="page"' : ''}>${i}</button>`);
      last = i;
    }
    host.innerHTML = `
      <span>Showing <strong class="text-strong">${from}–${to}</strong> of <strong class="text-strong">${total}</strong> ${noun}</span>
      <div class="pager__buttons">
        <button type="button" class="btn btn--ghost btn--sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous page">${G.icon('chevron-left')}</button>
        ${nums.join('')}
        <button type="button" class="btn btn--ghost btn--sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next page">${G.icon('chevron-right')}</button>
      </div>`;
    host.onclick = (e) => {
      const b = e.target.closest('[data-page]');
      if (b && !b.disabled) onPage(Number(b.dataset.page));
    };
  };

  /* ---------- Clipboard ---------- */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      G.toast('Link copied to clipboard.', 'info', 2500);
    } catch (_) {
      G.toast('Could not copy automatically. Select the link and copy it manually.', 'error');
    }
  });
})();
