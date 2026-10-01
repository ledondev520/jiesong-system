/**
 * Input: 分页工具函数
 * Output: 分页元数据与统一 payload 组装断言
 * Pos: 后端工具链测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPaginationMeta, buildPaginatedPayload } = require('./pagination');

test('buildPaginationMeta: 计算分页字段', () => {
  const payload = buildPaginationMeta(30, 3, 10);

  assert.deepEqual(payload, {
    total: 30,
    page: 3,
    pageSize: 10,
    totalPages: 3,
  });
});

test('buildPaginatedPayload: 组装标准分页响应并保留扩展字段', () => {
  const payload = buildPaginatedPayload([{ id: 1 }], 5, 2, 2, { unreadCount: 1 });

  assert.equal(payload.code, 200);
  assert.equal(payload.message, '获取成功');
  assert.deepEqual(payload.data, {
    items: [{ id: 1 }],
    pagination: {
      total: 5,
      page: 2,
      pageSize: 2,
      totalPages: 3,
    },
    unreadCount: 1,
  });
});

test('normalizePagination: 超大页码不产生不安全的数据库 offset，正常页码保持不变', () => {
  const { normalizePagination } = require('./pagination');
  const normalized = normalizePagination({ page: '99999999999999999999999999', pageSize: '500' });
  assert.ok(Number.isSafeInteger(normalized.skip));
  assert.ok(normalized.skip >= 0);
  assert.deepEqual(normalizePagination({ page: '2', pageSize: '100' }), { page: 2, pageSize: 100, skip: 100 });
});
