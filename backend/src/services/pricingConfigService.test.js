const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const pricing = require('./pricingConfigService');
const defaults = require('../../../config/pricing.json');

test('shared schema rejects types, keys, nonfinite numbers and range violations in JS and Python', () => {
  const invalid = [null, [], {}, { ...defaults, unknown: 1 }, { ...defaults, mode: 'automatic' }];
  for (const [key, rule] of Object.entries(pricing.schema.properties)) {
    if (rule.type !== 'number') continue;
    for (const value of [null, true, '', '0.3', NaN, Infinity, rule.minimum - 0.001, rule.maximum + 0.001]) {
      assert.throws(() => pricing.validatePricingConfig({ ...defaults, [key]: value }), new RegExp(key));
      invalid.push({ ...defaults, [key]: value });
    }
    for (const value of [rule.minimum, rule.maximum]) {
      assert.equal(pricing.validatePricingConfig({ ...defaults, [key]: value })[key], value);
    }
  }
  for (const value of invalid.slice(0, 5)) assert.throws(() => pricing.validatePricingConfig(value), /报价配置/);
  const python = spawnSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'scripts')
from pricing_config import validate_pricing_config
values=json.load(sys.stdin)
for value in values:
    try: validate_pricing_config(value)
    except ValueError: continue
    raise AssertionError('invalid configuration accepted')
print(len(values))
`], { cwd: path.resolve(__dirname, '../../..'), input: JSON.stringify(invalid), encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.equal(Number(python.stdout), invalid.length);
});

test('one file is reloaded by both languages; malformed/missing files fail closed and writes are versioned', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pricing-config-'));
  const target = path.join(dir, 'pricing.json');
  const old = process.env.JIESONG_PRICING_CONFIG;
  process.env.JIESONG_PRICING_CONFIG = target;
  t.after(() => { if (old === undefined) delete process.env.JIESONG_PRICING_CONFIG; else process.env.JIESONG_PRICING_CONFIG = old; fs.rmSync(dir, { recursive: true }); });
  assert.throws(() => pricing.loadPricingConfig(), /无法读取/);
  fs.writeFileSync(target, '{bad');
  assert.throws(() => pricing.loadPricingConfig(), /JSON/);
  fs.writeFileSync(target, JSON.stringify(defaults));
  const snapshot = pricing.loadPricingSnapshot();
  assert.deepEqual(snapshot.config, defaults);
  assert.throws(() => pricing.updatePricingConfig(defaults, '', 'synthetic-admin'), /版本/);
  const next = { ...defaults, exchangeAdjustment: -0.1 };
  const saved = pricing.updatePricingConfig(next, snapshot.revision, 'synthetic-admin');
  assert.deepEqual(JSON.parse(fs.readFileSync(target)), next);
  assert.deepEqual(pricing.loadPricingConfig(), next);
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
  assert.throws(() => pricing.updatePricingConfig(defaults, snapshot.revision, 'synthetic-admin'), /已变更/);
  fs.writeFileSync(`${target}.lock`, '');
  assert.throws(() => pricing.updatePricingConfig(defaults, saved.revision, 'synthetic-admin'), /正在更新/);
  fs.unlinkSync(`${target}.lock`);
  const python = spawnSync('python3', ['-c', "import json,sys;sys.path.insert(0,'scripts');from pricing_config import load_pricing_config;print(json.dumps(load_pricing_config()))"], { cwd: path.resolve(__dirname, '../../..'), env: process.env, encoding: 'utf8' });
  assert.equal(python.status, 0, python.stderr);
  assert.deepEqual(JSON.parse(python.stdout), next);
  assert.match(python.stderr, /pricing_config_loaded/);
  assert.equal(JSON.parse(python.stderr.trim()).revision, saved.revision);
  fs.writeFileSync(target, JSON.stringify({ ...next, multiplier: 0 }));
  assert.throws(() => pricing.loadPricingConfig(), /multiplier/);
});
