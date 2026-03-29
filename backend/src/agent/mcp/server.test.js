const test = require('node:test');
const assert = require('node:assert/strict');
const { createMcpServer } = require('./server');

test('MCP server: tools/list 返回预期工具', async () => {
  const server = createMcpServer({
    searchEntities: async () => ({ items: [] }),
    createPurchase: async () => ({ id: 'purchase-1' }),
    createSupplier: async () => ({ id: 'supplier-1' }),
    updateSupplier: async () => ({ id: 'supplier-1' }),
    updatePurchase: async () => ({ id: 'purchase-1' }),
  });

  const response = await server.handleMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {},
  });

  assert.equal(response.result.tools.length, 5);
  assert.deepEqual(response.result.tools.map((tool) => tool.name), [
    'search_entities',
    'create_purchase_with_items',
    'create_supplier',
    'update_supplier',
    'update_purchase',
  ]);
});

test('MCP server: tools/call 路由到 search_entities', async () => {
  let captured = null;
  const server = createMcpServer({
    searchEntities: async (args) => {
      captured = args;
      return { query: '瓷砖', items: [{ id: 'p1', type: 'product', title: '瓷砖' }] };
    },
    createPurchase: async () => ({ id: 'purchase-1' }),
    createSupplier: async () => ({ id: 'supplier-1' }),
    updateSupplier: async () => ({ id: 'supplier-1' }),
    updatePurchase: async () => ({ id: 'purchase-1' }),
  });

  const response = await server.handleMessage({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'search_entities',
      arguments: {
        query: '瓷砖',
        types: ['product'],
        limit: 5,
      },
    },
  });

  assert.deepEqual(captured, { query: '瓷砖', types: ['product'], limit: 5 });
  assert.equal(response.result.structuredContent.query, '瓷砖');
});
