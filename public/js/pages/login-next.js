(function () {
  'use strict';
  const { $, $$, api } = G;

  /* ---------- Role switch ---------- */
  const roleInput = $('#role');
  const roleLabels = { SUPER_ADMIN: 'Super Admin', RECEPTIONIST: 'Receptionist', DOCTOR: 'Doctor' };
  function setRole(role) {
    roleInput.value = role;
    $$('[data-role-tab]').forEach((t) => t.classList.toggle('is-active', t.dataset.roleTab === role));
    $$('[data-role-name]').forEach((el) => { el.textContent = roleLabels[role]; });
    $$('[data-demo-box]').forEach((box) => { box.style.display = box.dataset.demoBox === role ? 'block' : 'none'; });
  }
  $$('[data-role-tab]').forEach((tab) => tab.addEventListener('click', () => setRole(tab.dataset.roleTab)));

  /* ---------- Panels (login / forgot password) ---------- */
  function show(name) {
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    const panel = $(`[data-panel="${name}"]`);
    const input = panel.querySelector('input:not([type="hidden"])');
    if (input) input.focus();
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-show-panel]');
    if (!btn) return;
    if (btn.dataset.showPanel === 'forgot') $('#forgot-identifier').value = $('#identifier').value;
    show(btn.dataset.showPanel);
  });

  /* ---------- Login ---------- */
  const form = $('#login-form');
  $$('[data-fill-demo]').forEach((demo) => {
    demo.addEventListener('click', () => {
      setRole(demo.dataset.role || 'RECEPTIONIST');
      form.elements.identifier.value = demo.dataset.identifier;
      form.elements.password.value = demo.dataset.password;
      G.clearErrors(form);
      form.querySelector('[type="submit"]').focus();
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const flash = $('[data-flash]');
    if (flash) flash.remove();
    const errors = G.validateForm(form);
    if (Object.keys(errors).length) return G.showErrors(form, errors);

    const btn = form.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/auth/login', {
        method: 'POST',
        body: {
          identifier: form.elements.identifier.value.trim(),
          password: form.elements.password.value,
          role: roleInput.value,
          remember: form.elements.remember.checked,
          next: form.elements.next.value,
        },
      });
      btn.classList.remove('is-loading');
      btn.innerHTML = `${G.icon('check')}<span>Signed in</span>`;
      location.assign(res.redirect || '/dashboard');
    } catch (err) {
      G.setLoading(btn, false);
      G.showErrors(form, err.fields || {}, err.message);
      if (!err.fields) form.elements.password.select();
    }
  });

  /* ---------- Forgot password ---------- */
  const forgot = $('#forgot-form');
  forgot.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('[data-form-success]', forgot).hidden = true;
    const errors = G.validateForm(forgot);
    if (Object.keys(errors).length) return G.showErrors(forgot, errors);
    const btn = forgot.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/auth/forgot-password', { method: 'POST', body: { identifier: forgot.elements.identifier.value.trim() } });
      G.clearErrors(forgot);
      const ok = $('[data-form-success]', forgot);
      ok.querySelector('span').textContent = res.message;
      ok.hidden = false;
    } catch (err) {
      G.showErrors(forgot, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });
})();
