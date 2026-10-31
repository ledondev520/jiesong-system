/**
 * Input: Prisma、客户表单字段
 * Output: 客户列表/详情/创建/局部更新、客户下门店列表的 HTTP 响应
 * Pos: 客户控制器；客户永不物理删除，归档 = PUT isActive:false
 * Note: 联系人信息为 Confidential；失败的保存不改动任何字段（校验先于写库）。
 */
const prisma = require('../utils/prisma');
const { success, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { normalizePagination } = require('../utils/pagination');
const { parseOptionalText } = require('../utils/text');
const { partialUpdate } = require('../utils/partialUpdate');
const { validateCustomerData } = require('../services/customerService');

const optionalText = { type: 'string', nullable: true };
const customerFields = {
  name: { type: 'string', required: true, message: '客户名称不能为空' },
  legalName: optionalText,
  country: { ...optionalText, normalize: (value) => value.toUpperCase() },
  address: optionalText,
  contactName: optionalText,
  contactEmail: optionalText,
  contactPhone: optionalText,
  defaultCurrency: { type: 'string', normalize: (value) => value.toUpperCase() },
  defaultIncoterm: { type: 'string', normalize: (value) => value.toUpperCase() },
  defaultPaymentTerms: optionalText,
  defaultPortOfLoading: optionalText,
  note: optionalText,
  isActive: { type: 'boolean' },
};

const duplicateName = async (name, exceptId) => {
  const found = await prisma.customer.findFirst({
    where: { name, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (found) throw createError('客户名称已存在', 409);
};

const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const keyword = parseOptionalText(req.query.keyword);
    const where = {
      ...(req.query.includeArchived === 'true' ? {} : { isActive: true }),
      ...(keyword ? { OR: [{ name: { contains: keyword } }, { legalName: { contains: keyword } }] } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.customer.findMany({ where, skip, take: pageSize, orderBy: { name: 'asc' }, include: { _count: { select: { stores: true } } } }),
      prisma.customer.count({ where }),
    ]);
    paginated(res, items, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: { stores: { orderBy: { name: 'asc' }, include: { port: true } } },
    });
    if (!customer) throw createError('客户不存在', 404);
    success(res, customer);
  } catch (error) {
    next(error);
  }
};

const listStores = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 50, maxPageSize: 100 });
    const customer = await prisma.customer.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!customer) throw createError('客户不存在', 404);
    const where = { customerId: customer.id, ...(req.query.includeArchived === 'true' ? {} : { isActive: true }) };
    const [items, total] = await Promise.all([
      prisma.store.findMany({ where, skip, take: pageSize, orderBy: { name: 'asc' }, include: { port: true } }),
      prisma.store.count({ where }),
    ]);
    paginated(res, items, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

// 创建返回 200（与目录类资源一致，生命周期矩阵按 200 断言）
const create = async (req, res, next) => {
  try {
    const data = validateCustomerData(partialUpdate(req.body || {}, customerFields));
    if (!data.name) throw createError('客户名称不能为空', 400);
    await duplicateName(data.name);
    success(res, await prisma.customer.create({ data }), '客户创建成功');
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!(await prisma.customer.findUnique({ where: { id }, select: { id: true } }))) throw createError('客户不存在', 404);
    const data = validateCustomerData(partialUpdate(req.body || {}, customerFields));
    if (data.name) await duplicateName(data.name, id);
    success(res, await prisma.customer.update({ where: { id }, data }), '客户更新成功');
  } catch (error) {
    next(error);
  }
};

module.exports = { list, getById, listStores, create, update };
