/**
 * Input: Real role fixture, committed migrations, ordinary HTTP routes and synthetic XLSX
 * Output: Six menu-document fixture contract checks (split from role-browser-server.test.js for parallel runs)
 * Pos: Backend HTTP/SQLite acceptance; no browser execution or production/provider access
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
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
/** 职责：构造内部三表输入；@param f 含合同、商品和装箱 ID 的夹具；@returns 档案 HS 三表请求，缺元数据时抛错 */
const formsInput = f => ({ salesContractId: f.salesId,
  items: [{ packingItemId: f.exportDocuments.packingItemId, productId: f.productId,
    hsCode: '9999999999', hsSource: 'stored' }],
  generateCustoms: true, generateForex: true, generateTaxRefund: true });
const packetInput = { spotRate: 7.2, sellerName: '合成卖方', buyerName: '合成买方',
  packageKind: 'CARTON', tradeTerm: 'FOB', documentDate: '2026-10-01' };
/** 职责：经真实 HTTP 生成三表并核对成功响应
 * @param f 当前合成角色 HTTP 夹具
 * @param token 当前合成 SALES 登录令牌
 * @returns 生成记录 ID 与警示；请求或状态断言失败时抛错 */
const generated = async (f, token) => {
  const response = await f.call('POST', '/three-forms/generate', formsInput(f), token);
  assert.equal(response.status, 200, response.body.message);
  return response.body.data;
};
/** 职责：限定此次三表导出；@param ids 真实生成的单据 ID；@returns 精确指定报关、核销和退税记录的查询参数 */
const formsQuery = ids => new URLSearchParams({ customsDeclarationId: ids.customsDeclarationId, forexId: ids.forexId, taxRefundId: ids.taxRefundId });
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
test('menu documents HTTP: prerequisites and discarded previews leave migrated records unchanged', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  assert.ok(f.read('SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL').length > 10);
  const before = documentSnapshot(f);
  const input = formsInput(f);
  input.items[0].hsSource = 'manual';
  input.items[0].hsCode = '9999999998';
  const blocked = await f.call('POST', '/three-forms/preview', input, token);
  assert.equal(blocked.status, 200);
  assert.equal(blocked.body.data.customsReady, false);
  assert.equal(blocked.body.data.taxRefundReady, false);
  assert.ok(blocked.body.data.issues.some(issue => issue.code === 'HS_CURRENT_EVIDENCE_MISSING'));
  assert.equal((await f.call('POST', '/three-forms/generate', input, token)).status, 400);
  const ready = await f.call('POST', '/three-forms/preview', formsInput(f), token);
  assert.equal(ready.status, 200);
  assert.equal(ready.body.data.customsReady, true);
  assert.equal(ready.body.data.taxRefundReady, true);
  assert.deepEqual(documentSnapshot(f), before);
});
test('menu documents HTTP: three forms generate linked drafts, read back and retain XLSX title/header/content', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const ids = await generated(f, token);
  const rows = documentSnapshot(f);
  assert.equal(rows.customs_declarations.length, 1);
  assert.equal(rows.forex_verifications.length, 1);
  assert.equal(rows.tax_refunds.length, 1);
  assert.equal(rows.customs_declarations[0].status, 'DRAFT');
  assert.equal(rows.forex_verifications[0].status, 'PENDING');
  assert.equal(rows.tax_refunds[0].status, 'DRAFT');
  assert.equal(rows.tax_refunds[0].refundedAmount, 0);
  assert.equal(rows.tax_refunds[0].declaredAmount, 100);
  assert.equal(rows.tax_refunds[0].refundableAmount, 13);
  assert.equal(rows.customs_declarations[0].totalAmount, 20);
  assert.equal(rows.customs_declaration_items[0].packingItemId, f.exportDocuments.packingItemId);
  assert.equal(rows.forex_verifications[0].customsDeclarationId, ids.customsDeclarationId);
  assert.equal(rows.tax_refunds[0].customsDeclarationId, ids.customsDeclarationId);
  assert.equal(rows.tax_refunds[0].forexVerificationId, ids.forexId);
  for (const [route, id] of [['customs-declarations', ids.customsDeclarationId], ['forex-verifications', ids.forexId], ['tax-refunds', ids.taxRefundId]]) {
    const result = await f.call('GET', `/${route}/${id}`, undefined, token);
    assert.equal(result.status, 200);
    assert.equal(result.body.data.salesContractId, f.salesId);
  }
  const query = formsQuery(ids);
  const { workbook, disposition } = await binary(f, token, `/three-forms/export/${f.salesId}?${query}`);
  assert.match(decodeURIComponent(disposition), new RegExp(f.salesNo));
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['报关单', '外汇核销单', '出口退税申报表']);
  const customs = workbook.getWorksheet('报关单');
  assert.equal(customs.getCell('A1').value, `出口货物报关单 — ${f.salesNo}`);
  assert.equal(customs.getCell('B2').value, rows.customs_declarations[0].declarationNo);
  assert.equal(customs.getRow(1).height, 36);
  assert.equal(customs.getRow(4).height, 28);
  assert.equal(customs.getCell('A4').font.bold, true);
  assert.equal(customs.getCell('A4').fill.fgColor.argb, 'FF1E40AF');
  assert.deepEqual(customs.getRow(4).values.slice(1), ['序号', '商品名称', 'HS 编码', '数量', '单位', '单价 (USD)', '总价 (USD)', '申报要素']);
  assert.deepEqual(customs.getRow(5).values.slice(1), [1, '合成角色验收商品', '9999999999', 10, '件', 2, 20, '合成测试要素']);
  assert.equal(workbook.getWorksheet('外汇核销单').getCell('B6').value, '20.00');
  assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B4').value, '100.00');
  assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B5').value, '13.00');
  assert.deepEqual(documentSnapshot(f), rows, 'export/readback are read-only');
});
test('menu documents HTTP: explicit repeated generation preserves existing append-version contract and exact export IDs', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const first = await generated(f, token);
  const second = await generated(f, token);
  assert.notEqual(second.customsDeclarationId, first.customsDeclarationId);
  const rows = documentSnapshot(f);
  assert.deepEqual(rows.customs_declarations.map(row => row.declarationNo).sort(), ['BGP-SYNTHETIC-MENU-DOCS', 'BGP-SYNTHETIC-MENU-DOCS-2']);
  for (const ids of [first, second]) {
    const declaration = rows.customs_declarations.find(row => row.id === ids.customsDeclarationId);
    const forex = rows.forex_verifications.find(row => row.id === ids.forexId);
    const refund = rows.tax_refunds.find(row => row.id === ids.taxRefundId);
    assert.equal(forex.customsDeclarationId, declaration.id);
    assert.equal(refund.customsDeclarationId, declaration.id);
    assert.equal(refund.forexVerificationId, forex.id);
    const { workbook } = await binary(f, token, `/three-forms/export/${f.salesId}?${formsQuery(ids)}`);
    assert.equal(workbook.getWorksheet('报关单').getCell('B2').value, declaration.declarationNo);
    assert.equal(workbook.getWorksheet('外汇核销单').getCell('B2').value, forex.verificationNo);
    assert.equal(workbook.getWorksheet('出口退税申报表').getCell('B2').value, refund.refundNo);
  }
  assert.deepEqual(documentSnapshot(f), rows);
});
test('menu documents HTTP: commercial preview validates metadata and cancel-equivalent remains read-only', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  const before = documentSnapshot(f);
  const route = `/sales/${f.salesId}/export-packet/preview`;
  assert.equal((await f.call('POST', route, { ...packetInput, buyerName: '' }, token)).status, 400);
  const preview = await f.call('POST', route, packetInput, token);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.data.ready, true);
  assert.equal(preview.body.data.lines[0].productName, '合成角色验收商品');
  assert.equal(preview.body.data.summary.purchaseCostCny, 113);
  // owner 14:33 rule: 11.3 × 1.3 ÷ 7 = 2.10 is under $5 → ceil to whole dollar = 3 USD per piece × 10
  assert.equal(preview.body.data.summary.totalUsd, 30);
  assert.deepEqual(documentSnapshot(f), before);
});
test('menu documents HTTP: commercial generation archives private workbook and repeated download preserves bytes', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
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
  assert.deepEqual(first.workbook.worksheets.map(sheet => sheet.name), ['外销合同', '商业发票', '装箱单']);
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
  assert.equal(saved.packing_items[0].unitPrice, packet.lines[0].unitPriceUsd);
  assert.deepEqual(documentSnapshot(f), saved);
});
test('menu documents HTTP: changed prerequisite causes genuine generation failure, explicit repair retries once', { timeout: 60000 }, async t => {
  const f = await fixtureFor(t, 'menu-export-documents');
  const token = await f.login('SALES');
  assert.equal((await f.call('POST', '/three-forms/preview', formsInput(f), token)).body.data.customsReady, true);
  const route = `/sales/${f.salesId}/packing-items/${f.exportDocuments.packingItemId}`;
  assert.equal((await f.call('PUT', route, { unitPrice: 0 }, token)).status, 200);
  const changed = documentSnapshot(f);
  const failed = await f.call('POST', '/three-forms/generate', formsInput(f), token);
  assert.equal(failed.status, 400);
  assert.match(failed.body.message, /缺少出口单价/);
  assert.deepEqual(documentSnapshot(f), changed);
  assert.equal((await f.call('PUT', route, { unitPrice: 2 }, token)).status, 200);
  await generated(f, token);
  const saved = documentSnapshot(f);
  assert.equal(saved.customs_declarations.length, 1);
  assert.equal(saved.forex_verifications.length, 1);
  assert.equal(saved.tax_refunds.length, 1);
});
