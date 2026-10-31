/**
 * Input: 收汇核销查询/写入参数、Prisma客户端
 * Output: 收汇核销 CRUD 结果
 * Pos: 税退模块服务层，负责收汇核销管理
 */

const prisma = require('../utils/prisma');
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

// 未填写核销汇率时采用订单已保存的汇率；显式填写（实际结汇汇率）保持不变。
const createWithOrderRate = async (input = {}) => {
  const data = mapData(input);
  if (data.exchangeRate == null && data.salesContractId) {
    const order = await prisma.salesContract.findUnique({ where: { id: data.salesContractId }, select: { exchangeRate: true } });
    if (order?.exchangeRate > 0) return service.create({ ...input, exchangeRate: order.exchangeRate });
  }
  return service.create(input);
};

module.exports = {
  listForexVerifications: service.list,
  getForexVerificationById: service.getById,
  createForexVerification: createWithOrderRate,
  updateForexVerification: service.update,
  removeForexVerification: service.remove,
};
