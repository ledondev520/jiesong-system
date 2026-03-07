/**
 * Input: 收汇核销查询/写入参数、Prisma客户端
 * Output: 收汇核销 CRUD 结果
 * Pos: 税退模块服务层，负责收汇核销管理
 */

const { createCrudService, normalizePayload } = require('./shared/taxModuleCrud');

const buildWhere = ({ salesContractId, customsDeclarationId, status, keyword } = {}) => {
  const where = {};

  if (salesContractId) {
    where.salesContractId = salesContractId;
  }
  if (customsDeclarationId) {
    where.customsDeclarationId = customsDeclarationId;
  }
  if (status) {
    where.status = status;
  }
  if (keyword) {
    where.OR = [
      { verificationNo: { contains: keyword } },
      { bankName: { contains: keyword } },
    ];
  }

  return where;
};

const mapData = (data = {}) => normalizePayload(data, {
  numberFields: ['receivedAmount', 'settledAmount', 'exchangeRate'],
  dateFields: ['verifiedAt'],
});

const service = createCrudService({
  delegateName: 'forexVerification',
  notFoundMessage: '收汇核销记录不存在',
  buildWhere,
  mapData,
});

module.exports = {
  listForexVerifications: service.list,
  getForexVerificationById: service.getById,
  createForexVerification: service.create,
  updateForexVerification: service.update,
  removeForexVerification: service.remove,
};
