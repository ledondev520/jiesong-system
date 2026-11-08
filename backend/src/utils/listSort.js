/**
 * Input: req.query.sortBy/sortDir + 每个列表自己的白名单
 * Output: Prisma orderBy 数组（在分页前由数据库排序，跨页一致）
 * Pos: A85 服务端排序；未知列/方向一律 400，不把查询参数直接拼进 orderBy
 */
const { createError } = require('../middleware/errorHandler');

/**
 * @param {object} query - req.query
 * @param {Record<string, (dir: 'asc'|'desc') => object>} columns - 白名单：列名 → orderBy 片段
 * @param {object[]} fallback - 未指定排序时的默认 orderBy
 * @returns {object[]} orderBy，末尾追加 id 保证翻页稳定
 */
const parseListSort = (query = {}, columns, fallback) => {
  const { sortBy, sortDir } = query;
  if (sortBy === undefined && sortDir === undefined) return [...fallback, { id: 'desc' }];
  if (typeof sortBy !== 'string' || !Object.prototype.hasOwnProperty.call(columns, sortBy)) {
    throw createError('不支持的排序列', 400);
  }
  if (sortDir !== undefined && sortDir !== 'asc' && sortDir !== 'desc') {
    throw createError('排序方向必须为 asc 或 desc', 400);
  }
  return [columns[sortBy](sortDir || 'asc'), { id: 'desc' }];
};

module.exports = { parseListSort };
