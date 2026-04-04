/**
 * Input: eventLedgerService
 * Output: 统一事件流查询接口
 * Pos: 系统控制器 - 事件流查询
 */

const eventLedgerService = require('../../services/eventLedgerService');

const normalizeArrayParam = (value) => {
  if (!value) return null;
  if (Array.isArray(value)) return value.map(v => v.trim().toUpperCase());
  return value.split(',').map(v => v.trim().toUpperCase()).filter(Boolean);
};

const normalizeStringParam = (value) => {
  if (!value) return null;
  return value.trim().toUpperCase();
};

const normalizeTrimParam = (value) => {
  if (!value) return null;
  return value.trim();
};

const getEventLedger = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const filters = {
      source: normalizeArrayParam(req.query.source),
      actorType: normalizeStringParam(req.query.actorType),
      entityType: normalizeTrimParam(req.query.entityType),
      eventType: normalizeStringParam(req.query.eventType),
      category: normalizeStringParam(req.query.category),
      keyword: req.query.keyword?.trim() || null,
    };

    const result = await eventLedgerService.listEventLedger(page, pageSize, filters);

    res.json({
      code: 200,
      message: 'success',
      data: {
        items: result.events,
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        sources: result.sources,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getEventLedger,
};
