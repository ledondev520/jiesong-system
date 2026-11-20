/**
 * Input: 仿真（合成）出口退税 cases；不含任何真实税号、票号或金额
 * Output: 进货/出口明细申报表生成引擎的计算口径、官方样表版式、文件安全与系统证据校验往返回归
 * Pos: taxRefundDeclarationTableService 的纯函数/文件输出测试；只写系统临时目录，不连数据库
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const ExcelJS = require('exceljs');
const service = require('./taxRefundDeclarationTableService');
const { parseFinancialEvidenceSource } = require('./financialEvidenceService');
const { validateTaxRefundEvidence } = require('../../scripts/import-tax-refund-evidence');

const { decimal } = service;
const pad = (value, width) => String(value).padStart(width, '0');
const INVOICE = '12345678901234567890'; // 合成 20 位进货凭证号
const invoiceFor = (sequence) => `1234567890123456${pad(7800 + sequence, 4)}`; // 每票不同的合成 20 位票号
const associationFor = (sequence) => `202612001${pad(sequence, 8)}`;

/** 一票完整可录入的合成 case：整票 5 套、金额 47988.35、13% 专票，对应出口 2480 千克。 */
function makeCase(sequence = 1, invoice = INVOICE) {
  const association = associationFor(sequence);
  return {
    sequence,
    invoice,
    is_candidate: true,
    issues: [],
    invoice_values: {
      live_details: [{
        数电发票号码: invoice, 开票日期: '2026-09-22', 销方识别号: 'SELLER001', 购方识别号: 'BUYER001',
        发票票种: '数电发票（增值税专用发票）', 发票状态: '正常', 是否正数发票: '是',
        单位: '套', 数量: '5', 金额: '47988.35', 税率: '13%', 税额: '6238.48',
      }],
    },
    export: {
      申报年月: '202612', 申报批次: '001', 序号: pad(sequence, 8), 关联号: association,
      出口发票号: 'EXP260001',
      出口货物报关单号: `123456789012345678${pad(sequence, 3)}`,
      出口日期: '2026-09-27', 出口商品代码: '83062990', 出口商品名称: '铁艺屏风', 计量单位: '千克',
      出口数量: '2480', 美元离岸价: '6000',
    },
    rate: { CODE: '83062990', UNIT: '千克', TSL: '13', ZSSL_SET: '13', ST_DATE: '20190401', END_DATE: '21001231' },
    customs: { 出口报关单号: '123456789012345678', 项号: String(sequence), 出口日期: '2026-09-27', 法定单位: '千克', 法定出口数量: '2480' },
    form_values: [
      '202612', '001', '00000001', association, 'V', 'SELLER001', invoice, '2026-09-22', '83062990', '铁艺屏风',
      '千克', '2480', '47988.35', '13', '13', '6238.49', '',
    ],
  };
}

const build = (cases, extra = {}) => service.buildDeclarationPlan(cases, {
  period: '202612', batch: '001', buyerTaxId: 'BUYER001', asOf: '2026-11-19', ...extra,
});

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'refund-tables-test-'));

async function loadFirstSheet(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  assert.equal(workbook.worksheets.length, 1);
  return workbook.worksheets[0];
}

test('分批用票：3/5 比例、数量、余额与草稿状态', () => {
  const c = makeCase();
  c.is_candidate = false;
  c.issues = ['原始重量冲突'];
  const plan = build([c], {
    overrides: { [c.export.关联号]: { fraction: { numerator: '3', denominator: '5' }, quantity: '2480', reason: '用户指定草稿参数，重量待核' } },
  });
  const row = plan.entries[0];
  assert.equal(row.status, 'draft_only');
  assert.equal(row.net, '28793.01');
  assert.equal(row.refund, '3743.09');
  assert.equal(row.invoice_quantity_used, '3');
  assert.equal(plan.balances[0].remaining_net, '19195.34');
  assert.equal(plan.balances[0].remaining_invoice_quantity, '2');
  assert.ok(row.warnings.length > 0);
  assert.ok(plan.warnings.includes('FUTURE_PERIOD'));
  assert.equal(plan.formal_submission, false);
});

