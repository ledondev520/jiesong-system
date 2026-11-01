/** Input: CSV text; Output: UTF-8 CSV text with a single leading BOM. */
const withUtf8Bom = (csv) => csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;

/**
 * Input: any cell value; Output: text safe against spreadsheet formula injection.
 * Strings starting with = + - @ TAB CR get a leading ' (OWASP CSV injection guard);
 * real numbers, plain numeric strings (e.g. "-5.00") and phone-style "+86 138-0000 (x)" (digits, space, ( ) - only) stay untouched.
 * shortcut: no letters/|/!/= means no function or DDE call, but Excel may still read "+86-138" as arithmetic; store phones as text if that matters.
 */
const csvSafeText = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (typeof value === 'number' || /^[+-]?\d+(\.\d+)?$/.test(text) || /^\+\d[\d ()-]*$/.test(text)) return text;
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

module.exports = { withUtf8Bom, csvSafeText };
