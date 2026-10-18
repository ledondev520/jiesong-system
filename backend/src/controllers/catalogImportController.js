const service = require('../services/catalogImportService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

const listTemplates = (req, res) => success(res, service.listTemplates());
const downloadTemplate = async (req, res, next) => {
  try {
    const format = req.query.format || 'xlsx';
    const bytes = await service.template(req.params.kind, format);
    res.setHeader('Content-Type', format === 'csv' ? 'text/csv; charset=utf-8' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.kind}-template.${format}"`);
    res.send(bytes);
  } catch (error) { next(error); }
};
const preview = async (req, res, next) => {
  try {
    if (!req.file) throw createError('请选择 CSV 或 xlsx 文件', 400);
    success(res, await service.preview(req.params.kind, req.file));
  } catch (error) { next(error); }
};
const execute = async (req, res, next) => {
  try {
    if (!req.file) throw createError('请选择 CSV 或 xlsx 文件', 400);
    success(res, await service.execute(req.params.kind, req.file, {
      confirmOpening: req.body.confirmOpening === 'true', userId: req.user.id,
    }));
  } catch (error) { next(error); }
};
module.exports = { listTemplates, downloadTemplate, preview, execute };