test('普通发票不能被指定参数绕过', () => {
  const c = makeCase();
  c.invoice_values.live_details[0].发票票种 = '数电发票（普通发票）';
  const plan = build([c], { overrides: { [c.export.关联号]: { quantity: '2480', reason: '用户指定' } } });
  assert.equal(plan.entries.length, 0);
  assert.ok(plan.pending[0].errors.includes('INVOICE_TYPE'));
});

test('重复关联号、同票超额分配与历史占用超额直接失败', () => {
  const c = makeCase();
  assert.throws(() => build([c, structuredClone(c)]), /重复关联号/);
  assert.throws(() => build([c, makeCase(2)]), /同票累计计税金额超额/);
  assert.throws(() => build([c], { used: [{ invoice: INVOICE, net: '1', status: 'submitted' }] }), /同票累计计税金额超额/);
});

test('已申报与购方不符转为待核，并带固定错误码', () => {
  const c = makeCase();
  const submitted = build([c], { used: [{ invoice: INVOICE, net: '1', association: c.export.关联号, status: 'submitted' }] });
  assert.ok(submitted.pending[0].errors.includes('ALREADY_SUBMITTED'));
  c.invoice_values.live_details[0].购方识别号 = 'OTHER';
  assert.ok(build([c]).pending[0].errors.includes('BUYER_MISMATCH'));
});

test('文库过期、代码不符、缺原票明细均转为待核', () => {
  for (const [field, value, error] of [['END_DATE', '20200101', 'RATE_DATE'], ['CODE', '99999999', 'RATE_CODE']]) {
    const c = makeCase();
    c.rate[field] = value;
    assert.ok(build([c]).pending[0].errors.includes(error), error);
  }
  const noDetail = makeCase();
  noDetail.invoice_values.live_details = [];
  assert.deepEqual(build([noDetail]).pending[0].errors, ['INVOICE_DETAIL']);
});

test('标识符永不接受 Excel 数值化的票号', () => {
  const c = makeCase();
  c.invoice = 12345678901234567890;
  assert.throws(() => build([c]), /完整进货凭证号必须是完整文本/);
});

test('进货名称独立于出口名称', () => {
  const c = makeCase();
  c.export.出口商品名称 = '铁艺屏风（喷涂）';
  const entry = build([c]).entries[0];
  assert.equal(entry.name, '铁艺屏风');
  assert.equal(entry.export.出口商品名称, '铁艺屏风（喷涂）');
});

test('金额按分 HALF_UP 精确舍入，且不走浮点', () => {
  const c = makeCase();
  c.invoice_values.live_details[0].金额 = '100.00';
  c.form_values[12] = '0.285'; // 浮点会得到 0.28
  const plan = build([c]);
  assert.equal(plan.entries[0].net, '0.29');
  assert.equal(plan.entries[0].refund, '0.04');
  assert.equal(plan.entries[0].invoice_quantity_used, null);
  assert.equal(plan.balances[0].remaining_net, '99.71');
  assert.equal(plan.balances[0].remaining_invoice_quantity, null);
});

test('缺少本票分摊金额转为待核而不是崩溃', () => {
  const c = makeCase();
  c.form_values[12] = '';
  assert.deepEqual(build([c]).pending[0].errors, ['MISSING_ALLOCATION']);
});

test('数量超 5 位小数或离岸价超 2 位小数转为待核，不静默舍入', () => {
  const quantityCase = makeCase();
  quantityCase.form_values[11] = '2480.123456';
  quantityCase.export.出口数量 = '2480.123456';
  quantityCase.customs.法定出口数量 = '2480.123456';
  assert.deepEqual(build([quantityCase]).pending[0].errors, ['PRECISION']);

  const fobCase = makeCase();
  fobCase.export.美元离岸价 = '6000.005';
  assert.deepEqual(build([fobCase]).pending[0].errors, ['PRECISION']);

  const okCase = makeCase();
  okCase.form_values[11] = '2480.000000'; // 数值上仍是 5 位以内，允许
  assert.equal(build([okCase]).entries[0].quantity, '2480.00000');
});

