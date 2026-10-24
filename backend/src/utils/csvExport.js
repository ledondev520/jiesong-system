/** Input: CSV text; Output: UTF-8 CSV text with a single leading BOM. */
const withUtf8Bom = (csv) => csv.startsWith('\uFEFF') ? csv : `\uFEFF${csv}`;

module.exports = { withUtf8Bom };
