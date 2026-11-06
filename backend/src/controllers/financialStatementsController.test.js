/**
 * Input: 账期列表服务抛出含内部路径的原始错误
 * Output: 控制器交给 errorHandler，客户端拿不到原始消息
 * Pos: 财务报表 HTTP Adapter 500 脱敏回归
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const service = require('../services/financialStatementsService');
const { errorHandler } = require('../middleware/errorHandler');
const controller = require('./financialStatementsController');

test('listStatements: 500 经 errorHandler 脱敏，不返回原始错误消息', async (t) => {
  t.mock.method(service, 'listPeriods', async () => { throw new Error('SQLITE_CANTOPEN: /opt/secret/prod.db'); });
  t.mock.method(console, 'error', () => {});
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  await controller.listStatements({}, res, (err) => errorHandler(err, {}, res, () => {}));
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /SQLITE|secret/);
});
