/**
 * Input: Agent 查询命令层
 * Output: 统一搜索 HTTP 响应
 * Pos: 为 CLI / MCP / Web 提供后端原生统一搜索入口
 */

const { success } = require('../utils/response');
const { parsePositiveInt } = require('../utils/pagination');
const queryCommands = require('../agent/commands/query');

const search = async (req, res, next) => {
  try {
    const rawTypes = typeof req.query.types === 'string'
      ? req.query.types.split(',')
      : Array.isArray(req.query.types)
        ? req.query.types
        : undefined;

    const items = await queryCommands.searchEntities({
      query: req.query.q,
      types: rawTypes,
      limit: parsePositiveInt(req.query.limit, 10, 1, 20),
    });

    success(res, {
      query: String(req.query.q || '').trim(),
      types: rawTypes?.map((type) => String(type).trim()).filter(Boolean) || [],
      limit: parsePositiveInt(req.query.limit, 10, 1, 20),
      items,
    }, '获取成功');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  search,
};
