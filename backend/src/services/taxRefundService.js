/**
 * Input: 退税查询/写入参数、Prisma客户端
 * Output: 退税 CRUD 结果
 * Pos: 税退模块服务层，负责退税单管理
 */

const { createCrudService, normalizePayload } = require('./shared/taxModuleCrud');

const buildWhere = ({ salesContractId, status, keyword } = {}) => {
  const where = {};

  if (salesContractId) {
    where.salesContractId = salesContractId;
  }
  if (status) {
    where.status = status;
  }
  if (keyword) {
    where.OR = [
      { refundNo: { contains: keyword } },
      { note: { contains: keyword } },
    ];
  }

  return where;
};

const mapData = (data = {}) => normalizePayload(data, {
  numberFields: ['declaredAmount', 'refundableAmount', 'refundedAmount'],
  dateFields: ['appliedAt', 'refundedAt'],
});

const service = createCrudService({
  delegateName: 'taxRefund',
  notFoundMessage: '退税记录不存在',
  buildWhere,
  mapData,
});

module.exports = {
  listTaxRefunds: service.list,
  getTaxRefundById: service.getById,
  createTaxRefund: service.create,
  updateTaxRefund: service.update,
  removeTaxRefund: service.remove,
};
