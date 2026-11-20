/**
 * Input: 合成 cases.json/overrides.json/used.json；不含任何真实税号、票号或金额
 * Output: 出口退税两表生成 CLI 的参数解析、受限输出、拒绝覆盖、控制台脱敏与退出码回归测试
 * Pos: build_tax_refund_declaration_tables.js 的 CLI Adapter 测试（计算口径与版式由 backend 服务测试覆盖）
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parseArgs, run } = require('./build_tax_refund_declaration_tables');

const SCRIPT = path.join(__dirname, 'build_tax_refund_declaration_tables.js');
const INVOICE = '12345678901234567890'; // 合成 20 位票号
const ASSOCIATION = '20261200100000001';
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'refund-tables-cli-'));
test.after(() => fs.rmSync(workDir, { recursive: true, force: true }));

/** 一票完整可录入的合成 case（整票、13% 专票）。 */
const syntheticCase = () => ({
  sequence: 1,
  invoice: INVOICE,
  is_candidate: true,
  issues: [],
  invoice_values: {
    live_details: [{
      数电发票号码: INVOICE, 开票日期: '2026-09-22', 销方识别号: 'SELLER001', 购方识别号: 'BUYER001',
      发票票种: '数电发票（增值税专用发票）', 发票状态: '正常', 是否正数发票: '是', 单位: '套', 数量: '5', 金额: '47988.35', 税率: '13%',
    }],
  },
  export: {
    申报年月: '202612', 申报批次: '001', 序号: '00000001', 关联号: ASSOCIATION, 出口发票号: 'EXP260001',
    出口货物报关单号: '123456789012345678001', 出口日期: '2026-09-27', 出口商品代码: '83062990',
    出口商品名称: '铁艺屏风', 计量单位: '千克', 出口数量: '2480', 美元离岸价: '6000',
  },
  rate: { CODE: '83062990', UNIT: '千克', TSL: '13', ZSSL_SET: '13', ST_DATE: '20190401', END_DATE: '21001231' },
  customs: { 出口报关单号: '123456789012345678', 项号: '1', 出口日期: '2026-09-27', 法定单位: '千克', 法定出口数量: '2480' },
  form_values: ['202612', '001', '00000001', ASSOCIATION, 'V', 'SELLER001', INVOICE, '2026-09-22', '83062990', '铁艺屏风', '千克', '2480', '47988.35', '13', '13', '6238.49', ''],
});

const writeJson = (name, value) => {
  const file = path.join(workDir, name);
  fs.writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
  return file;
};
const baseArgs = (casesFile, outDir) => ['--cases', casesFile, '--period', '202612', '--batch', '001', '--buyer-tax-id', 'BUYER001', '--as-of', '2026-11-19', '--out-dir', outDir];

test('parseArgs：解析 --key value，拒绝未知参数与缺值，识别 --help', () => {
  assert.deepEqual(parseArgs(['--cases', 'a.json', '--period', '202612']), { help: false, options: { cases: 'a.json', period: '202612' } });
  assert.equal(parseArgs(['-h']).help, true);
  assert.equal(parseArgs(['--help']).help, true);
  assert.throws(() => parseArgs(['--unknown', 'x']), /未知参数/);
  assert.throws(() => parseArgs(['positional']), /未知参数/);
  assert.throws(() => parseArgs(['--cases']), /缺少值/);
  assert.throws(() => parseArgs(['--cases', '--period', '202612']), /缺少值/);
});

