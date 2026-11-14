/** Synthetic Excel inputs for the upload-to-three-documents workflow. */
const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const { parseShipmentWorkbook, prepareExcelPacket, buildTemplatePacket } = require('./exportPacketExcelService');

const headers = ['报关名', '商品补充信息', '数量', '单位', '规格', '箱数', '毛重', '净重', '体积', '合同号', '报关公司', '采购金额', '出口单价(USD)'];
const row = (changes = {}) => ({ 报关名: '合成铺饭机', 商品补充信息: '2台设备与配套附件，保留一条', 数量: 4, 单位: '台', 规格: '600*400*700', 箱数: 14, 毛重: 256, 净重: 240, 体积: 1.47, 合同号: 'EXP990001', 报关公司: '捷淞', 采购金额: 10000, ...changes });
const workbook = async (rows, columns = headers) => {
  const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet('出货总清单');
  sheet.addRow(columns); rows.forEach((r) => sheet.addRow(columns.map((c) => r[c] ?? null)));
  return Buffer.from(await wb.xlsx.writeBuffer());
};
const profile = () => ({
  version: 1,
  defaults: { sellerName: '合成卖方', buyerName: 'Synthetic Buyer', packageKind: 'CARTON', tradeTerm: 'FOB' },
  goods: [{ name: '合成铺饭机', hsCode: '9999999999', declaration: '0|0|食品加工|无品牌|MODEL-A|||', origin: '合成货源地' }],
  quotes: [],
  refundLibrary: { version: 'TEST', checkedAt: '2026-11-14', records: [{ code: '99999999', rate: 13, startDate: '20260101', endDate: '21001231' }] },
});
const deps = () => ({ profile: profile(), getSpotRate: async () => 6.8, getRefundVersion: async () => 'TEST', today: '2026-11-14', historicalQuotes: [] });

test('同票混柜只选本方货物，补充信息不触发拆行，保留源顺序', async () => {
  const buffer = await workbook([row(), row({ 报关名: '他方商品', 报关公司: '其他厂家报关' }), row({ 报关名: '归属未清', 报关公司: '不报关' })]);
  const parsed = await parseShipmentWorkbook(buffer);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].quantity, 4);
  assert.equal(parsed.rows[0].sourceRow, 2);
  assert.equal(parsed.excludedRows.length, 2);
  const result = await prepareExcelPacket(buffer, {}, deps());
  assert.equal(result.packet.ready, true);
  assert.equal(result.packet.lines.length, 1);
  assert.equal(result.packet.lines[0].hsCode, '9999999999');
  assert.equal(result.packet.summary.boxes, 14);
});

test('多票必须选择EXP；不按柜名混入另一票，不自动删零补零', async () => {
  const buffer = await workbook([row(), row({ 合同号: 'EXP990002' })]);
  assert.equal((await parseShipmentWorkbook(buffer)).selectedContractNo, null);
  assert.equal((await parseShipmentWorkbook(buffer, 'EXP990002')).rows.length, 1);
  await assert.rejects(() => parseShipmentWorkbook(buffer, 'EXP9900002'), /合同号/);
});

test('数量别名可用，两列冲突报错；公式只读缓存且缺缓存不填零', async () => {
  const columns = headers.map((c) => c === '数量' ? '报关数量' : c);
  const parsed = await parseShipmentWorkbook(await workbook([row({ 报关数量: 4 })], columns));
  assert.equal(parsed.rows[0].quantity, 4);
  await assert.rejects(() => workbook([row({ 报关数量: 3 })], [...headers, '报关数量']).then(parseShipmentWorkbook), /数量.*冲突/);
  const cached = await parseShipmentWorkbook(await workbook([row({ 数量: { formula: '2+2', result: 4 } })]));
  assert.equal(cached.rows[0].quantity, 4);
  await assert.rejects(() => workbook([row({ 数量: { formula: '2+2' } })]).then(parseShipmentWorkbook), /公式.*缓存/);
});

test('Excel人工出口价优先且再次生成不被30%建议价覆盖', async () => {
  const result = await prepareExcelPacket(await workbook([row({ '出口单价(USD)': 600 })]), {}, deps());
  assert.equal(result.packet.lines[0].unitPriceUsd, 600);
  assert.equal(result.packet.lines[0].pricingSource, 'manual');
  assert.equal(result.packet.summary.totalUsd, 2400);
  assert.equal(result.packet.ready, true);
});

