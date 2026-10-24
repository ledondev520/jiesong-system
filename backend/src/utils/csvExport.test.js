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
