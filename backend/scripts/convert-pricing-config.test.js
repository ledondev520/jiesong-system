const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { convertPricingConfig } = require('./convert-pricing-config');
const { priceFor } = require('../src/services/exportPricing');
const shipped = require('../../config/pricing.json');

const oldTiered = { mode: 'tiered', exchangeAdjustment: -0.2, refundableMarkup: 0.3, noRefundMarkup: 0.1, multiplier: 1.3 };
const script = path.join(__dirname, 'convert-pricing-config.js');

test('旧 tiered 取可退税加价为默认加价，multiplier 取 乘数-1，其余字段保留', () => {
  assert.deepEqual(convertPricingConfig(oldTiered, 6.72), {
    exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [], roundUpTo: shipped.roundUpTo,
  });
  assert.equal(shipped.roundUpTo, 5, '锁定规则：整美元后再向上取整到 5 的倍数');
  assert.equal(convertPricingConfig({ ...oldTiered, mode: 'multiplier', multiplier: 1.4 }, 7).defaultMarkup, 0.4);
});

test('转换结果满足负责人例子：成本 10000 @ 现汇 6.72 → 1995（不是 1994）', () => {
  const converted = convertPricingConfig(oldTiered, 6.72);
  assert.equal(priceFor({ costCny: 10000, spotRate: 6.72 }, converted).unitPriceUsd, 1995);
  // 显式步长优先；步长 1 只给出整美元 1994，证明默认值必须来自仓库而不是写死 1
  assert.equal(priceFor({ costCny: 10000, spotRate: 6.72 }, convertPricingConfig(oldTiered, 6.72, 1)).unitPriceUsd, 1994);
});

test('CLI dry-run 打印的结果也是 ×5 配置，并可用 --round-up-to 显式覆盖', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-convert-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const file = path.join(dir, 'pricing.json');
  fs.writeFileSync(file, JSON.stringify(oldTiered), { mode: 0o600 });
  const dry = spawnSync('node', [script, '--file', file, '--spot-rate', '6.72'], { encoding: 'utf8' });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /"roundUpTo": 5/);
  const explicit = spawnSync('node', [script, '--file', file, '--spot-rate', '6.72', '--round-up-to', '5'], { encoding: 'utf8' });
  assert.match(explicit.stdout, /"roundUpTo": 5/);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), oldTiered);
});

test('已是新结构返回 null；未知结构或非法现汇抛错', () => {
  const current = convertPricingConfig(oldTiered, 6.72);
  assert.equal(convertPricingConfig(current, 6.72), null);
  assert.throws(() => convertPricingConfig({ foo: 1 }, 6.72), /旧结构/);
  assert.throws(() => convertPricingConfig(oldTiered, 0), /exchangeRate/);
  assert.throws(() => convertPricingConfig(oldTiered, 0.1), /无法报价/);
});

test('CLI：dry-run 不写文件；--confirm 先备份(0600)再原子替换，缺 --backup-dir 拒绝', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-convert-'));
  t.after(() => fs.rmSync(dir, { recursive: true }));
  const file = path.join(dir, 'pricing.json');
  fs.writeFileSync(file, JSON.stringify(oldTiered), { mode: 0o600 });
  const run = (...args) => spawnSync('node', [script, '--file', file, '--spot-rate', '6.72', ...args], { encoding: 'utf8' });

  assert.equal(run().status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), oldTiered);
  const refused = run('--confirm');
  assert.equal(refused.status, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), oldTiered);

  const backups = path.join(dir, 'backups');
  assert.equal(run('--confirm', '--backup-dir', backups).status, 0);
  assert.equal(JSON.parse(fs.readFileSync(file)).defaultMarkup, 0.3);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(fs.statSync(backups).mode & 0o777, 0o700);
  const [backup] = fs.readdirSync(backups);
  assert.equal(fs.statSync(path.join(backups, backup)).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backups, backup))), oldTiered);
  assert.match(run('--confirm', '--backup-dir', backups).stdout, /无需转换/);
});
