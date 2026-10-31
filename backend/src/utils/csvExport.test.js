const test = require('node:test');
const assert = require('node:assert/strict');
const { withUtf8Bom } = require('./csvExport');

test('CSV BOM preserves all content and is idempotent for empty and populated CSVs', () => {
  for (const csv of ['', '名称,数量\r\n"中文,商品",001\r\n', '"名称"\n"内嵌\uFEFF字符"']) {
    const result = withUtf8Bom(csv);
    assert.equal(result, `\uFEFF${csv}`);
    assert.deepEqual([...Buffer.from(result).subarray(0, 3)], [0xEF, 0xBB, 0xBF]);
    assert.equal(withUtf8Bom(result), result);
  }
});

const { csvSafeText } = require('./csvExport');

test('csvSafeText prefixes formula triggers but keeps numbers and normal text', () => {
  for (const bad of ['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tx', '\rx', '-cmd|calc']) {
    assert.equal(csvSafeText(bad), `'${bad}`);
  }
  for (const [input, out] of [[-5.5, '-5.5'], ['-5.00', '-5.00'], ['+12', '+12'], ['中文', '中文'], ['a=b', 'a=b'], [null, ''], [undefined, ''], [0, '0']]) {
    assert.equal(csvSafeText(input), out);
  }
});

test('all CSV writers neutralise formula cells', () => {
  const { toCSV } = require('../services/exportService');
  const { buildCsv } = require('../services/taxRefundExportService');
  const { buildOperationLogCsv } = require('../controllers/system/notificationController');
  assert.match(toCSV(['h'], [['=1+1'], [-3]]), /"'=1\+1"\n"-3"$/);
  assert.match(buildCsv([{ refund_no: '@x', note: '=HYPERLINK("u")' }]), /^refund_no,[^\n]*\n'@x,/);
  assert.match(buildCsv([{ note: '=HYPERLINK("u")' }]), /"'=HYPERLINK/);
  const log = buildOperationLogCsv([{ id: 1, user: { username: '=cmd' }, action: '+a', entity: 'E', newValue: '-x' }]);
  assert.match(log, /"'=cmd"/);
  assert.match(log, /"'\+a"/);
  assert.match(log, /"'-x"/);
});
