const test = require('node:test');
const assert = require('node:assert/strict');

const commandModule = require('../agent/commands/query');
const searchController = require('./searchController');

test('searchController.search: 调用查询命令并返回统一响应', async () => {
  const originalSearch = commandModule.searchEntities;
  let capturedArgs = null;

  commandModule.searchEntities = async (args) => {
    capturedArgs = args;
    return [
      { type: 'product', id: 'product-1', title: '瓷砖', subtitle: '600x600', score: 100 },
    ];
  };

  try {
    let payload = null;
    const req = { query: { q: '瓷砖', types: 'product,supplier', limit: '5' } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return data;
      },
    };

    await searchController.search(req, res, (error) => {
      throw error;
    });

    assert.deepEqual(capturedArgs, {
      query: '瓷砖',
      types: ['product', 'supplier'],
      limit: 5,
    });
    assert.equal(payload.code, 200);
    assert.equal(payload.data.items.length, 1);
    assert.equal(payload.data.query, '瓷砖');
  } finally {
    commandModule.searchEntities = originalSearch;
  }
});
