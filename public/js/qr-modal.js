/* Hospital QR poster: view, download (PNG) and print.
   The poster is a self-contained SVG built by the server (/api/hospital/qr-poster.svg). */
(function () {
  'use strict';
  const { $ } = G;
  const POSTER_URL = '/api/hospital/qr-poster.svg';
  const WIDTH = 1060;
  const HEIGHT = 1500;

  const posterSrc = () => `${POSTER_URL}?v=${Date.now()}`;

  function open() {
    const img = $('[data-qr-poster]');
    if (!img) return;
    img.src = posterSrc();
    G.modal.open('qr-modal');
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load the QR poster.'));
      img.src = src;
    });
  }

  // Rasterise the poster SVG to a high-resolution PNG and download it.
  async function downloadPoster(btn) {
    G.setLoading(btn, true);
    let svgUrl;
    try {
      const res = await fetch(posterSrc(), { credentials: 'same-origin' });
      if (res.status === 401) { location.href = '/login?expired=1'; return; }
      if (!res.ok) throw new Error('Could not generate the QR poster.');
      svgUrl = URL.createObjectURL(new Blob([await res.text()], { type: 'image/svg+xml' }));
      const img = await loadImage(svgUrl);
      await new Promise((r) => setTimeout(r, 120)); // let embedded fonts settle

      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * scale;
      canvas.height = HEIGHT * scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not create the PNG file.');
      const h = window.GMEDIC.hospital;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `gmedic-qr-${h.id.toLowerCase()}-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      G.toast('QR poster downloaded.', 'success', 2500);
    } catch (err) {
      G.toast(err.message, 'error');
    } finally {
      if (svgUrl) URL.revokeObjectURL(svgUrl);
      G.setLoading(btn, false);
    }
  }

  // Print just the poster, sized to fill an A4 page.
  async function printPoster(btn) {
    G.setLoading(btn, true);
    const sheet = document.createElement('div');
    sheet.className = 'print-sheet';
    sheet.innerHTML = '<img class="print-poster" alt="Gmedic QR poster">';
    document.body.appendChild(sheet);
    try {
      await new Promise((resolve, reject) => {
        const img = sheet.querySelector('img');
        img.onload = resolve;
        img.onerror = () => reject(new Error('Could not load the QR poster for printing.'));
        img.src = posterSrc();
      });
      document.body.classList.add('is-printing');
      const cleanup = () => {
        document.body.classList.remove('is-printing');
        sheet.remove();
        window.removeEventListener('afterprint', cleanup);
      };
      window.addEventListener('afterprint', cleanup);
      window.print();
      setTimeout(() => { if (document.body.contains(sheet)) cleanup(); }, 1000);
    } catch (err) {
      sheet.remove();
      G.toast(err.message, 'error');
    } finally {
      G.setLoading(btn, false);
    }
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-open-qr]')) open();
    const dl = e.target.closest('[data-download-poster]');
    if (dl) downloadPoster(dl);
    const pr = e.target.closest('[data-qr-print]');
    if (pr) printPoster(pr);
  });

  G.qrPoster = { open, download: downloadPoster, print: printPoster };
})();
