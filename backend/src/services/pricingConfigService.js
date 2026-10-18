const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createError } = require('../middleware/errorHandler');
const schema = require('../../../config/pricing.schema.json');
const defaultPath = path.resolve(__dirname, '../../../config/pricing.json');
const observed = new Map();

const configPath = () => path.resolve(process.env.JIESONG_PRICING_CONFIG || defaultPath);
const revisionOf = config => crypto.createHash('sha256').update(JSON.stringify(config)).digest('hex');
const audit = (event, details) => process.stderr.write(`${JSON.stringify({
  timestamp: new Date().toISOString(), event, ...details,
})}\n`);

const validatePricingConfig = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw createError('报价配置必须是完整 JSON 对象', 400);
  }
  if (Object.keys(value).some(key => !Object.hasOwn(schema.properties, key))) {
    throw createError('报价配置包含未知字段', 400);
  }
  const config = {};
  for (const key of schema.required) {
    const rule = schema.properties[key];
    const item = value[key];
    if (rule.type === 'number') {
      if (typeof item !== 'number' || !Number.isFinite(item) || item < rule.minimum || item > rule.maximum) {
        throw createError(`报价配置 ${key} 必须是 ${rule.minimum} 至 ${rule.maximum} 的有限数字`, 400);
      }
    } else if (!rule.enum.includes(item)) {
      throw createError(`报价配置 ${key} 必须为 ${rule.enum.join(' 或 ')}`, 400);
    }
    config[key] = item;
  }
  return Object.freeze(config);
};

const readSnapshot = target => {
  let value;
  try {
    value = JSON.parse(fs.readFileSync(target, 'utf8'));
  } catch {
    throw createError('报价配置文件无法读取或 JSON 格式无效', 503);
  }
  const config = validatePricingConfig(value);
  return { config, revision: revisionOf(config) };
};

const loadPricingSnapshot = () => {
  const target = configPath();
  const snapshot = readSnapshot(target);
  const previous = observed.get(target);
  if (previous !== snapshot.revision) {
    audit(previous ? 'pricing_config_file_changed' : 'pricing_config_loaded', {
      revision: snapshot.revision,
      ...(previous ? { previousRevision: previous } : {}),
    });
    observed.set(target, snapshot.revision);
  }
  return snapshot;
};
const loadPricingConfig = () => loadPricingSnapshot().config;

const updatePricingConfig = (value, expectedRevision, actorId) => {
  const config = validatePricingConfig(value);
  if (typeof expectedRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedRevision)) {
    throw createError('报价配置缺少有效版本，请重新加载', 400);
  }
  const target = configPath();
  const lockPath = `${target}.lock`;
  let lock;
  try {
    lock = fs.openSync(lockPath, 'wx', 0o600);
  } catch (error) {
    throw createError(error.code === 'EEXIST' ? '报价配置正在更新，请稍后重试' : '报价配置目录无法写入', error.code === 'EEXIST' ? 409 : 503);
  }
  const temporary = `${target}.${crypto.randomUUID()}.tmp`;
  try {
    const previous = readSnapshot(target);
    if (previous.revision !== expectedRevision) throw createError('报价配置已变更，请重新加载后保存', 409);
    const revision = revisionOf(config);
    if (revision === previous.revision) return previous;
    fs.writeFileSync(temporary, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
    observed.set(target, revision);
    audit('pricing_config_updated', {
      actorId, previousRevision: previous.revision, revision,
      changedFields: schema.required.filter(key => previous.config[key] !== config[key]),
    });
    return { config, revision };
  } catch (error) {
    if (error.statusCode) throw error;
    throw createError('报价配置保存失败', 503);
  } finally {
    fs.rmSync(temporary, { force: true });
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
};

module.exports = { loadPricingConfig, loadPricingSnapshot, updatePricingConfig, validatePricingConfig, schema };
