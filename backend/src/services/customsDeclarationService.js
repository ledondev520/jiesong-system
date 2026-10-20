/**
 * Input: 报关单查询/写入参数、Prisma客户端
 * Output: 含明细的报关单读写结果与输入错误
 * Pos: 税退模块服务层，事务保存真实表头/明细并保留来源关联
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

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const headerNumbers = ['totalAmount', 'totalQuantity', 'totalNetWeight', 'totalGrossWeight', 'exchangeRate'];
const headerDates = ['declaredAt', 'exportDate'];
const headerFields = ['declarationNo', 'salesContractId', 'customsBroker', 'currency', 'status', 'note', ...headerNumbers, ...headerDates];
const itemFields = ['productId', 'packingItemId', 'taxRateId', 'itemNo', 'customsName', 'hsCode', 'declarationElements', 'quantity', 'unit', 'unitPrice', 'totalPrice'];
const include = { items: { orderBy: { itemNo: 'asc' } } };

const validateData = (input, fields, numbers = [], dates = []) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw createError('报关数据格式错误', 400);
  if (Object.keys(input).some(key => !fields.includes(key))) throw createError('报关数据包含不支持的字段', 400);
  const data = normalizePayload(input, { numberFields: numbers, dateFields: dates });
  for (const key of numbers) if (data[key] != null && (!Number.isFinite(data[key]) || data[key] < 0)) throw createError('报关数量或金额必须为有效非负数字', 400);
  for (const key of dates) if (data[key] != null && Number.isNaN(data[key].getTime())) throw createError('报关日期无效', 400);
  return data;
};
const mapData = (input) => {
  const data = validateData(input, headerFields, headerNumbers, headerDates);
  for (const key of ['declarationNo', 'salesContractId', 'currency', 'status']) {
    if (key in data && (typeof data[key] !== 'string' || !data[key].trim())) throw createError('报关必填字段不能为空', 400);
  }
  for (const key of headerNumbers.filter(key => key !== 'exchangeRate')) {
    if (key in data && data[key] == null) throw createError('报关汇总数字不能为空', 400);
  }
  if (data.status && !['DRAFT', 'DECLARED', 'RELEASED', 'VOID', 'SUBMITTED', 'INSPECTING', 'COMPLETED', 'CANCELLED'].includes(data.status)) throw createError('报关状态无效', 400);
  return data;
};
const mapItem = (item) => {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw createError('商品明细格式错误', 400);
  const { id, ...input } = item;
  const data = validateData(input, itemFields, ['itemNo', 'quantity', 'unitPrice', 'totalPrice']);
  if (!data.productId || (typeof data.customsName !== 'string' || !data.customsName.trim()) || !Number.isFinite(data.quantity) || data.quantity <= 0) throw createError('商品、申报品名和正数数量必填', 400);
  if (data.itemNo != null && !Number.isInteger(data.itemNo)) throw createError('项号必须是整数', 400);
  return { id, data };
};
const service = createCrudService({ delegateName: 'customsDeclaration', notFoundMessage: '报关单不存在', buildWhere, mapData });
const getById = async (id, db = prisma) => {
  const record = await db.customsDeclaration.findUnique({ where: { id }, include });
  if (!record) throw createError('报关单不存在', 404);
  return record;
};
const create = async ({ items, ...input } = {}) => {
  const data = mapData(input);
  if (!data.declarationNo?.trim() || !data.salesContractId) throw createError('报关单号与出口合同必填', 400);
  if (items !== undefined) {
    if (!Array.isArray(items) || !items.length) throw createError('至少填写一条商品明细', 400);
    data.items = { create: items.map(item => mapItem(item).data) };
  }
  return prisma.customsDeclaration.create({ data, include });
};
const update = async (id, { items, ...input } = {}) => {
  const data = mapData(input);
  if (items === undefined) { await getById(id); return prisma.customsDeclaration.update({ where: { id }, data, include }); }
  if (!Array.isArray(items) || !items.length) throw createError('至少填写一条商品明细', 400);
  const mapped = items.map(mapItem);
  // 保留原明细 ID 和来源关联；表头与明细在同一事务提交。
  return prisma.$transaction(async tx => {
    const current = await getById(id, tx);
    const existing = new Set(current.items.map(item => item.id));
    const retained = mapped.filter(item => item.id).map(item => item.id);
    if (new Set(retained).size !== retained.length || retained.some(itemId => !existing.has(itemId))) throw createError('商品明细不属于当前报关单或重复', 400);
    return tx.customsDeclaration.update({ where: { id }, data: { ...data, items: {
      deleteMany: { id: { notIn: retained } },
      update: mapped.filter(item => item.id).map(item => ({ where: { id: item.id }, data: item.data })),
      create: mapped.filter(item => !item.id).map(item => item.data),
    } }, include });
  });
};
module.exports = {
  listCustomsDeclarations: service.list,
  getCustomsDeclarationById: getById,
  createCustomsDeclaration: create,
  updateCustomsDeclaration: update,
  removeCustomsDeclaration: service.remove,
};
