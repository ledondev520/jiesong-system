/**
 * Input: 报关单查询/写入参数、Prisma客户端
 * Output: 报关单 CRUD 结果
 * Pos: 税退模块服务层，负责报关单管理
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
      { declarationNo: { contains: keyword } },
      { customsBroker: { contains: keyword } },
    ];
  }

  return where;
};

const mapData = (data = {}) => normalizePayload(data, {
  numberFields: ['totalAmount', 'totalQuantity', 'totalNetWeight', 'totalGrossWeight', 'exchangeRate'],
  dateFields: ['declaredAt', 'exportDate'],
});

const service = createCrudService({
  delegateName: 'customsDeclaration',
  notFoundMessage: '报关单不存在',
  buildWhere,
  mapData,
});

module.exports = {
  listCustomsDeclarations: service.list,
  getCustomsDeclarationById: service.getById,
  createCustomsDeclaration: service.create,
  updateCustomsDeclaration: service.update,
  removeCustomsDeclaration: service.remove,
};
