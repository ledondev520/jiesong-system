const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const pricing = require('./pricingConfigService');
const defaults = require('../../../config/pricing.json');

test('shared schema rejects types, keys, nonfinite numbers, decimals and range violations', () => {
  for (const value of [null, [], {}, { ...defaults, unknown: 1 }, { ...defaults, mode: 'tiered' }]) {
    assert.throws(() => pricing.validatePricingConfig(value), /报价配置/);
  }
  for (const key of ['exchangeRate', 'exchangeAdjustment', 'defaultMarkup', 'roundUpTo']) {
    for (const value of [null, true, '', '0.3', NaN, Infinity, 1e9, -1e9]) {
      assert.throws(() => pricing.validatePricingConfig({ ...defaults, [key]: value }), new RegExp(key));
    }
  }
  const bad = (change) => assert.throws(() => pricing.validatePricingConfig({ ...defaults, ...change }), /报价配置/);
  bad({ exchangeRate: 0 });
  bad({ exchangeRate: 100.01 });
  bad({ exchangeRate: 6.72001 }); // 最多 4 位小数
  bad({ defaultMarkup: -0.01 });
  bad({ defaultMarkup: 1.01 });
  bad({ roundUpTo: 0 });
  bad({ roundUpTo: 1.5 });
  bad({ exchangeRate: 0.1, exchangeAdjustment: -0.2 }); // 现汇+调整必须大于 0
  assert.equal(pricing.validatePricingConfig({ ...defaults, exchangeRate: 6.7235 }).exchangeRate, 6.7235);
  assert.equal(pricing.validatePricingConfig({ ...defaults, roundUpTo: 1000 }).roundUpTo, 1000);
});

test('category markups: shape, duplicates, range and unknown keys', () => {
  const entry = { categoryId: 'c1', categoryName: '瓷砖', markup: 0.1 };
  const ok = pricing.validatePricingConfig({ ...defaults, categoryMarkups: [entry] });
  assert.deepEqual(ok.categoryMarkups, [entry]);
  assert.throws(() => pricing.validatePricingConfig({ ...defaults, categoryMarkups: 'x' }), /categoryMarkups/);
  for (const bad of [
    { ...entry, markup: 1.5 }, { ...entry, markup: '0.1' }, { ...entry, categoryId: '' },
    { ...entry, categoryName: 5 }, { ...entry, extra: 1 }, null,
  ]) {
    assert.throws(() => pricing.validatePricingConfig({ ...defaults, categoryMarkups: [bad] }), /categoryMarkups/);
  }
  assert.throws(() => pricing.validatePricingConfig({ ...defaults, categoryMarkups: [entry, entry] }), /重复/);
});

test('one file is reloaded; malformed/missing files fail closed and writes are versioned', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-config-'));
  const target = path.join(dir, 'pricing.json');
  const old = process.env.JIESONG_PRICING_CONFIG;
  process.env.JIESONG_PRICING_CONFIG = target;
  t.after(() => { if (old === undefined) delete process.env.JIESONG_PRICING_CONFIG; else process.env.JIESONG_PRICING_CONFIG = old; fs.rmSync(dir, { recursive: true }); });
  assert.throws(() => pricing.loadPricingConfig(), /无法读取/);
  fs.writeFileSync(target, '{bad');
  assert.throws(() => pricing.loadPricingConfig(), /JSON/);
  // 旧结构（tiered/multiplier）必须被拒绝，而不是悄悄套默认值
  fs.writeFileSync(target, JSON.stringify({ mode: 'tiered', exchangeAdjustment: -0.2, refundableMarkup: 0.3, noRefundMarkup: 0.1, multiplier: 1.3 }));
  assert.throws(() => pricing.loadPricingConfig(), /报价配置/);
  fs.writeFileSync(target, JSON.stringify(defaults));
  const snapshot = pricing.loadPricingSnapshot();
  assert.deepEqual(snapshot.config, defaults);
  assert.throws(() => pricing.updatePricingConfig(defaults, '', 'synthetic-admin'), /版本/);
  const next = { ...defaults, exchangeAdjustment: -0.1, categoryMarkups: [{ categoryId: 'c1', categoryName: '瓷砖', markup: 0.1 }] };
  const saved = pricing.updatePricingConfig(next, snapshot.revision, 'synthetic-admin');
  assert.deepEqual(JSON.parse(fs.readFileSync(target)), next);
  assert.deepEqual(pricing.loadPricingConfig(), next);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.throws(() => pricing.updatePricingConfig(defaults, snapshot.revision, 'synthetic-admin'), /已变更/);
  // 内容相同的保存不改写文件、不换版本
  assert.equal(pricing.updatePricingConfig(next, saved.revision, 'synthetic-admin').revision, saved.revision);
  fs.writeFileSync(`${target}.lock`, '');
  assert.throws(() => pricing.updatePricingConfig(defaults, saved.revision, 'synthetic-admin'), /正在更新/);
  fs.unlinkSync(`${target}.lock`);
  fs.writeFileSync(target, JSON.stringify({ ...next, roundUpTo: 0 }));
  assert.throws(() => pricing.loadPricingConfig(), /roundUpTo/);
});
