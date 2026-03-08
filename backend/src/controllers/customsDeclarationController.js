/**
 * Input: customsDeclarationService
 * Output: 报关单 HTTP 响应
 * Pos: 税退模块控制器，负责报关单 CRUD
 */

const customsDeclarationService = require('../services/customsDeclarationService');
const customsDeclarationDraftService = require('../services/customsDeclarationDraftService');
const { createCrudController } = require('./shared/createCrudController');
const { success } = require('../utils/response');

const controller = createCrudController({
  listMethod: (...args) => customsDeclarationService.listCustomsDeclarations(...args),
  getMethod: (...args) => customsDeclarationService.getCustomsDeclarationById(...args),
  createMethod: (...args) => customsDeclarationService.createCustomsDeclaration(...args),
  updateMethod: (...args) => customsDeclarationService.updateCustomsDeclaration(...args),
  removeMethod: (...args) => customsDeclarationService.removeCustomsDeclaration(...args),
  filters: ['salesContractId', 'status', 'keyword'],
  createMessage: '报关单创建成功',
  updateMessage: '报关单更新成功',
  removeMessage: '报关单删除成功',
});

module.exports = {
  ...controller,
  listCustomsDeclarations: controller.list,
  getCustomsDeclarationById: controller.getById,
  createCustomsDeclaration: controller.create,
  updateCustomsDeclaration: controller.update,
  removeCustomsDeclaration: controller.remove,
  generateCustomsDeclarationDrafts: async (req, res, next) => {
    try {
      const result = await customsDeclarationDraftService.generateCustomsDeclarationDrafts(req.body || {});
      success(res, result, '报关单草稿生成完成');
    } catch (error) {
      next(error);
    }
  },
};
