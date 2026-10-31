const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createError } = require('../middleware/errorHandler');
const schema = require('../../../config/pricing.schema.json');
const defaultPath = path.resolve(__dirname, '../../../config/pricing.json');
const observed = new Map();

const configPath = () => path.resolve(process.env.JIESONG_PRICING_CONFIG || defaultPath);
const revisionOf = contents => crypto.createHash('sha256').update(contents).digest('hex');
const audit = (event, details) => process.stderr.write(`${JSON.stringify({
  timestamp: new Date().toISOString(), event, ...details,
})}\n`);

const bad = (field, rule) => createError(`报价配置 ${field} ${rule}`, 400);

const checkNumber = (field, item, rule) => {
  const belowMin = rule.exclusiveMinimum !== undefined ? item <= rule.exclusiveMinimum : item < rule.minimum;
  if (typeof item !== 'number' || !Number.isFinite(item) || belowMin || item > rule.maximum) {
    const lower = rule.exclusiveMinimum !== undefined ? `大于 ${rule.exclusiveMinimum}` : `不小于 ${rule.minimum}`;
    throw bad(field, `必须是${lower}且不大于 ${rule.maximum} 的有限数字`);
  }
  if (rule.type === 'integer' && !Number.isInteger(item)) throw bad(field, '必须是整数');
  // 汇率最多 4 位小数；先放大再取整，避免 6.7200000001 之类浮点尾巴误判
  if (rule.maxDecimals !== undefined && Number((item * 10 ** rule.maxDecimals).toFixed(6)) % 1 !== 0) {
    throw bad(field, `最多 ${rule.maxDecimals} 位小数`);
  }
};

const validateCategoryMarkups = (items) => {
  const rule = schema.properties.categoryMarkups;
  if (!Array.isArray(items) || items.length > rule.maxItems) throw bad('categoryMarkups', `必须是不超过 ${rule.maxItems} 项的数组`);
  const seen = new Set();
  return items.map((entry, index) => {
    const field = `categoryMarkups[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw bad(field, '必须是对象');
    if (Object.keys(entry).some(key => !Object.hasOwn(rule.items.properties, key))) throw bad(field, '包含未知字段');
    const { categoryId, categoryName, markup } = entry;
    if (typeof categoryId !== 'string' || !categoryId || categoryId.length > 64) throw bad(`${field}.categoryId`, '必须是非空分类 ID');
    if (seen.has(categoryId)) throw bad(`${field}.categoryId`, '重复');
    seen.add(categoryId);
    if (typeof categoryName !== 'string' || categoryName.length > 100) throw bad(`${field}.categoryName`, '必须是不超过 100 字的文本');
    checkNumber(`${field}.markup`, markup, rule.items.properties.markup);
    return Object.freeze({ categoryId, categoryName, markup });
  });
};

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
    if (rule.type === 'array') config[key] = Object.freeze(validateCategoryMarkups(value[key]));
    else {
      checkNumber(key, value[key], rule);
      config[key] = value[key];
    }
  }
  // 实际报价汇率 = 现汇 + 调整；不得为 0 或负数，否则无法报价
  if (!(config.exchangeRate + config.exchangeAdjustment > 0)) {
    throw bad('exchangeAdjustment', '使 现汇+调整 不大于 0，无法报价');
  }
  return Object.freeze(config);
};

const sameValue = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sameConfig = (a, b) => schema.required.every(key => sameValue(a[key], b[key]));

const readSnapshot = target => {
  let value;
  let contents;
  try {
    contents = fs.readFileSync(target);
    value = JSON.parse(contents.toString('utf8'));
  } catch {
    throw createError('报价配置文件无法读取或 JSON 格式无效', 503);
  }
  const config = validatePricingConfig(value);
  return { config, revision: revisionOf(contents) };
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
    if (sameConfig(config, previous.config)) return previous;
    const contents = `${JSON.stringify(config, null, 2)}\n`;
    const revision = revisionOf(contents);
    fs.writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, target);
    observed.set(target, revision);
    audit('pricing_config_updated', {
      actorId, previousRevision: previous.revision, revision,
      changedFields: schema.required.filter(key => !sameValue(previous.config[key], config[key])),
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
