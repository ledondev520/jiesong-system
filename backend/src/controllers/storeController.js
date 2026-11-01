/**
 * Input: Prisma客户端
 * Output: 门店相关的HTTP响应
 * Pos: 门店控制器，处理门店CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { normalizePagination } = require('../utils/pagination');
const { normalizeStoreCode, resolveCustomerIdForNewStore } = require('../services/customerService');
const { archiveFilter } = require('../utils/archiveFilter');

const duplicateCode = (error) => error?.code === 'P2002' && String(error.meta?.target || '').includes('code');
const optionalText = (value) => (typeof value === 'string' ? value.trim() || null : value);

/**
 * 职责：获取门店列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { portId, customerId } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;
    // 默认只列在用门店（含 lite 选择器）；status=archived 为已归档，status=all 不过滤。GET /:id 仍返回已归档门店，历史单据可解析。
    const where = { ...archiveFilter(req.query.status), ...(portId ? { portId } : {}), ...(customerId ? { customerId: String(customerId) } : {}) };
 
    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take: pageSize,
        ...(lite
          ? {}
          : {
              include: { port: true, customer: { select: { id: true, name: true } } },
            }),
        orderBy: { name: 'asc' },
      }),
      prisma.store.count({ where }),
    ]);
    
    paginated(res, stores, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取门店详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const store = await prisma.store.findUnique({
      where: { id },
      include: { port: true },
    });
    
    if (!store) {
      throw createError('门店不存在', 404);
    }
    
    success(res, store);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建门店
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    const code = normalizeStoreCode(data.code);
    const customerId = await resolveCustomerIdForNewStore(data.customerId);
    const store = await prisma.store.create({
      data: {
        name: data.name,
        portId: data.portId,
        customerId,
        ...(code ? { code } : {}),
        ...(data.legalName !== undefined ? { legalName: optionalText(data.legalName) } : {}),
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        address: data.address,
      },
      include: { port: true, customer: { select: { id: true, name: true } } },
    });
    
    created(res, store, '门店创建成功');
  } catch (error) {
    next(duplicateCode(error) ? createError('门店简称已存在', 409) : error);
  }
};

/**
 * 职责：更新门店
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const code = normalizeStoreCode(data.code);
    if (data.isActive !== undefined && typeof data.isActive !== 'boolean') throw createError('isActive格式无效', 400);
    // 恢复已归档门店仅 ADMIN（与供应商一致）；归档沿用各写入角色。
    if (data.isActive === true && req.user?.role !== 'ADMIN') throw createError('仅管理员可恢复已归档门店', 403);
    // 换客户须是存在且未归档的客户；不改客户时不检查（归档客户下的旧门店仍可编辑）
    const customerId = data.customerId === undefined || data.customerId === null || data.customerId === ''
      ? undefined
      : await resolveCustomerIdForNewStore(data.customerId);
    
    const store = await prisma.store.update({
      where: { id },
      data: {
        name: data.name,
        portId: data.portId,
        customerId,
        code,
        ...(data.legalName !== undefined ? { legalName: optionalText(data.legalName) } : {}),
        isActive: data.isActive,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        address: data.address,
      },
      include: { port: true, customer: { select: { id: true, name: true } } },
    });
    
    success(res, store, '门店更新成功');
  } catch (error) {
    next(duplicateCode(error) ? createError('门店简称已存在', 409) : error);
  }
};

/**
 * 职责：删除门店（软删除）
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.store.update({
      where: { id },
      data: { isActive: false },
    });
    
    success(res, null, '门店删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取港口列表
 */
const getPorts = async (req, res, next) => {
  try {
    const ports = await prisma.port.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    
    success(res, ports);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getPorts,
};
