/**
 * Input: POST /sales/:id/purchase-drafts 的 lines
 * Output: 生成的 DRAFT 采购合同编号列表
 * Pos: 「生成采购单」HTTP 层，业务规则在 purchaseContractGenerationService
 */
const { created } = require('../utils/response');
const { generatePurchaseDrafts } = require('../services/purchaseContractGenerationService');

const generate = async (req, res, next) => {
  try {
    const result = await generatePurchaseDrafts({ salesContractId: req.params.id, lines: req.body?.lines });
    created(res, result, '采购单已生成（草稿）');
  } catch (error) {
    next(error);
  }
};

module.exports = { generate };
