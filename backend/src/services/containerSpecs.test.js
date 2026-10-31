/**
 * Input: config/containers.json 与各种非法配置
 * Output: 柜型配置加载、校验与 fail-closed 行为
 * Pos: 货柜规格唯一来源的契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getContainerSpec,
  listContainerTypes,
  loadContainerConfig,
  validateContainerConfig,
} = require('./containerSpecs');

const real = () => JSON.parse(JSON.stringify(require('../../../config/containers.json')));

test('真实配置：默认 40HQ，尺寸与业主安全上限符合文档', () => {
  const config = loadContainerConfig();
  assert.equal(config.default, '40HQ');
  assert.equal(config.readyThresholdPct, 80);
  const hq = getContainerSpec();
  assert.equal(hq.code, '40HQ');
  assert.deepEqual(hq.innerMm, { length: 12020, width: 2350, height: 2695 });
  assert.deepEqual(hq.doorMm, { width: 2340, height: 2580 });
  assert.equal(hq.safeGrossKg, 22000);
  assert.equal(hq.safeVolumeCbm, 68);
  assert.deepEqual(Object.keys(config.types).sort(), ['20GP', '40GP', '40HQ']);
});

test('listContainerTypes 默认柜型排第一，getContainerSpec 对未知柜型返回 400', () => {
  assert.deepEqual(listContainerTypes()[0], { code: '40HQ', label: '40HQ 高柜' });
  assert.equal(listContainerTypes().length, 3);
  assert.equal(getContainerSpec('20GP').code, '20GP');
  for (const bad of ['45HQ', 'constructor', '__proto__', 5]) {
    assert.throws(() => getContainerSpec(bad), (error) => error.statusCode === 400 && error.message === '未知柜型');
  }
});

test('加载结果不可变', () => {
  assert.throws(() => { 'use strict'; getContainerSpec().safeGrossKg = 1; }, TypeError);
});

test('下划线开头的说明字段被忽略；真实配置通过校验', () => {
  const raw = real();
  assert.ok(raw._note);
  assert.doesNotThrow(() => validateContainerConfig(raw));
});

test('非法配置一律抛错', () => {
  const mutations = {
    '缺少 default': (c) => { delete c.default; },
    'default 不存在': (c) => { c.default = '45HQ'; },
    '柜门大于内尺寸': (c) => { c.types['40HQ'].doorMm.width = 9999; },
    '负数': (c) => { c.types['40HQ'].safeGrossKg = -1; },
    '非有限数字': (c) => { c.types['40HQ'].innerMm.length = '12020'; },
    '安全毛重超过最大载重': (c) => { c.types['40HQ'].safeGrossKg = c.types['40HQ'].maxPayloadKg + 1; },
    '安全体积超过内容积': (c) => { c.types['40HQ'].safeVolumeCbm = 100; },
    '阈值超过 100': (c) => { c.readyThresholdPct = 101; },
    '缺少 default 画像': (c) => { delete c.profiles.default; },
    '缺少 types': (c) => { delete c.types; },
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const config = real();
    mutate(config);
    assert.throws(() => validateContainerConfig(config), /货柜配置无效/, name);
  }
  assert.throws(() => validateContainerConfig(null), /货柜配置无效/);
});
