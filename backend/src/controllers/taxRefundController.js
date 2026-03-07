/**
 * Input: taxRefundService
 * Output: 退税单 HTTP 响应
 * Pos: 税退模块控制器，负责退税单 CRUD
 */

const taxRefundService = require('../services/taxRefundService');
const { createCrudController } = require('./shared/createCrudController');

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
  listTaxRefunds: controller.list,
  getTaxRefundById: controller.getById,
  createTaxRefund: controller.create,
  updateTaxRefund: controller.update,
  removeTaxRefund: controller.remove,
};
