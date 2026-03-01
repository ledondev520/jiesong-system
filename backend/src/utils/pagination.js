/**
 * 输入：分页查询参数
 * 输出：规范化的分页参数
 * 说明：为列表接口提供统一分页边界，兼容非法值与兜底。
 */

/**
 * @typedef {Object} PaginationOptions
 * @property {number} page
 * @property {number} pageSize
 * @property {number} skip
 */

/**
 * 解析并归一化单个正整数参数。
 * @param {unknown} value - 原始参数
 * @param {number} fallback - 解析失败时使用的兿值
 * @param {number} min - 最小允许值
 * @param {number} max - 最大允许值（可选）
 * @returns {number}
 */
const parsePositiveInt = (value, fallback, min = 1, max) => {
  const candidate = Number.parseInt(String(value), 10);
  if (!Number.isFinite(candidate) || candidate < min) {
    return fallback;
  }
  if (max !== undefined && candidate > max) {
    return max;
  }
  return candidate;
};

/**
 * 将列表查询参数标准化为分页参数。
 * @param {Record<string, unknown>} query - Express req.query
 * @param {{ page?: number, pageSize?: number, maxPageSize?: number }} [options]
 * @returns {PaginationOptions}
 */
const normalizePagination = (query = {}, options = {}) => {
  const page = parsePositiveInt(query.page, options.page ?? 1, 1);
  const maxPageSize = options.maxPageSize ?? 500;
  const pageSize = parsePositiveInt(query.pageSize, options.pageSize ?? 20, 1, maxPageSize);

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
  };
};

/**
 * 生成分页响应体。
 * @param {number} total - 总记录数
 * @param {number} page - 当前页码
 * @param {number} pageSize - 每页条数
 */
const buildPaginationMeta = (total, page, pageSize) => ({
  total,
  page,
  pageSize,
  totalPages: Math.ceil(total / pageSize),
});

module.exports = {
  parsePositiveInt,
  normalizePagination,
  buildPaginationMeta,
};
