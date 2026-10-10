(function () {
  'use strict';
  const { $, $$, api } = G;

  const view = $('[data-hospital-view]');
  const edit = $('[data-hospital-edit]');
  const form = $('#hospital-form');
  const editBtn = $('[data-edit-hospital]');
  let snapshot = null;

  // Opens the editor pre-filled with the hospital's current details from GET /api/hospital,
  // so the form never starts from stale page-load values.
  async function startEdit() {
    G.clearErrors(form);
    try {
      const { hospital: h } = await api('/api/hospital');
      const fresh = { phone: h.phone, email: h.email, line1: h.address.line1, city: h.address.city, state: h.address.state, pincode: h.address.pincode };
      for (const [k, v] of Object.entries(fresh)) if (form.elements[k] && v != null) form.elements[k].value = v;
    } catch (err) { /* fall back to the values already on the page */ }
    snapshot = G.formValues(form);
    view.hidden = true;
    edit.hidden = false;
    editBtn.hidden = true;
    form.elements.phone.focus();
    history.replaceState(null, '', '#edit');
  }

  function stopEdit(restore) {
    if (restore && snapshot) for (const [k, v] of Object.entries(snapshot)) if (form.elements[k]) form.elements[k].value = v;
    view.hidden = false;
    edit.hidden = true;
    editBtn.hidden = false;
    history.replaceState(null, '', location.pathname);
  }

  editBtn.addEventListener('click', startEdit);
  $('[data-cancel-edit]').addEventListener('click', () => stopEdit(true));
  if (location.hash === '#edit') startEdit();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errors = G.validateForm(form, {
      city: (v) => (/^[A-Za-z .'-]+$/.test(v.trim()) ? '' : 'City can only contain letters.'),
      state: (v) => (/^[A-Za-z .'-]+$/.test(v.trim()) ? '' : 'State can only contain letters.'),
      pincode: (v) => (/^\d{6}$/.test(v.trim()) ? '' : 'PIN code must be 6 digits.'),
    });
    if (Object.keys(errors).length) return G.showErrors(form, errors);

    const v = G.formValues(form);
    const btn = form.querySelector('[type="submit"]');
    G.setLoading(btn, true);
    try {
      const res = await api('/api/hospital', {
        method: 'PUT',
        body: { phone: v.phone, email: v.email, address: { line1: v.line1, city: v.city, state: v.state, pincode: v.pincode } },
      });
      const h = res.hospital;
      $$('[data-h-phone]').forEach((el) => { el.textContent = h.phone; });
      $$('[data-h-email]').forEach((el) => { el.textContent = h.email; });
      $$('[data-h-address]').forEach((el) => { el.textContent = h.addressText; });
      window.GMEDIC.hospital = h;
      stopEdit(false);
      G.toast(res.message, 'success');
    } catch (err) {
      G.showErrors(form, err.fields || {}, err.message);
    } finally {
      G.setLoading(btn, false);
    }
  });
})();
