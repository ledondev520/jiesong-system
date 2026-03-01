const { success } = require('../../utils/response');
const { createError } = require('../../middleware/errorHandler');
const { normalizePagination } = require('../../utils/pagination');

const buildPaginatedPayload = (items, total, page, pageSize, extras = {}) => ({
  code: 200,
  message: '获取成功',
  data: {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
    ...extras,
  },
});

const importData = async (req, res, next) => {
  try {
    const importService = require('../../services/importService');

    if (!req.file) {
      throw createError('请选择要导入的CSV文件', 400);
    }

    const result = await importService.importCSVData(req.file.path, req.user.id);
    success(res, result, `导入完成：成功${result.successRows}条，失败${result.failedRows}条`);
  } catch (error) {
    next(error);
  }
};

const getImportRecords = async (req, res, next) => {
  try {
    const importService = require('../../services/importService');
    const { page, pageSize } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const status = (req.query.status || '').toString().trim();
    const keyword = (req.query.keyword || '').toString().trim();

    const result = await importService.getImportRecords(page, pageSize, {
      status: status.length ? status : undefined,
      keyword: keyword.length ? keyword : undefined,
    });

    const payload = buildPaginatedPayload(result.records, result.total, page, pageSize);
    res.json(payload);
  } catch (error) {
    next(error);
  }
};

const exportData = async (req, res, next) => {
  try {
    const { type } = req.params;
    const exportService = require('../../services/exportService');

    const result = await exportService.exportData(type, req.query);

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.data);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  importData,
  getImportRecords,
  exportData,
};
