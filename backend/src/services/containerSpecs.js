/**
 * Input: config/containers.json（柜型内尺寸、安全上限、出柜阈值、装柜画像）
 * Output: 经校验的不可变柜型配置与 getContainerSpec / listContainerTypes
 * Pos: 货柜规格唯一来源；后端门槛与排柜读取，前端仅在测试中比对
 */

const fs = require('node:fs');
const path = require('node:path');
const { createError } = require('../middleware/errorHandler');

const CONFIG_PATH = path.resolve(__dirname, '../../../config/containers.json');
const AXES3 = ['length', 'width', 'height'];

const fail = (message) => { throw createError(`货柜配置无效：${message}`, 500); };
const positive = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(`${label} 必须是大于 0 的有限数字`);
  return value;
};
const dims = (value, keys, label) => {
  if (!value || typeof value !== 'object') fail(`${label} 缺失`);
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, positive(value[key], `${label}.${key}`)])));
};

const validateType = (code, raw) => {
  if (!raw || typeof raw !== 'object') fail(`柜型 ${code} 缺失`);
  if (typeof raw.label !== 'string' || !raw.label) fail(`${code}.label 缺失`);
  const innerMm = dims(raw.innerMm, AXES3, `${code}.innerMm`);
  const doorMm = dims(raw.doorMm, ['width', 'height'], `${code}.doorMm`);
  const spec = {
    code,
    label: raw.label,
    innerMm,
    doorMm,
    maxPayloadKg: positive(raw.maxPayloadKg, `${code}.maxPayloadKg`),
    safeGrossKg: positive(raw.safeGrossKg, `${code}.safeGrossKg`),
    safeVolumeCbm: positive(raw.safeVolumeCbm, `${code}.safeVolumeCbm`),
  };
  if (doorMm.width > innerMm.width || doorMm.height > innerMm.height) fail(`${code} 柜门不能大于内尺寸`);
  if (spec.safeGrossKg > spec.maxPayloadKg) fail(`${code}.safeGrossKg 不能超过 maxPayloadKg`);
  if (spec.safeVolumeCbm > (innerMm.length * innerMm.width * innerMm.height) / 1e9) {
    fail(`${code}.safeVolumeCbm 不能超过内容积`);
  }
  return Object.freeze(spec);
};

/** 校验并冻结配置；下划线开头的键（如 _note）被忽略。@throws 配置缺失或数值非法时 */
const validateContainerConfig = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('必须是 JSON 对象');
  if (!raw.types || typeof raw.types !== 'object') fail('types 缺失');
  const types = Object.fromEntries(Object.entries(raw.types).map(([code, value]) => [code, validateType(code, value)]));
  if (!Object.hasOwn(types, raw.default)) fail('default 必须是已定义的柜型');
  const thresholdPct = positive(raw.readyThresholdPct, 'readyThresholdPct');
  if (thresholdPct > 100) fail('readyThresholdPct 不能超过 100');
  const profiles = Object.fromEntries(Object.entries(raw.profiles || {}).map(([name, profile]) => [name, Object.freeze({
    match: Array.isArray(profile.match) ? Object.freeze(profile.match.map(String)) : fail(`profiles.${name}.match 必须是数组`),
    heavy: Boolean(profile.heavy),
    upright: Boolean(profile.upright),
    maxStackKg: positive(profile.maxStackKg, `profiles.${name}.maxStackKg`),
  })]));
  if (!profiles.default) fail('profiles.default 缺失');
  return Object.freeze({
    default: raw.default,
    readyThresholdPct: thresholdPct,
    minSupportRatio: positive(raw.minSupportRatio, 'minSupportRatio'),
    clearanceMm: dims(raw.clearanceMm, AXES3, 'clearanceMm'),
    types: Object.freeze(types),
    profiles: Object.freeze(profiles),
    heavyDensityKgPerCbm: positive(raw.heavyDensityKgPerCbm, 'heavyDensityKgPerCbm'),
  });
};

let cached;
/** 读取并校验一次；无效即抛错（fail closed）。 */
const loadContainerConfig = () => {
  if (!cached) {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {
      fail('config/containers.json 无法读取或 JSON 格式无效');
    }
    cached = validateContainerConfig(raw);
  }
  return cached;
};

const getContainerSpec = (code) => {
  const config = loadContainerConfig();
  const key = code === undefined || code === null || code === '' ? config.default : code;
  if (typeof key !== 'string' || !Object.hasOwn(config.types, key)) throw createError('未知柜型', 400);
  return config.types[key];
};

const listContainerTypes = () => {
  const config = loadContainerConfig();
  return Object.values(config.types)
    .sort((a, b) => (b.code === config.default) - (a.code === config.default))
    .map(({ code, label }) => ({ code, label }));
};

module.exports = { loadContainerConfig, validateContainerConfig, getContainerSpec, listContainerTypes };
