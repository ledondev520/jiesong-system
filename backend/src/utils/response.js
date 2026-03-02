/**
 * Input: 响应数据
 * Output: 统一格式的响应对象
 * Pos: 响应工具类，统一API响应格式
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { buildPaginatedPayload } = require('./pagination');

/**
 * 职责：构建成功响应
 * @param {Response} res - Express响应对象
 * @param {*} data - 响应数据
 * @param {string} message - 成功消息
 * @param {number} statusCode - HTTP状态码
 */
const success = (res, data = null, message = '操作成功', statusCode = 200) => {
  res.status(statusCode).json({
    code: statusCode,
    message,
    data,
  });
};

/**
 * 职责：构建创建成功响应（201）
 * @param {Response} res - Express响应对象
 * @param {*} data - 创建的数据
 * @param {string} message - 成功消息
 */
const created = (res, data = null, message = '创建成功') => {
  success(res, data, message, 201);
};

/**
 * 职责：构建分页响应
 * @param {Response} res - Express响应对象
 * @param {Array} items - 数据列表
 * @param {number} total - 总数
 * @param {number} page - 当前页
 * @param {number} pageSize - 每页数量
 */
const paginated = (res, items, total, page, pageSize, extras = {}) => {
  res.status(200).json(buildPaginatedPayload(items, total, page, pageSize, extras));
};

const buildErrorPayload = (message = '请求失败', statusCode = 500, data = null) => ({
  code: statusCode,
  message,
  data,
});

const error = (res, message = '请求失败', statusCode = 500, data = null) => {
  res.status(statusCode).json(buildErrorPayload(message, statusCode, data));
};

module.exports = {
  success,
  created,
  paginated,
  error,
  buildErrorPayload,
};
