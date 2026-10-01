/**
 * Input: 已认证采购用户、合同/到货批次ID、分页与到货/验货输入
 * Output: 分批实物收货的标准HTTP响应
 * Pos: 收货Interface；操作者只能取认证会话，业务约束在共享服务执行
 */
const { success } = require('../utils/response');
const receiptService = require('../services/purchaseReceiptService');

const list = async (req, res, next) => {
  try { success(res, await receiptService.listPurchaseReceipts(req.params.id, req.query)); }
  catch (error) { next(error); }
};
const create = async (req, res, next) => {
  try { success(res, await receiptService.createPurchaseReceipt(req.params.id, req.body, req.user?.id), '到货批次已登记，待验数量尚未入库'); }
  catch (error) { next(error); }
};
const inspect = async (req, res, next) => {
  try { success(res, await receiptService.inspectPurchaseReceipt(req.params.id, req.params.receiptId, req.body, req.user?.id), '验货已登记，新增合格数量已入库'); }
  catch (error) { next(error); }
};
const listInspections = async (req, res, next) => {
  try { success(res, await receiptService.listPurchaseReceiptInspections(req.params.id, req.params.receiptId, req.query)); }
  catch (error) { next(error); }
};

module.exports = { list, create, inspect, listInspections };
