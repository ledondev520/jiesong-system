const { createError } = require('../middleware/errorHandler');

// Only declared, own fields can cross the persistence boundary.
const partialUpdate = (input, fields) => {
  const data = {};
  for (const [field, policy] of Object.entries(fields)) {
    if (!Object.hasOwn(input, field) || input[field] === undefined) continue;
    const value = input[field];
    if (value === null) {
      if (!policy.nullable) throw createError(policy.message || `${field}不能清空`, 400);
      data[field] = null;
      continue;
    }
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') {
      if (policy.required) throw createError(policy.message || `${field}不能为空`, 400);
      continue;
    }
    if (typeof normalized !== policy.type) {
      throw createError(policy.message || `${field}格式无效`, 400);
    }
    data[field] = policy.normalize ? policy.normalize(normalized) : normalized;
  }
  return data;
};

module.exports = { partialUpdate };
