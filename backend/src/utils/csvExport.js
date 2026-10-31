/** Input: CSV text; Output: UTF-8 CSV text with a single leading BOM. */
const withUtf8Bom = (csv) => csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;

/**
 * Input: any cell value; Output: text safe against spreadsheet formula injection.
 * Strings starting with = + - @ TAB CR get a leading ' (OWASP CSV injection guard);
 * real numbers and plain numeric strings (e.g. "-5.00") stay untouched.
 */
const csvSafeText = (value) => {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (typeof value === 'number' || /^[+-]?\d+(\.\d+)?$/.test(text)) return text;
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
};

module.exports = { withUtf8Bom, csvSafeText };