test('未来申报月份只提示，不改月份', () => {
  assert.ok(build([makeCase()]).warnings.includes('FUTURE_PERIOD'));
  assert.deepEqual(build([makeCase()], { asOf: '2026-12-05' }).warnings, []);
  assert.equal(build([makeCase()]).period, '202612');
});

test('指定参数：不支持字段、缺原因、关联号不存在均失败', () => {
  const c = makeCase();
  assert.throws(() => build([c], { overrides: { [c.export.关联号]: { foo: 1, reason: '原因' } } }), /不支持的覆盖字段/);
  assert.throws(() => build([c], { overrides: { [c.export.关联号]: { quantity: '2480' } } }), /必须附带原因/);
  assert.throws(() => build([c], { overrides: { 20261200199999999: { reason: '原因' } } }), /关联号不存在/);
  assert.throws(() => build([c], { overrides: { [c.export.关联号]: { fraction: { numerator: '3', denominator: '4' }, reason: '原因' } } }), /分配分母应为原票数量/);
});

test('参数校验：申报年月、批次、购方、as-of、cases 类型', () => {
  const run = (patch) => () => build([makeCase()], patch);
  assert.throws(run({ period: '2026-12' }), /申报年月/);
  assert.throws(run({ period: '202613' }), /申报年月/);
  assert.throws(run({ batch: '1' }), /批次/);
  assert.throws(run({ buyerTaxId: '  ' }), /购方税号/);
  assert.throws(run({ asOf: '2026-02-30' }), /as-of/);
  assert.throws(() => service.buildDeclarationPlan({}, { period: '202612', batch: '001', buyerTaxId: 'B', asOf: '2026-11-19' }), /cases 必须是数组/);
});

test('未列入出口范围的 case 进入 excluded，不影响其余记录', () => {
  const plan = build([{ sequence: 9, invoice: INVOICE, export: null, state: '未出口' }, makeCase()]);
  assert.deepEqual(plan.excluded, [{ source_sequence: 9, invoice: INVOICE, reason: '未出口' }]);
  assert.equal(plan.entries.length, 1);
});

test('entries 按出口序号排序；进货表序号连续重排，出口表保留出口序号', () => {
  const plan = build([3, 1, 2].map((n) => makeCase(n, invoiceFor(n))));
  assert.deepEqual(plan.entries.map((e) => e.export_sequence), [1, 2, 3]);
  assert.deepEqual(plan.entries.map((e, i) => service.purchaseRowValues(e, i + 1)[2]), ['00000001', '00000002', '00000003']);
  assert.deepEqual(plan.entries.map((e) => service.exportRowValues(e)[2]), ['00000001', '00000002', '00000003']);
  assert.equal(plan.totals.count, 3);
  assert.equal(plan.totals.net, '143965.05');
  assert.equal(plan.totals.refund, '18715.47');
  assert.equal(plan.totals.export_usd, '18000.00');
});

test('进货明细行与官方样表逐列一致（千分位、税率去尾零、空备注为单空格）', () => {
  const entry = build([makeCase()]).entries[0];
  assert.deepEqual(service.purchaseRowValues(entry, 1), [
    '202612', '001', '00000001', '20261200100000001', 'V', 'SELLER001', INVOICE, '2026-09-22', '83062990', '铁艺屏风',
    '千克', '2,480.00000', '47,988.35', '13', '13', '6,238.49', ' ',
  ]);
  assert.equal(entry.refund_rate, '13.00'); // plan 保持原脚本口径，展示层才去尾零
});

test('出口明细行与官方样表逐列一致（退税额=可退税额，空值为单空格）', () => {
  const entry = build([makeCase()]).entries[0];
  assert.deepEqual(service.exportRowValues(entry), [
    '202612', '001', '00000001', '20261200100000001', '6,238.49', 'EXP260001', '123456789012345678001', ' ',
    '2026-09-27', '83062990', '铁艺屏风', '千克', '2,480.00000', '6,000.00', ' ', ' ', ' ',
  ]);
  assert.equal(entry.export.退税额, '6238.49');
});

