(function () {
  'use strict';
  const { $, $$, api } = G;

  /* ---------- Section nav ---------- */
  const links = $$('[data-section-link]');
  const setActive = (id) => links.forEach((l) => l.classList.toggle('is-active', l.dataset.sectionLink === id));
  if (location.hash === '#password') setActive('password');
  links.forEach((l) => l.addEventListener('click', () => setActive(l.dataset.sectionLink)));
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) setActive(en.target.id); });
    }, { rootMargin: '-40% 0px -55% 0px' });
    ['profile', 'password'].forEach((id) => io.observe(document.getElementById(id)));
  }

  /* ---------- Profile ---------- */
  const profileForm = $('#profile-form');
  let saved = G.formValues(profileForm);

  profileForm.addEventListener('reset', (e) => {
    e.preventDefault();
    for (const [k, v] of Object.entries(saved)) if (profileForm.elements[k]) profileForm.elements[k].value = v;
    G.clearErrors(profileForm);
  });

  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = G.validateForm(profileForm, {
      name: (v) => (/^[A-Za-z][A-Za-z .'-]*$/.test(v.trim()) ? '' : 'Name can only contain letters and spaces.'),
    });
    if (Object.keys(errors).length) return G.showErrors(profileForm, errors);
    const v = G.formValues(profileForm);
    const btn = profileForm.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/profile', { method: 'PUT', body: { name: v.name, phone: v.phone } });
      saved = G.formValues(profileForm);
      document.dispatchEvent(new CustomEvent('profile:updated', { detail: res.user }));
      G.clearErrors(profileForm);
      G.toast(res.message, 'success');
    } catch (err) {
      G.showErrors(profileForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });

  /* ---------- Password ---------- */
  const pwForm = $('#password-form');
  const meter = $('[data-strength]');
  const meterLabel = $('[data-strength-label]');
  const LEVELS = ['At least 8 characters, with a letter and a number.', 'Weak password', 'Fair password', 'Good password', 'Strong password'];

  function strength(p) {
    if (!p) return 0;
    let score = 0;
    if (p.length >= 8) score++;
    if (/[A-Za-z]/.test(p) && /\d/.test(p)) score++;
    if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) score++;
    return Math.max(1, score);
  }

  pwForm.elements.newPassword.addEventListener('input', (e) => {
    const level = strength(e.target.value);
    meter.dataset.level = String(level);
    meterLabel.textContent = LEVELS[level];
  });
  pwForm.addEventListener('reset', () => {
    setTimeout(() => { meter.dataset.level = '0'; meterLabel.textContent = LEVELS[0]; G.clearErrors(pwForm); }, 0);
  });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = G.validateForm(pwForm, {
      newPassword: (v) => (/[A-Za-z]/.test(v) && /\d/.test(v) ? '' : 'Use at least 8 characters with a letter and a number.'),
      confirmPassword: (v, f) => (v === f.elements.newPassword.value ? '' : 'Passwords do not match.'),
    });
    if (Object.keys(errors).length) return G.showErrors(pwForm, errors);
    const v = G.formValues(pwForm);
    const btn = pwForm.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/profile/password', {
        method: 'PUT',
        body: { currentPassword: pwForm.elements.currentPassword.value, newPassword: pwForm.elements.newPassword.value, confirmPassword: v.confirmPassword },
      });
      pwForm.reset();
      $('[data-pw-changed]').textContent = `Last changed ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      G.toast(res.message, 'success');
    } catch (err) {
      G.showErrors(pwForm, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });
})();