test('来源未知、税库未覆盖或失效、不唯一商品档案均不得自动放行', async () => {
  await assert.rejects(() => workbook([row({ 报关公司: '待定' })]).then(parseShipmentWorkbook), /报关公司/);
  const expired = deps(); expired.profile.refundLibrary.records[0].endDate = '20261101';
  const result = await prepareExcelPacket(await workbook([row()]), {}, expired);
  assert.equal(result.packet.ready, false);
  assert.equal(result.packet.lines[0].unitPriceUsd, 0);
  const ambiguous = deps(); ambiguous.profile.goods.push({ ...ambiguous.profile.goods[0], hsCode: '8888888888' });
  assert.equal((await prepareExcelPacket(await workbook([row()]), {}, ambiguous)).packet.ready, false);
});

test('无效文件和改动后的来源版本不能生成，预览不需要数据库写入', async () => {
  await assert.rejects(() => parseShipmentWorkbook(Buffer.from('not an xlsx')), /Excel/);
  await assert.rejects(() => workbook([]).then((buffer) => prepareExcelPacket(buffer, {}, deps())), /没有.*EXP/);
  const buffer = await workbook([row()]);
  await assert.rejects(() => prepareExcelPacket(buffer, { sourceVersion: 'old' }, deps()), /来源.*变化/);
});

test('原模板只填本票内容，保留条款与打印范围，三单公式金额一致且无提示文字', async () => {
  const wb = new ExcelJS.Workbook();
  for (const name of ['合同', '发票', '箱单']) {
    const s = wb.addWorksheet(name); s.getCell('A8').value = 'Item';
    s.getCell('A1').value = 'SYNTHETIC COMPANY'; s.getCell('B5').value = '合成卖方'; s.getCell('B6').value = 'Synthetic Buyer';
    s.getCell('A26').value = name === '箱单' ? 'SELLER:' : 'Existing payment terms';
    s.getCell('A35').value = 'SYNTHETIC BANK'; s.getCell('B9').value = '上一票商品';
    s.getCell('E9').value = 999; s.pageSetup = { orientation: 'portrait', paperSize: 9, printArea: name === '箱单' ? 'A1:H27' : 'A1:F44' };
    s.mergeCells('A25:C25');
  }
  const result = await prepareExcelPacket(await workbook([row({ '出口单价(USD)': 600 })]), {}, deps());
  const buffer = await buildTemplatePacket(result.packet, Buffer.from(await wb.xlsx.writeBuffer()));
  const saved = new ExcelJS.Workbook(); await saved.xlsx.load(buffer);
  assert.deepEqual(saved.worksheets.map((s) => s.name), ['合同', '发票', '箱单']);
  assert.equal(saved.getWorksheet('合同').getCell('A26').value, 'Existing payment terms');
  assert.equal(saved.getWorksheet('合同').getCell('F25').value.result, 2400);
  assert.equal(saved.getWorksheet('发票').getCell('F25').value.result, 2400);
  assert.equal(saved.getWorksheet('箱单').getCell('E25').value.result, 14);
  assert.equal(saved.getWorksheet('合同').getCell('B10').value, null);
  assert.equal(saved.getWorksheet('合同').pageSetup.printArea, 'A1:F44');
  saved.eachSheet((sheet) => sheet.eachRow((r) => r.eachCell((c) => assert.doesNotMatch(String(c.value?.result ?? c.value ?? ''), /DRAFT|待确认|源行|Source:|Scope:/))));
});