test('出口发票号含冒号/空格时给出提示但不阻断', () => {
  const c = makeCase();
  c.export.出口发票号 = 'NO.: EXP260001';
  const entry = build([c]).entries[0];
  assert.equal(entry.status, 'ready');
  assert.ok(entry.warnings.some((w) => w.includes('出口发票号')));
  assert.equal(build([makeCase()]).entries[0].warnings.length, 0);
});

test('十进制：文法、舍入模式与边界', () => {
  assert.deepEqual(decimal.parse('13%'), { n: 13n, s: 0 });
  assert.deepEqual(decimal.parse('1,234.50000'), { n: 123450000n, s: 5 });
  assert.deepEqual(decimal.parse('1E+3'), { n: 1000n, s: 0 });
  assert.deepEqual(decimal.parse('1.5e-3'), { n: 15n, s: 4 });
  assert.deepEqual(decimal.parse(47988.35), { n: 4798835n, s: 2 });
  for (const bad of ['', '  ', null, undefined, 'abc', '1e999', '.', '--1', Number.NaN, Infinity, '1'.repeat(80)]) {
    assert.throws(() => decimal.parse(bad), undefined, String(bad));
  }
  const q = (text, places, mode) => decimal.toPlain(decimal.quantize(decimal.parse(text), places, mode));
  assert.equal(q('1.005', 2, 'HALF_UP'), '1.01');
  assert.equal(q('1.005', 2, 'HALF_EVEN'), '1.00');
  assert.equal(q('1.015', 2, 'HALF_EVEN'), '1.02');
  assert.equal(q('2.5', 0, 'HALF_UP'), '3');
  assert.equal(q('2.5', 0, 'HALF_EVEN'), '2');
  assert.equal(q('-1.005', 2, 'HALF_UP'), '-1.01');
  assert.equal(q('5', 2, 'HALF_UP'), '5.00');
  assert.equal(decimal.toPlain(decimal.mulDivQuantize([decimal.parse('47988.35'), decimal.parse('3')], decimal.parse('5'), 2)), '28793.01');
  assert.equal(decimal.toFixed(decimal.parse('13'), 2), '13.00');
  assert.equal(decimal.compare(decimal.parse('5.0'), decimal.parse('5.00')), 0);
  assert.throws(() => decimal.mulDivQuantize([decimal.parse('1')], decimal.parse('0'), 2), /除数不能为零/);
});

test('官方版式：进货表 Sheet 名、表头、文本格式、列宽行高、字体边框', async () => {
  const plan = build([makeCase()]);
  const sheet = await loadFirstSheet(await service.renderDeclarationWorkbook('purchase', plan));
  assert.equal(sheet.name, '数据');
  assert.deepEqual(sheet.getRow(1).values.slice(1), service.PURCHASE_HEADERS);
  assert.deepEqual([...service.PURCHASE_HEADERS], ['申报年月', '申报批次', '序号', '关联号', '税种', '供货方纳税号', '进货凭证号', '开票日期',
    '出口商品代码', '出口商品名称', '计量单位', '数量', '计税金额', '征税率%', '退税率%', '可退税额', '备注']);
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.getRow(1).height, 17.6);
  assert.equal(sheet.getRow(2).height, 17.6);
  for (let column = 1; column <= 17; column += 1) {
    assert.equal(sheet.getColumn(column).width, 16.62, `列 ${column} 宽度`);
    for (const rowNumber of [1, 2]) {
      const cell = sheet.getCell(rowNumber, column);
      assert.equal(cell.type, ExcelJS.ValueType.String, `${cell.address} 必须是文本`);
      assert.equal(cell.numFmt, '@');
      assert.equal(cell.font.name, '宋体');
      assert.equal(cell.font.size, 12);
      for (const side of ['top', 'left', 'bottom', 'right']) assert.equal(cell.border[side].style, 'thin', `${cell.address} ${side}`);
      assert.ok(!cell.alignment?.horizontal, `${cell.address} 水平对齐保持常规`);
    }
  }
});