test('run：生成受限输出，摘要只含条数与路径，不含税号/票号/金额', async () => {
  const casesFile = writeJson('cases-ok.json', [syntheticCase(), { sequence: 2, invoice: null, export: null, state: '未出口' }]);
  const outDir = path.join(workDir, 'out-ok');
  const summary = await run(baseArgs(casesFile, outDir));
  assert.equal(summary.outputDir, outDir);
  assert.equal(summary.ready, 1);
  assert.equal(summary.pending, 0);
  assert.equal(summary.excluded, 1);
  assert.deepEqual(summary.warnings, ['FUTURE_PERIOD']);
  assert.equal(summary.formalSubmission, false);
  assert.equal(summary.files.length, 4);
  assert.equal(fs.statSync(outDir).mode & 0o777, 0o700);
  for (const name of summary.files) assert.equal(fs.statSync(path.join(outDir, name)).mode & 0o777, 0o600, name);
  const printed = JSON.stringify(summary);
  for (const secret of [INVOICE, 'SELLER001', 'BUYER001', '6238.49', '47988.35', ASSOCIATION]) assert.ok(!printed.includes(secret), `摘要不应含 ${secret}`);
});

test('run：已存在的输出目录拒绝覆盖，且不改动原文件', async () => {
  const casesFile = writeJson('cases-overwrite.json', [syntheticCase()]);
  const outDir = path.join(workDir, 'out-overwrite');
  await run(baseArgs(casesFile, outDir));
  const planPath = path.join(outDir, 'plan.json');
  const before = fs.readFileSync(planPath, 'utf8');
  await assert.rejects(() => run(baseArgs(casesFile, outDir)), /已存在/);
  assert.equal(fs.readFileSync(planPath, 'utf8'), before);
});

test('run：--used 台账与 --overrides 被读取并作用于计划', async () => {
  const casesFile = writeJson('cases-used.json', [syntheticCase()]);
  const usedFile = writeJson('used.json', [{ invoice: INVOICE, association: ASSOCIATION, net: '1', status: 'submitted' }]);
  const used = await run([...baseArgs(casesFile, path.join(workDir, 'out-used')), '--used', usedFile]);
  assert.equal(used.ready, 0);
  assert.equal(used.pending, 1);

  const overridesFile = writeJson('overrides.json', { [ASSOCIATION]: { quantity: '2480', reason: '本次指定' } });
  const overridden = await run([...baseArgs(casesFile, path.join(workDir, 'out-override')), '--overrides', overridesFile]);
  assert.equal(overridden.ready, 1);
  const plan = JSON.parse(fs.readFileSync(path.join(workDir, 'out-override', 'plan.json'), 'utf8'));
  assert.equal(plan.entries[0].status, 'draft_only');
});

test('run：缺少必填参数、文件不存在、非法 JSON 均给出不回显内容的明确错误', async () => {
  await assert.rejects(() => run(['--period', '202612']), /缺少必填参数 --cases/);
  await assert.rejects(() => run(baseArgs(path.join(workDir, 'nope.json'), path.join(workDir, 'out-x'))), /cases文件不存在/);
  const bad = writeJson('bad.json', 'SECRET-TOKEN-XYZ is not json');
  await assert.rejects(
    () => run(baseArgs(bad, path.join(workDir, 'out-bad'))),
    (error) => /不是合法的 JSON/.test(error.message) && !error.message.includes('SECRET-TOKEN-XYZ'),
  );
  assert.equal(fs.existsSync(path.join(workDir, 'out-bad')), false);
});

test('命令行：--help 退出码 0；成功只打印摘要；失败退出码 1 且带统一前缀', () => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--buyer-tax-id/);

  const casesFile = writeJson('cases-spawn.json', [syntheticCase()]);
  const outDir = path.join(workDir, 'out-spawn');
  const ok = spawnSync(process.execPath, [SCRIPT, ...baseArgs(casesFile, outDir)], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const summary = JSON.parse(ok.stdout);
  assert.equal(summary.ready, 1);
  for (const secret of [INVOICE, 'SELLER001', '6238.49']) assert.ok(!ok.stdout.includes(secret));

  const again = spawnSync(process.execPath, [SCRIPT, ...baseArgs(casesFile, outDir)], { encoding: 'utf8' });
  assert.equal(again.status, 1);
  assert.match(again.stderr, /^\[tax-refund-declaration-tables\] .*已存在/);
  const missing = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /缺少必填参数/);
});
