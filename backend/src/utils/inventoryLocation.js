/**
 * Input: 请求中的批次号 / 库位文本
 * Output: 去空白后的文本或 null（空串=清空）；非法值抛 400
 * Pos: A83 库存批次与库位字段的唯一校验入口（验货入库与库存位置编辑共用）；运营标识，非金额字段
 */
const { createError } = require('../middleware/errorHandler');

const MAX_LENGTH = 50;

const normalizeLocationField = (value, label) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw createError(`${label}必须为文本`, 400);
  const text = value.trim();
  if (text.length > MAX_LENGTH) throw createError(`${label}不能超过${MAX_LENGTH}个字符`, 400);
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(text)) throw createError(`${label}不能包含控制字符`, 400);
  return text || null;
};

module.exports = { normalizeLocationField, MAX_LENGTH };