test('官方版式：出口表 Sheet 名、表头居中、数据行仅右/下边框、列宽行高', async () => {
  const plan = build([makeCase()]);
  const sheet = await loadFirstSheet(await service.renderDeclarationWorkbook('export', plan));
  assert.equal(sheet.name, 'Sheet1');
  assert.deepEqual(sheet.getRow(1).values.slice(1), service.EXPORT_HEADERS);
  assert.deepEqual([...service.EXPORT_HEADERS], ['申报年月', '申报批次', '序号', '关联号', '退税额', '出口发票号', '出口货物报关单号', '代理出口货物证明号',
    '出口日期', '出口商品代码', '出口商品名称', '计量单位', '出口数量', '美元离岸价', '申报商品代码', '退（免）税业务类型', '备注']);
  assert.equal(sheet.getRow(1).height, 19.35);
  assert.equal(sheet.getRow(2).height, 13.5);
  const widths = [14.62, 12.62, 12.62, 20.75, 20.75, 35.12, 26.12, 20.38, 13.88, 13.75, 26.88, 13.75, 13.12, 13.12, 13.12, 20.38, 13.12];
  const headerSizes = [12, 11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12];
  for (let column = 1; column <= 17; column += 1) {
    assert.equal(sheet.getColumn(column).width, widths[column - 1], `列 ${column} 宽度`);
    const header = sheet.getCell(1, column);
    assert.equal(header.type, ExcelJS.ValueType.String);
    assert.equal(header.numFmt, '@');
    assert.equal(header.font.name, '宋体');
    assert.equal(header.font.size, headerSizes[column - 1], `${header.address} 字号`);
    assert.equal(header.alignment.horizontal, 'center');
    assert.equal(header.alignment.vertical, 'middle');
    for (const side of ['top', 'left', 'bottom', 'right']) assert.equal(header.border[side].style, 'thin');
    const body = sheet.getCell(2, column);
    assert.equal(body.type, ExcelJS.ValueType.String);
    assert.equal(body.numFmt, '@');
    assert.equal(body.font.size, 11);
    assert.equal(body.alignment.vertical, 'middle');
    assert.equal(body.border.right.style, 'thin');
    assert.equal(body.border.bottom.style, 'thin');
    assert.ok(!body.border.left?.style && !body.border.top?.style, `${body.address} 无左/上边框`);
  }
});

test('xlsx 全部为文本：公式样字符串、20 位票号原样保存，空值为单个空格', async () => {
  const c = makeCase();
  c.form_values[9] = '=1+1';
  const plan = build([c]);
  const purchase = await loadFirstSheet(await service.renderDeclarationWorkbook('purchase', plan));
  assert.equal(purchase.getCell('J2').value, '=1+1');
  assert.equal(purchase.getCell('J2').type, ExcelJS.ValueType.String);
  assert.equal(purchase.getCell('G2').value, INVOICE);
  assert.equal(purchase.getCell('Q2').value, ' ');
  const exported = await loadFirstSheet(await service.renderDeclarationWorkbook('export', plan));
  assert.equal(exported.getCell('G2').value, '123456789012345678001');
  assert.equal(exported.getCell('H2').value, ' ');
  await assert.rejects(() => service.renderDeclarationWorkbook('other', plan), /未知申报表类型/);
});

test('生成的两份 xlsx 能被系统既有证据解析与交叉校验读回', async () => {
  const plan = build([makeCase(1, invoiceFor(1)), makeCase(2, invoiceFor(2))]);
  const dir = path.join(tempDir(), 'run');
  const { files } = await service.writeDeclarationFiles(plan, dir);
  const documents = files.filter((name) => name.endsWith('.xlsx')).map((fileName) => parseFinancialEvidenceSource({
    buffer: fs.readFileSync(path.join(dir, fileName)), fileName, relativePath: fileName,
  }));
  assert.deepEqual(documents.map((d) => d.category).sort(), ['TAX_REFUND_EXPORT_DETAIL', 'TAX_REFUND_PURCHASE_DETAIL']);
  const result = validateTaxRefundEvidence(documents);
  assert.equal(result.exportRows, 2);
  assert.equal(result.purchaseRows, 2);
  assert.equal(result.declarationBatches, 1);
  assert.equal(result.totalRefundAmount, Number(plan.totals.refund));
});

