/** In-process HTTP serialization with synthetic reads; no database or source files. */
const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { IncomingMessage, ServerResponse } = require('node:http');
const { Duplex } = require('node:stream');

test('CSV export routes return UTF-8 BOM bytes and charset without altering content', async t => {
  const auth = require('../middleware/auth');
  t.mock.method(auth, 'authenticate', (req, res, next) => {
    req.user = { id: 'synthetic-admin', role: 'ADMIN' };
    next();
  });
  t.mock.method(require('../utils/auditLog'), 'logOperation', async () => ({}));
  const prisma = require('../utils/prisma');
  const rows = {};
  for (const model of ['supplier', 'store', 'product', 'purchaseContract', 'salesContract', 'inventory', 'payment', 'operationLog']) {
    const original = prisma[model].findMany;
    prisma[model].findMany = async () => rows[model] || [];
    t.after(() => { prisma[model].findMany = original; });
  }
  const app = express();
  app.use(express.json());
  app.use('/export', require('./dataExport'));
  app.use('/system', require('./system'));
  app.use('/import', require('./dataImport'));
  app.use('/tax-refunds', require('./taxRefunds'));
  app.use(require('../middleware/errorHandler').errorHandler);
  const download = async (route, options = {}) => {
    const chunks = [];
    const socket = new Duplex({
      read() {},
      write(chunk, encoding, callback) { chunks.push(Buffer.from(chunk)); callback(); },
    });
    const request = new IncomingMessage(socket);
    request.url = route;
    request.method = options.method || 'GET';
    const response = new ServerResponse(request);
    response.assignSocket(socket);
    // Exercise the actual router and Express send() serialization without a port.
    await new Promise((resolve, reject) => {
      response.once('finish', resolve);
      response.once('error', reject);
      app.handle(request, response);
    });
    socket.destroy();
    assert.equal(response.statusCode, 200, route);
    assert.equal(response.getHeader('content-type'), 'text/csv; charset=utf-8', route);
    const message = Buffer.concat(chunks);
    const bytes = message.subarray(message.indexOf('\r\n\r\n') + 4);
    assert.equal(bytes.length, Number(response.getHeader('content-length')), route);
    assert.deepEqual([...bytes.subarray(0, 3)], [0xEF, 0xBB, 0xBF], route);
    const text = bytes.toString('utf8');
    assert.notEqual(text[1], '\uFEFF', route);
    return text.slice(1);
  };
  for (const type of ['suppliers', 'stores', 'products', 'purchases', 'sales', 'containers', 'inventory', 'payments']) {
    const ordinary = await download(`/export/${type}`);
    assert.equal(await download(`/system/export/${type}`), ordinary);
  }
  rows.product = [{
    id: 'synthetic-product', customsName: '中文,"商品"', description: '第一行\n第二行',
    specification: '001', unit: '件', category: { name: '分类' },
  }];
  assert.equal(await download('/export/products'),
    '"ID","报关名","描述","规格","单位","分类"\n"synthetic-product","中文,""商品""","第一行\n第二行","001","件","分类"');
  rows.salesContract = [{
    contractNo: '合成合同', totalAmount: 100, receivedAmount: 25, exchangeRate: 7,
    status: 'DRAFT', signedAt: null,
  }];
  assert.equal(await download('/export/sales'),
    '"合同号","总金额(USD)","已收金额","未收金额","汇率","状态","签订日期"\n"合成合同","100","25","75","7","DRAFT",""');
  for (const kind of ['products', 'suppliers', 'stores', 'opening-inventory']) {
    const csv = await download(`/import/templates/${kind}?format=csv`);
    assert.ok(csv.endsWith('\r\n'));
  }
  assert.equal(await download('/system/logs/export/csv'),
    '"ID","时间","用户ID","用户名","姓名","动作","实体","实体ID","IP地址","UserAgent","修改前","修改后"');
  const service = require('../services/taxRefundExportService');
  const csv = '合同号,商品\r\nSYN-EXP-001,"中文,商品"\r\n';
  let source;
  t.mock.method(service, 'exportTaxRefunds', async () => ({ blocked: false, csv: source }));
  for (source of [csv, `\uFEFF${csv}`]) {
    assert.equal(await download('/tax-refunds/export?download=1', { method: 'POST' }), csv);
  }
});
