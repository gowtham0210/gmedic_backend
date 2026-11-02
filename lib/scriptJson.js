// JSON for an inline <script>: "<" and the two JS line separators are escaped so stored text such as a doctor's
// bio (a closing script tag followed by new code) can't close the tag or run as code.
const LINE_SEPARATORS = new RegExp(`[${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}]`, 'g');

export function scriptJson(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(LINE_SEPARATORS, (c) => `\\u${c.charCodeAt(0).toString(16)}`);
}
