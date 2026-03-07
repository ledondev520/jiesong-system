/**
 * Input: forexVerificationService
 * Output: 收汇核销 HTTP 响应
 * Pos: 税退模块控制器，负责收汇核销 CRUD
 */

const forexVerificationService = require('../services/forexVerificationService');
const { createCrudController } = require('./shared/createCrudController');

const controller = createCrudController({
  listMethod: (...args) => forexVerificationService.listForexVerifications(...args),
  getMethod: (...args) => forexVerificationService.getForexVerificationById(...args),
  createMethod: (...args) => forexVerificationService.createForexVerification(...args),
  updateMethod: (...args) => forexVerificationService.updateForexVerification(...args),
  removeMethod: (...args) => forexVerificationService.removeForexVerification(...args),
  filters: ['salesContractId', 'customsDeclarationId', 'status', 'keyword'],
  createMessage: '收汇核销记录创建成功',
  updateMessage: '收汇核销记录更新成功',
  removeMessage: '收汇核销记录删除成功',
});

module.exports = {
  ...controller,
  listForexVerifications: controller.list,
  getForexVerificationById: controller.getById,
  createForexVerification: controller.create,
  updateForexVerification: controller.update,
  removeForexVerification: controller.remove,
};
