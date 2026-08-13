/**
 * Input: taxRefundService、taxRefundWorkbenchService
 * Output: 退税单 HTTP 响应
 * Pos: 税退模块控制器，负责退税单 CRUD
 */

const taxRefundService = require('../services/taxRefundService');
const taxRefundDraftService = require('../services/taxRefundDraftService');
const taxRefundExportService = require('../services/taxRefundExportService');
const taxRefundWorkbenchService = require('../services/taxRefundWorkbenchService');
const { createCrudController } = require('./shared/createCrudController');
const { success, error } = require('../utils/response');

const controller = createCrudController({
  listMethod: (...args) => taxRefundService.listTaxRefunds(...args),
  getMethod: (...args) => taxRefundService.getTaxRefundById(...args),
  createMethod: (...args) => taxRefundService.createTaxRefund(...args),
  updateMethod: (...args) => taxRefundService.updateTaxRefund(...args),
  removeMethod: (...args) => taxRefundService.removeTaxRefund(...args),
  filters: ['salesContractId', 'status', 'keyword'],
  createMessage: '退税记录创建成功',
  updateMessage: '退税记录更新成功',
  removeMessage: '退税记录删除成功',
});

module.exports = {
  ...controller,
  getWorkbench: async (req, res, next) => {
    try {
      const result = await taxRefundWorkbenchService.getTaxRefundWorkbench(req.query || {});
      success(res, result);
    } catch (error) {
      next(error);
    }
  },
  getInvoiceVerification: async (req, res, next) => {
    try {
      const result = await taxRefundWorkbenchService.getContractInvoiceVerification(req.params.salesContractId);
      success(res, result);
    } catch (error) {
      next(error);
    }
  },
  listTaxRefunds: controller.list,
  getTaxRefundById: controller.getById,
  createTaxRefund: controller.create,
  updateTaxRefund: controller.update,
  removeTaxRefund: controller.remove,
  generateTaxRefundDrafts: async (req, res, next) => {
    try {
      const result = await taxRefundDraftService.generateTaxRefundDrafts(req.body || {});
      success(res, result, '退税草稿生成完成');
    } catch (error) {
      next(error);
    }
  },
  exportTaxRefunds: async (req, res, next) => {
    try {
      const result = await taxRefundExportService.exportTaxRefunds(req.body || {});
      if (result.blocked) {
        error(res, '出口退税导出校验未通过', 409, result);
        return;
      }
      if (req.query?.download === '1') {
        const fileName = `出口退税申报明细-${new Date().toISOString().slice(0, 10)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
        res.status(200).send(`\uFEFF${result.csv}`);
        return;
      }
      success(res, result, '退税导出成功');
    } catch (error) {
      next(error);
    }
  },
};
