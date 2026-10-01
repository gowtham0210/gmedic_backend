// Builds the printable "Skip the Queue" QR poster for a hospital as a single,
// self-contained SVG (fonts, logo and QR code embedded). The same SVG is shown
// in the portal, printed, and rasterised to PNG in the browser for download.

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const config = require('../config');
const hospitalModel = require('../models/hospitalModel');

const W = 1060;
const H = 1500;
const NAVY = '#10304B';
const TEAL = '#10A19B';
const FONT = "GmedicPoster, 'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

// ---- Embedded assets (read once) -------------------------------------------
let assets = null;
function loadAssets() {
  if (assets) return assets;
  const fontDir = path.join(config.root, 'node_modules', '@fontsource', 'plus-jakarta-sans', 'files');
  const fontFaces = [500, 600, 700, 800]
    .map((weight) => {
      const file = path.join(fontDir, `plus-jakarta-sans-latin-${weight}-normal.woff2`);
      if (!fs.existsSync(file)) return '';
      const b64 = fs.readFileSync(file).toString('base64');
      return `@font-face{font-family:GmedicPoster;font-weight:${weight};font-style:normal;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
    })
    .join('');
  const logoFile = path.join(config.root, 'public', 'images', 'gmedic-logo-poster.png');
  const png = fs.readFileSync(logoFile);
  // PNG IHDR: width/height are big-endian uint32 at bytes 16 and 20.
  const logoRatio = png.readUInt32BE(20) / png.readUInt32BE(16);
  const logo = `data:image/png;base64,${png.toString('base64')}`;
  assets = { fontFaces, logo, logoRatio };
  return assets;
}

// ---- QR code as crisp vector modules ---------------------------------------
function qrPath(text) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'H' });
  const { size, data } = qr.modules;
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { d, size };
}

// ---- Decorative pieces -----------------------------------------------------
function plus(cx, cy, s, fill) {
  const t = s / 3;
  return `<g fill="${fill}"><rect x="${cx - s / 2}" y="${cy - t / 2}" width="${s}" height="${t}" rx="${t / 4}"/><rect x="${cx - t / 2}" y="${cy - s / 2}" width="${t}" height="${s}" rx="${t / 4}"/></g>`;
}

function dots(x0, y0, cols, rows, gap) {
  let out = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out += `<circle cx="${x0 + c * gap}" cy="${y0 + r * gap}" r="3.2"/>`;
  return `<g fill="#D3ECEC">${out}</g>`;
}

function hospitalBuilding() {
  return `
  <g mask="url(#bldFade)">
    <rect x="1010" y="560" width="60" height="255" fill="#D9EAF1"/>
    <rect x="812" y="545" width="200" height="270" fill="#F6FBFD"/>
    <rect x="812" y="545" width="200" height="10" fill="#E3EFF4"/>
    <rect x="902" y="488" width="104" height="70" fill="#FFFFFF"/>
    <rect x="902" y="488" width="104" height="8" fill="#E3EFF4"/>
    ${plus(954, 522, 44, '#22B8B0')}
    ${[590, 640, 690].map((y) => `
      <rect x="826" y="${y}" width="172" height="34" rx="3" fill="#B9DAE8"/>
      <rect x="826" y="${y}" width="172" height="12" rx="3" fill="#D6EBF3" opacity=".8"/>
      ${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${852 + i * 28}" y="${y}" width="3" height="34" fill="#EEF7FA"/>`).join('')}`).join('')}
    ${[590, 640, 690].map((y) => `<rect x="1018" y="${y + 4}" width="44" height="28" rx="2" fill="#A9CFDF" opacity=".85"/>`).join('')}
    <rect x="740" y="650" width="78" height="165" fill="#EDF5F9"/>
    <rect x="740" y="650" width="78" height="8" fill="#DDEBF1"/>
    <rect x="752" y="670" width="54" height="36" rx="3" fill="#BFDDEA"/>
    <rect x="752" y="720" width="54" height="36" rx="3" fill="#BFDDEA"/>
    <rect x="796" y="752" width="214" height="13" rx="3" fill="#FFFFFF" stroke="#D5E6EE" stroke-width="2"/>
    <rect x="812" y="765" width="9" height="50" fill="#E1EEF3"/>
    <rect x="985" y="765" width="9" height="50" fill="#E1EEF3"/>
    <rect x="846" y="772" width="116" height="43" rx="2" fill="#9ECDE0"/>
    <rect x="902" y="772" width="3" height="43" fill="#E7F4F8"/>
    <circle cx="1046" cy="768" r="34" fill="#6CC39A"/>
    <circle cx="1030" cy="786" r="24" fill="#4FB287"/>
    <circle cx="764" cy="792" r="22" fill="#7FCBA6"/>
    <ellipse cx="900" cy="816" rx="170" ry="10" fill="#8FD3B2" opacity=".55"/>
  </g>`;
}

// Step icons (drawn in a 120x120 box centred at cx, top at y)
function iconScan(cx, y) {
  const x = cx - 38;
  return `
  <rect x="${x}" y="${y}" width="76" height="112" rx="15" fill="none" stroke="${NAVY}" stroke-width="7"/>
  <g stroke="${TEAL}" stroke-width="5" stroke-linecap="round" fill="none">
    <path d="M${cx - 22} ${y + 38}v-9a4 4 0 0 1 4-4h9"/><path d="M${cx + 9} ${y + 25}h9a4 4 0 0 1 4 4v9"/>
    <path d="M${cx + 22} ${y + 74}v9a4 4 0 0 1-4 4h-9"/><path d="M${cx - 9} ${y + 87}h-9a4 4 0 0 1-4-4v-9"/>
  </g>
  <g fill="${TEAL}">
    <rect x="${cx - 12}" y="${y + 43}" width="10" height="10" rx="2"/><rect x="${cx + 2}" y="${y + 43}" width="10" height="10" rx="2"/>
    <rect x="${cx - 12}" y="${y + 57}" width="10" height="10" rx="2"/><rect x="${cx + 4}" y="${y + 59}" width="6" height="6" rx="1"/>
  </g>`;
}

function iconCalendarDoctor(cx, y) {
  const x = cx - 62;
  return `
  <rect x="${x}" y="${y + 12}" width="104" height="92" rx="12" fill="none" stroke="${NAVY}" stroke-width="7"/>
  <path d="M${x} ${y + 38}h104" stroke="${NAVY}" stroke-width="7"/>
  <path d="M${x + 26} ${y}v22M${x + 78} ${y}v22" stroke="${NAVY}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="${x + 46}" cy="${y + 58}" r="10" fill="none" stroke="${NAVY}" stroke-width="6"/>
  <path d="M${x + 26} ${y + 94}c0-12 9-20 20-20s20 8 20 20" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="${x + 104}" cy="${y + 96}" r="27" fill="#FFFFFF" stroke="${TEAL}" stroke-width="7"/>
  <path d="M${x + 104} ${y + 82}v15l10 7" fill="none" stroke="${TEAL}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function iconCardRupee(cx, y) {
  const x = cx - 62;
  return `
  <rect x="${x}" y="${y + 18}" width="112" height="78" rx="12" fill="none" stroke="${NAVY}" stroke-width="7"/>
  <path d="M${x} ${y + 42}h112" stroke="${NAVY}" stroke-width="10"/>
  <path d="M${x + 18} ${y + 74}h32" stroke="${NAVY}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="${x + 104}" cy="${y + 92}" r="30" fill="${TEAL}" stroke="#FFFFFF" stroke-width="5"/>
  <g transform="translate(${x + 104 - 16.8} ${y + 92 - 16.8}) scale(1.4)" fill="none" stroke="#FFFFFF" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 3h12"/><path d="M6 8h12"/><path d="m6 13 8.5 8"/><path d="M6 13h3"/><path d="M9 13c6.667 0 6.667-10 0-10"/>
  </g>`;
}

const chevron = (cx, cy) => `<path d="M${cx - 8} ${cy - 16}l16 16l-16 16" fill="none" stroke="#9FDCD8" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;

function googlePlayBadge(x, y) {
  const px = x + 20;
  const py = y + 15;
  return `
  <rect x="${x}" y="${y}" width="222" height="66" rx="11" fill="#000" stroke="#A6A6A6" stroke-width="1.5"/>
  <polygon points="${px},${py} ${px + 19},${py + 18} ${px},${py + 36}" fill="#00C3FF"/>
  <polygon points="${px},${py} ${px + 27},${py + 11} ${px + 19},${py + 18}" fill="#00E676"/>
  <polygon points="${px},${py + 36} ${px + 19},${py + 18} ${px + 27},${py + 25}" fill="#FF3D57"/>
  <polygon points="${px + 27},${py + 11} ${px + 37},${py + 18} ${px + 27},${py + 25} ${px + 19},${py + 18}" fill="#FFD500"/>
  <text x="${x + 70}" y="${y + 25}" font-size="12.5" font-weight="600" letter-spacing=".6" fill="#FFF">GET IT ON</text>
  <text x="${x + 69}" y="${y + 52}" font-size="25" font-weight="600" fill="#FFF">Google Play</text>`;
}

function appStoreBadge(x, y) {
  return `
  <rect x="${x}" y="${y}" width="222" height="66" rx="11" fill="#000" stroke="#A6A6A6" stroke-width="1.5"/>
  <g transform="translate(${x + 20} ${y + 14})" fill="#FFF">
    <path d="M17 0c0 4-3 7.5-6.5 7.5C10.5 3.5 13.5.5 17 0Z"/>
    <path d="M14 9.5c2 0 4-1.5 6.5-1.5 3 0 5.5 1.8 6.7 4-3.2 1.8-4.2 4.5-4.2 7 0 3.5 2 6 5 7-1 3-3 6.5-5.5 8-2 1.2-3.5.3-5.5.3-2.2 0-3.5.9-5.5.7-2.5-.5-6-5-7.7-9C1 20 1.5 13.5 5 10.5c1.8-1.5 3.8-2.2 5.8-2.2 1.2 0 2.2 1.2 3.2 1.2Z"/>
  </g>
  <text x="${x + 60}" y="${y + 25}" font-size="12.5" font-weight="500" fill="#FFF">Download on the</text>
  <text x="${x + 59}" y="${y + 53}" font-size="26" font-weight="600" fill="#FFF">App Store</text>`;
}

// ---- Poster ------------------------------------------------------------------
async function buildPosterSvg(hospital) {
  const { fontFaces, logo, logoRatio } = loadAssets();
  const qr = qrPath(await hospitalModel.qrPayload(hospital));
  const name = hospital.name;

  // Keep the "Scan to add <name>" line inside the poster for long names.
  const line1Chars = `Scan to add ${name}`.length;
  const captionSize = Math.max(20, Math.min(31, Math.floor(900 / (line1Chars * 0.56))));

  const frame = { x: 340, y: 520, w: 380, h: 372 };
  const qrSize = 296;
  const qrX = frame.x + (frame.w - qrSize) / 2;
  const qrY = frame.y + (frame.h - qrSize) / 2;

  const steps = [
    { cx: 213, icon: iconScan, label: ['Scan the QR'] },
    { cx: 527, icon: iconCalendarDoctor, label: ['Choose your', 'doctor &amp; slot'] },
    { cx: 842, icon: iconCardRupee, label: ['Pay &amp; get', 'your token'] },
  ];

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">
  <title>Gmedic QR poster — ${esc(name)}</title>
  <defs>
    <style>${fontFaces}</style>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#EEF8F9"/></linearGradient>
    <linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#0B9A95"/><stop offset=".45" stop-color="#34BDB6"/><stop offset="1" stop-color="#C9EEEB"/></linearGradient>
    <linearGradient id="ribbonLight" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#CFEFEE"/><stop offset="1" stop-color="#F1FAFA"/></linearGradient>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17ADA6"/><stop offset="1" stop-color="#0A8581"/></linearGradient>
    <linearGradient id="bldFadeGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".12" stop-color="#fff"/><stop offset="1" stop-color="#fff"/></linearGradient>
    <linearGradient id="bldFadeGradV" x1="0" y1="0" x2="0" y2="1"><stop offset=".8" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
    <mask id="bldFade" maskUnits="userSpaceOnUse" x="700" y="470" width="360" height="370">
      <rect x="700" y="470" width="360" height="370" fill="url(#bldFadeGrad)"/>
    </mask>
    <filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#0B4F5C" flood-opacity=".14"/></filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>

  <!-- background waves & shapes -->
  <path d="M600 0H${W}V270C980 205 880 150 765 118 690 98 640 55 600 0Z" fill="#E8F6F7"/>
  <path d="M0 300C210 325 365 440 470 565 560 670 665 730 830 748L${W} 765V835C820 822 640 770 520 668 400 565 245 455 0 430Z" fill="url(#ribbonLight)"/>
  <path d="M0 432C235 452 385 565 475 675 565 785 705 845 905 856L${W} 858V912C822 912 640 868 520 768 400 668 238 605 0 642Z" fill="url(#ribbon)"/>
  ${plus(112, 218, 96, '#E1F2F4')}
  ${plus(125, 778, 120, '#E1F2F4')}
  ${plus(272, 657, 62, '#BFE6E4')}
  ${plus(972, 293, 110, '#E6F4F6')}
  ${hospitalBuilding()}
  ${dots(14, 1150, 5, 5, 16)}
  <circle cx="1060" cy="1195" r="92" fill="#E3F4F4"/>
  <path d="M0 1182C250 1150 420 1232 620 1226 800 1221 930 1160 ${W} 1172V${H}H0Z" fill="#E4F5F4"/>

  <!-- logo -->
  <image href="${logo}" x="295" y="${Math.round(108 - (470 * logoRatio) / 2)}" width="470" height="${Math.round(470 * logoRatio)}" preserveAspectRatio="xMidYMid meet"/>

  <!-- headline -->
  <g text-anchor="middle" font-weight="800" font-size="86" letter-spacing="-2.5">
    <text x="${W / 2}" y="300" fill="${NAVY}">Skip the Queue<tspan dx="-7">.</tspan></text>
    <text x="${W / 2}" y="392" fill="${TEAL}">Book Your Doctor</text>
    <text x="${W / 2}" y="484"><tspan fill="${TEAL}">on </tspan><tspan fill="${NAVY}">Gmedic</tspan><tspan fill="${NAVY}" dx="-7">.</tspan></text>
  </g>

  <!-- QR -->
  <rect x="${frame.x}" y="${frame.y}" width="${frame.w}" height="${frame.h}" rx="30" fill="#FFFFFF" stroke="#12A59F" stroke-width="6" filter="url(#soft)"/>
  <svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" viewBox="0 0 ${qr.size} ${qr.size}" shape-rendering="crispEdges">
    <path d="${qr.d}" fill="${NAVY}"/>
  </svg>

  <!-- caption -->
  <g text-anchor="middle" font-weight="700" font-size="${captionSize}" fill="${NAVY}">
    <text x="${W / 2}" y="946">Scan to add <tspan fill="${TEAL}">${esc(name)}</tspan></text>
    <text x="${W / 2}" y="${946 + Math.round(captionSize * 1.25)}">to your Gmedic app.</text>
  </g>

  <!-- steps -->
  ${steps.map((s, i) => `
    <circle cx="${s.cx}" cy="1024" r="25" fill="#D9F2F0"/>
    <text x="${s.cx}" y="1034" text-anchor="middle" font-size="28" font-weight="700" fill="${TEAL}">${i + 1}</text>
    ${s.icon(s.cx, 1064)}
    <g text-anchor="middle" font-size="27" font-weight="800" fill="${NAVY}" letter-spacing="-.4">
      ${s.label.map((line, j) => `<text x="${s.cx}" y="${1212 + j * 33}">${line}</text>`).join('')}
    </g>`).join('')}
  ${chevron(368, 1118)}
  ${chevron(690, 1118)}

  <!-- store band -->
  <path d="M0 1268C220 1238 400 1296 600 1286 800 1276 930 1230 ${W} 1244V${H}H0Z" fill="url(#band)"/>
  <g text-anchor="middle" fill="#FFFFFF">
    <text x="${W / 2}" y="1306" font-size="22" font-weight="500" opacity=".95">Available on</text>
    <text x="${W / 2}" y="1343" font-size="30" font-weight="800">Google Play &amp; App Store</text>
  </g>
  ${googlePlayBadge(305, 1362)}
  ${appStoreBadge(553, 1362)}
  <g stroke="#FFFFFF" stroke-opacity=".7" stroke-width="1.5"><path d="M180 1463H262"/><path d="M798 1463H880"/></g>
  <text x="${W / 2}" y="1471" text-anchor="middle" font-size="22" font-weight="500" fill="#FFFFFF">Your hospital, your doctors — only on Gmedic.</text>
</svg>`;
}

module.exports = { buildPosterSvg, POSTER_SIZE: { width: W, height: H } };
