// Helpers available in every EJS view.

const ICON_SPRITE = '/images/fa-icons.svg';

function icon(name, className = '') {
  return `<svg class="icon${className ? ` ${className}` : ''}" aria-hidden="true" focusable="false"><use href="${ICON_SPRITE}#${name}"></use></svg>`;
}

// Safe JSON for embedding inside a <script> tag. U+2028/U+2029 are built with
// fromCharCode so the source file never contains raw line-separator characters.
const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);
const JSON_ESCAPES = { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026', [LS]: '\\u2028', [PS]: '\\u2029' };
const JSON_UNSAFE = new RegExp(`[<>&${LS}${PS}]`, 'g');

function json(value) {
  return JSON.stringify(value === undefined ? null : value).replace(JSON_UNSAFE, (c) => JSON_ESCAPES[c]);
}

module.exports = function locals(req, res, next) {
  res.locals.icon = icon;
  res.locals.json = json;
  res.locals.user = null;
  res.locals.hospital = null;
  res.locals.active = '';
  res.locals.scripts = [];
  next();
};
