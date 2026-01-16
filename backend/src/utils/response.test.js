/**
 * Input: node:test、node:assert/strict、response工具
 * Output: 响应工具的单元测试结果
 * Pos: 后端响应工具测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { success, created, paginated } = require('./response');

/**
 * 职责：创建一个可链式调用的响应对象
 * @returns {object} 模拟的Express响应对象
 */
const createMockResponse = () => {
  // 0. 初始化可变字段
  const res = {
    statusCode: null,
    payload: null,
  };

  // 1. 构造链式方法
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };

  res.json = (body) => {
    res.payload = body;
    return res;
  };

  return res;
};

test('success: 使用默认值构造成功响应', () => {
  const res = createMockResponse();

  success(res);

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(res.payload, {
    code: 200,
    message: '操作成功',
    data: null,
  });
});

test('created: 返回201并复用success', () => {
  const res = createMockResponse();

  created(res, { id: 1 });

  assert.equal(res.statusCode, 201);
  assert.deepStrictEqual(res.payload, {
    code: 201,
    message: '创建成功',
    data: { id: 1 },
  });
});

test('paginated: 计算分页总页数', () => {
  const res = createMockResponse();

  paginated(res, [{ id: 1 }], 5, 2, 2);

  assert.equal(res.statusCode, 200);
  assert.deepStrictEqual(res.payload, {
    code: 200,
    message: '获取成功',
    data: {
      items: [{ id: 1 }],
      pagination: {
        total: 5,
        page: 2,
        pageSize: 2,
        totalPages: 3,
      },
    },
  });
});
