/**
 * Input: Real role fixture, committed migrations, ordinary HTTP routes and synthetic XLSX
 * Output: Four-documents (export packet) HTTP checks: preview is read-only; generation archives a private workbook (split from role-browser-server.test.js for parallel runs)
 * Pos: Backend HTTP/SQLite acceptance; no browser execution or production/provider access
 * OD-8: document generation is ADMIN only, so these checks sign in as the FINANCE persona (role ADMIN).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { fixtureFor } = require('./role-browser-fixture');

/** 职责：独立只读核对生成单据；@param f 合成 HTTP 夹具；@returns 业务行快照，读取或解析失败时抛错 */
const documentSnapshot = f => Object.fromEntries([
  'sales_contracts', 'packing_items', 'customs_declarations',
  'customs_declaration_items', 'forex_verifications', 'tax_refunds', 'contract_files', 'sales_contract_files',
].map(table => [table, f.read(`SELECT * FROM ${table} ORDER BY id`)]));
const packetInput = { spotRate: 7.2, sellerName: '合成卖方', buyerName: '合成买方',
  packageKind: 'CARTON', tradeTerm: 'FOB', documentDate: '2026-10-01' };
/** 职责：认证下载真实工作簿并解析完整字节
 * @param f 当前合成角色 HTTP 夹具
 * @param token 当前合成 SALES 登录令牌
 * @param route 不含 API 前缀的受保护下载路径
 * @returns 字节、工作簿和文件名头；请求、格式或解析失败时抛错 */
const binary = async (f, token, route) => {
  const response = await fetch(`${f.baseURL}/api/v1${route}`, { headers: { authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /spreadsheetml/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 2).toString(), 'PK');
  const workbook = new (require('exceljs').Workbook)();
  await workbook.xlsx.load(bytes);
  return { bytes, workbook, disposition: response.headers.get('content-disposition') };
};
test('menu documents HTTP: commercial preview validates metadata and cancel-equivalent remains read-only', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('FINANCE');
  const before = documentSnapshot(f);
  const route = `/sales/${f.salesId}/export-packet/preview`;
  assert.equal((await f.call('POST', route, { ...packetInput, buyerName: '' }, token)).status, 400);
  const preview = await f.call('POST', route, packetInput, token);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.ready, true);
  assert.equal(preview.body.data.lines[0].productName, '合成角色验收商品');
  assert.equal(preview.body.data.summary.purchaseCostCny, 113);
  // owner 14:33 rule: 11.3 × 1.3 ÷ 7 = 2.10 is under $10 → nearest 0.5 = 2 USD per piece × 10
  assert.equal(preview.body.data.summary.totalUsd, 20);
  assert.deepEqual(documentSnapshot(f), before);
});
test('menu documents HTTP: commercial generation archives private workbook and repeated download preserves bytes', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('FINANCE');
  const result = await f.call('POST', `/sales/${f.salesId}/export-packet/generate`, packetInput, token);
  assert.equal(result.status, 201);
  const { file, packet } = result.body.data;
  const saved = documentSnapshot(f);
  assert.equal(saved.sales_contract_files.length, 1);
  assert.equal(saved.sales_contract_files[0].id, file.id);
  const physical = path.resolve(f.directory, 'uploads', saved.sales_contract_files[0].filePath);
  assert.equal(fs.statSync(path.dirname(physical)).mode & 0o777, 0o700);
  assert.equal(fs.statSync(physical).mode & 0o777, 0o600);
  const first = await binary(f, token, `/files/${file.id}/download`);
  const repeated = await binary(f, token, `/files/${file.id}/download`);
  assert.deepEqual(first.bytes, repeated.bytes);
  assert.deepEqual(first.bytes, fs.readFileSync(physical));
  assert.equal(first.bytes.length, file.fileSize);
  assert.deepEqual(first.workbook.worksheets.map(sheet => sheet.name), ['外销合同', '商业发票', '装箱单', '报关预录信息']);
  for (const name of ['外销合同', '商业发票']) {
    const sheet = first.workbook.getWorksheet(name);
    assert.equal(sheet.getCell('B4').value, packetInput.sellerName);
    assert.equal(sheet.getCell('B5').value, packetInput.buyerName);
    assert.equal(sheet.getCell('G5').value, packetInput.documentDate);
    assert.equal(sheet.getCell('B10').value, '合成角色验收商品');
    assert.equal(sheet.getCell('H10').value, packet.summary.totalUsd);
  }
  assert.equal(first.workbook.getWorksheet('装箱单').getCell('F10').value, 2);
  assert.equal(first.workbook.getWorksheet('装箱单').getCell('G10').value, 20);
  assert.equal(first.workbook.getWorksheet('报关预录信息').getCell('H13').value.result, packet.summary.totalUsd);
  assert.equal(saved.packing_items[0].unitPrice, packet.lines[0].unitPriceUsd);
  assert.deepEqual(documentSnapshot(f), saved);
});
