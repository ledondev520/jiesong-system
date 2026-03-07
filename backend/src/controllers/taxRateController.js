/**
 * Input: taxRateService
 * Output: 退税率 HTTP 响应
 * Pos: 税退模块控制器，负责退税率 CRUD
 */

const taxRateService = require('../services/taxRateService');
const { createCrudController } = require('./shared/createCrudController');

const controller = createCrudController({
  listMethod: (...args) => taxRateService.listTaxRates(...args),
  getMethod: (...args) => taxRateService.getTaxRateById(...args),
  createMethod: (...args) => taxRateService.createTaxRate(...args),
  updateMethod: (...args) => taxRateService.updateTaxRate(...args),
  removeMethod: (...args) => taxRateService.removeTaxRate(...args),
  filters: ['productId', 'hsCode', 'keyword'],
  createMessage: '退税率创建成功',
  updateMessage: '退税率更新成功',
  removeMessage: '退税率删除成功',
});

module.exports = {
  ...controller,
  listTaxRates: controller.list,
  getTaxRateById: controller.getById,
  createTaxRate: controller.create,
  updateTaxRate: controller.update,
  removeTaxRate: controller.remove,
};
