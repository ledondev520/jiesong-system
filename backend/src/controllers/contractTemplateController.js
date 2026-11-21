/**
 * Input: contractTemplateService
 * Output: 合同模板 HTTP 响应
 * Pos: 合同模板控制器
 */

const { success, created } = require('../utils/response');
const contractTemplateService = require('../services/contractTemplateService');

/**
 * 职责：获取合同模板列表
 */
const list = async (req, res, next) => {
  try {
    const { type } = req.query;
    const templates = await contractTemplateService.list({
      type,
      createdBy: req.user?.id,
    });
    success(res, templates);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建合同模板
 */
const create = async (req, res, next) => {
  try {
    const template = await contractTemplateService.create({
      ...req.body,
      createdBy: req.user?.id || 'system',
    });
    created(res, template, '合同模板创建成功');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  create,
};
