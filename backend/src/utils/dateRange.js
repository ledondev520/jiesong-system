/** Input: 可选 YYYY-MM-DD 起止日；Output: 上海时区闭区间，非法日期返回400。 */
const { createError } = require('../middleware/errorHandler');
const parseShanghaiDateRange = (from, to) => {
  const parse = (value, end = false) => {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(`${value}T00:00:00+08:00`);
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime())
      || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value) {
      throw createError('期间需为有效的 YYYY-MM-DD 日期', 400);
    }
    if (end) date.setTime(date.getTime() + 86400000 - 1);
    return date;
  };
  const start = parse(from); const end = parse(to, true);
  if (start && end && start > end) throw createError('开始日期不能晚于结束日期', 400);
  return { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
};
module.exports = { parseShanghaiDateRange };