test('人工价生成后可按品名规格复用，自动建议不写入历史', async () => {
  const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
  const { saveManualQuotes, readConfirmedQuotes } = require('./exportPacketExcelService');
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'packet-quotes-'));
  try {
    const original = await prepareExcelPacket(await workbook([row({ '出口单价(USD)': 500 })]), {}, deps());
    await saveManualQuotes(original.packet, directory);
    await saveManualQuotes(original.packet, directory);
    const quotes = await readConfirmedQuotes(directory);
    assert.equal(quotes.length, 1);
    const nextDeps = deps(); nextDeps.historicalQuotes = quotes;
    const same = await prepareExcelPacket(await workbook([row()]), {}, nextDeps);
    assert.equal(same.packet.lines[0].unitPriceUsd, 500);
    const next = await prepareExcelPacket(await workbook([row({ 合同号: 'EXP990002' })]), {}, nextDeps);
    assert.equal(next.packet.lines[0].unitPriceUsd, 500);
    assert.equal(next.packet.lines[0].pricingSource, 'history');
    const changed = await prepareExcelPacket(await workbook([row({ 合同号: 'EXP990002', 采购金额: 20000 })]), {}, nextDeps);
    assert.equal(changed.packet.lines[0].pricingSource, 'history');
    assert.equal(changed.packet.lines[0].unitPriceUsd, 500);
    assert(changed.packet.issues.some((issue) => issue.code === 'CONFIRMED_PRICE_OUTSIDE_POLICY' && issue.severity === 'warning'));
    await saveManualQuotes(changed.packet, directory);
    assert.equal((await readConfirmedQuotes(directory)).length, 1);
    const names = await fs.readdir(directory);
    assert.equal((await fs.stat(path.join(directory, names[0]))).mode & 0o777, 0o600);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});


test('超过16行时模板扩展，原条款和合计顺延，配置变更阻止过时生成', async () => {
  const template = new ExcelJS.Workbook();
  for (const name of ['合同', '发票', '箱单']) {
    const sheet = template.addWorksheet(name); sheet.getCell('A8').value = 'Item';
    sheet.getCell('A26').value = 'Existing clause'; sheet.mergeCells('A26:F26');
  }
  const buffer = await workbook(Array.from({ length: 18 }, () => row()));
  const result = await prepareExcelPacket(buffer, {}, deps());
  const output = await buildTemplatePacket(result.packet, Buffer.from(await template.xlsx.writeBuffer()));
  const saved = new ExcelJS.Workbook(); await saved.xlsx.load(output);
  assert.equal(saved.getWorksheet('合同').getCell('F27').value.result, result.packet.summary.totalUsd);
  assert.equal(saved.getWorksheet('合同').getCell('A28').value, 'Existing clause');
  assert.equal(saved.getWorksheet('合同').pageSetup.printArea, 'A1:F46');
  const changed = deps(); changed.pricingConfig = { exchangeRate: 6.8, exchangeAdjustment: -0.1, defaultMarkup: 0.4, categoryMarkups: [] };
  await assert.rejects(() => prepareExcelPacket(buffer, { ...result.input, packetVersion: result.packetVersion }, changed), /依据已变化/);
});

test('稀疏超限坐标在Excel模型分配前拒绝', async () => {
  const AdmZip = require('adm-zip'); const zip = new AdmZip(await workbook([row()]));
  const xml = zip.readAsText('xl/worksheets/sheet1.xml').replace('r="A2"', 'r="A999999"');
  zip.updateFile('xl/worksheets/sheet1.xml', Buffer.from(xml));
  await assert.rejects(() => parseShipmentWorkbook(zip.toBuffer()), /范围|限制/);
});


test('异常工作表编号在分配Excel模型前拒绝，解析不能挂起', async () => {
  const { spawnSync } = require('node:child_process'); const path = require('node:path');
  const AdmZip = require('adm-zip'); const zip = new AdmZip(await workbook([row()]));
  zip.updateFile('xl/workbook.xml', Buffer.from(zip.readAsText('xl/workbook.xml').replace('sheetId="1"', 'sheetId="2147483647"')));
  const child = spawnSync(process.execPath, ['--max-old-space-size=128', '-e', `
    require('./src/services/exportPacketExcelService').loadWorkbook(require('fs').readFileSync(0))
      .then(() => process.exit(1))
      .catch(error => { require('node:assert/strict').match(error.message, /工作表编号超出限制/); });
  `], { cwd: path.resolve(__dirname, '../..'), input: zip.toBuffer(), timeout: 5000, env: { ...process.env, NODE_ENV: 'test', JWT_SECRET: 'test-only-workbook-boundary-never-production' } });
  assert.equal(child.error, undefined, '解析必须在超时前明确拒绝');
  assert.equal(child.status, 0);
});
