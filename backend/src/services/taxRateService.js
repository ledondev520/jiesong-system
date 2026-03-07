/**
 * Input: 退税率查询/写入参数、Prisma客户端
 * Output: 退税率 CRUD 结果
 * Pos: 税退模块服务层，负责退税率配置管理
 */

const { createCrudService, normalizePayload } = require('./shared/taxModuleCrud');

const buildWhere = ({ productId, hsCode, isActive, keyword } = {}) => {
  const where = {};

  if (productId) {
    where.productId = productId;
  }
  if (hsCode) {
    where.hsCode = hsCode;
  }
  if (typeof isActive === 'boolean') {
    where.isActive = isActive;
  }
  if (keyword) {
    where.OR = [
      { hsCode: { contains: keyword } },
      { product: { customsName: { contains: keyword } } },
    ];
  }

  return where;
};

const mapData = (data = {}) => normalizePayload(data, {
  numberFields: ['purchaseTaxRate', 'refundRate'],
  dateFields: ['effectiveFrom', 'effectiveTo'],
});

const service = createCrudService({
  delegateName: 'taxRate',
  notFoundMessage: '退税率不存在',
  buildWhere,
  mapData,
});

module.exports = {
  listTaxRates: service.list,
  getTaxRateById: service.getById,
  createTaxRate: service.create,
  updateTaxRate: service.update,
  removeTaxRate: service.remove,
};
