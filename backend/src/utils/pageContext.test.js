const test = require('node:test');
const assert = require('node:assert/strict');
const { stripPageContext } = require('./pageContext');

test('stripPageContext removes one leading page-context line only', () => {
  assert.equal(stripPageContext('【当前页面：/dashboard/sales/EXP1，记录 ID：EXP1】\n这个订单还缺什么？'), '这个订单还缺什么？');
  assert.equal(stripPageContext('【当前页面：/dashboard/finance】\n你好'), '你好');
  assert.equal(stripPageContext('【当前页面：/a】\n【当前页面：/b】\n再来'), '【当前页面：/b】\n再来');
});

test('stripPageContext leaves other text untouched', () => {
  assert.equal(stripPageContext('普通问题'), '普通问题');
  assert.equal(stripPageContext('我想问【当前页面：x】\n是什么'), '我想问【当前页面：x】\n是什么');
  assert.equal(stripPageContext(''), '');
  assert.equal(stripPageContext(null), null);
});
