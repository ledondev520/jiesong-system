const test = require('node:test');
const assert = require('node:assert/strict');
const { runCli } = require('./index');

const createBuffers = () => {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    },
  };
};

test('runCli: search --json 调用 SDK 并输出 JSON', async () => {
  const { stdout, io } = createBuffers();
  let captured = null;
  const client = {
    searchEntities: async (args) => {
      captured = args;
      return { query: '瓷砖', items: [{ type: 'product', id: 'p1', title: '瓷砖' }] };
    },
  };

  const exitCode = await runCli(['search', '瓷砖', '--types', 'product,supplier', '--limit', '5', '--json'], {
    client,
    ...io,
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(captured, { query: '瓷砖', types: ['product', 'supplier'], limit: 5 });
  assert.match(stdout.join(''), /"query":"瓷砖"/);
});

test('runCli: purchase create 从文件读取 payload 并输出结果', async () => {
  const { stdout, io } = createBuffers();
  let captured = null;
  const client = {
    createPurchase: async (payload) => {
      captured = payload;
      return { id: 'purchase-1', contractNo: 'CG2600001' };
    },
  };

  const exitCode = await runCli(['purchase', 'create', '--file', '/tmp/purchase.json', '--json'], {
    client,
    readFile: async () => JSON.stringify({
      supplierId: 'supplier-1',
      items: [{ productId: 'product-1', quantity: 10, unitPrice: 45 }],
    }),
    ...io,
  });

  assert.equal(exitCode, 0);
  assert.equal(captured.supplierId, 'supplier-1');
  assert.match(stdout.join(''), /CG2600001/);
});

test('runCli: supplier update 读取文件并调用 SDK', async () => {
  const { stdout, io } = createBuffers();
  let captured = null;
  const client = {
    updateSupplier: async (id, payload) => {
      captured = { id, payload };
      return { id, name: '佛山A厂' };
    },
  };

  const exitCode = await runCli(['supplier', 'update', '--id', 'supplier-1', '--file', '/tmp/supplier.json', '--json'], {
    client,
    readFile: async () => JSON.stringify({ contactPhone: '13800000000' }),
    ...io,
  });

  assert.equal(exitCode, 0);
  assert.equal(captured.id, 'supplier-1');
  assert.equal(captured.payload.contactPhone, '13800000000');
  assert.match(stdout.join(''), /supplier-1/);
});