test('写文件：固定清单、0700/0600、拒绝覆盖、plan.json 标明未正式申报', async () => {
  const plan = build([makeCase()]);
  const root = tempDir();
  const dir = path.join(root, 'nested', 'run');
  const result = await service.writeDeclarationFiles(plan, dir);
  assert.deepEqual(result.files, [
    '外贸企业出口退税进货明细申报表_202612-001.xlsx',
    '外贸企业出口退税出口明细申报表_202612-001.xlsx',
    'plan.json',
    '核对结果.md',
  ]);
  assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
  for (const name of result.files) assert.equal(fs.statSync(path.join(dir, name)).mode & 0o777, 0o600, name);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'));
  assert.equal(saved.formal_submission, false);
  assert.equal(saved.entries[0].invoice, INVOICE);

  const before = fs.readFileSync(path.join(dir, 'plan.json'), 'utf8');
  await assert.rejects(() => service.writeDeclarationFiles(plan, dir), /已存在/);
  assert.equal(fs.readFileSync(path.join(dir, 'plan.json'), 'utf8'), before);
});

test('渲染失败不留下半成品目录', async () => {
  const plan = build([makeCase()]);
  plan.entries[0].quantity = 'not-a-number';
  const dir = path.join(tempDir(), 'run');
  await assert.rejects(() => service.writeDeclarationFiles(plan, dir), /非法数字/);
  assert.equal(fs.existsSync(dir), false);
});

/**
 * 让目标目录内第 3 次 writeFileSync 失败（前两份已写出）；onFail 可在失败前做额外动作（如模拟他人放入文件）。
 * @returns {{calls: () => number}} 目标目录内已发生的写入次数
 */
function failThirdWrite(t, dir, onFail = () => {}) {
  const realWrite = fs.writeFileSync;
  let calls = 0;
  t.mock.method(fs, 'writeFileSync', (file, ...rest) => {
    if (String(file).startsWith(dir)) {
      calls += 1;
      if (calls === 3) {
        onFail(realWrite);
        throw new Error('磁盘已满');
      }
    }
    return realWrite(file, ...rest);
  });
  return { calls: () => calls };
}

test('写入中途失败：清掉本次写出的固定文件并移除空目录，原始错误照常抛出', async (t) => {
  const plan = build([makeCase()]);
  const dir = path.join(tempDir(), 'run');
  const probe = failThirdWrite(t, dir);
  await assert.rejects(() => service.writeDeclarationFiles(plan, dir), /磁盘已满/);
  assert.equal(probe.calls(), 3);
  assert.equal(fs.existsSync(dir), false);
});

test('写入中途失败：不递归删除目录里他人放入的内容', async (t) => {
  const plan = build([makeCase()]);
  const dir = path.join(tempDir(), 'run');
  failThirdWrite(t, dir, (realWrite) => realWrite(path.join(dir, '他人文件.txt'), 'keep')); // 模拟窗口期内他人放入文件
  await assert.rejects(() => service.writeDeclarationFiles(plan, dir), /磁盘已满/);
  assert.deepEqual(fs.readdirSync(dir), ['他人文件.txt']); // 本次写出的文件已删，他人文件与目录保留
  assert.equal(fs.readFileSync(path.join(dir, '他人文件.txt'), 'utf8'), 'keep');
});

test('核对结果.md 列出条数、待核项、提示与分批余额', () => {
  const partial = makeCase();
  partial.is_candidate = false;
  const bad = makeCase(2, invoiceFor(2));
  bad.rate.CODE = '99999999';
  const plan = build([partial, bad], {
    overrides: { [partial.export.关联号]: { fraction: { numerator: '3', denominator: '5' }, quantity: '2480', reason: '指定分摊' } },
  });
  const report = service.renderCheckReport(plan);
  assert.match(report, /可编入草稿：1条；待核：1条；未列入出口：0条/);
  assert.match(report, new RegExp(`${bad.export.关联号}：RATE_CODE`));
  assert.match(report, /用户指定草稿参数：指定分摊/);
  assert.match(report, /FUTURE_PERIOD/);
  assert.match(report, /## 原票余额（分批用票）/);
  assert.match(report, /剩余 19195\.34，剩余数量 2套/);
  assert.match(report, /不代表已录入、已保存、自检通过或正式申报/);
});
