/**
 * Input: authenticated HTTP requests for /quotes
 * Output: quote list/detail/create/update responses (update = field edit or status transition, see quoteService)
 * Pos: thin controller; rules live in quoteService.js and quoteStateMachine.js. No delete handler by design (CANCELLED instead).
 */
const quoteService = require('../services/quoteService');
const { success, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const { parseOptionalText } = require('../utils/text');
const { partialUpdate } = require('../utils/partialUpdate');

const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { rows, total } = await quoteService.listQuotes({
      skip, pageSize, keyword: parseOptionalText(req.query.keyword), status: parseOptionalText(req.query.status),
    });
    paginated(res, rows, total, page, pageSize);
  } catch (error) { next(error); }
};

const getById = async (req, res, next) => {
  try { success(res, await quoteService.getQuote(req.params.id)); } catch (error) { next(error); }
};

const create = async (req, res, next) => {
  try { success(res, await quoteService.createQuote(req.body, req.user), '报价已创建'); } catch (error) { next(error); }
};

// A status string means "transition alone"; the service refuses it mixed with other fields.
const update = async (req, res, next) => {
  try {
    const { status } = partialUpdate(req.body || {}, { status: { type: 'string', message: '报价状态无效' } });
    success(res, await quoteService.updateQuote(req.params.id, req.body, status), '报价已更新');
  } catch (error) { next(error); }
};

module.exports = { list, getById, create, update };
