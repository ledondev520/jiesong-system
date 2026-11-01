/**
 * Input: 供应商服务
 * Output: 供应商相关的HTTP响应
 * Pos: 供应商控制器，处理供应商CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { archiveFilter } = require('../utils/archiveFilter');
const { normalizePagination } = require('../utils/pagination');
const supplierHardDelete = require('../services/supplierHardDeleteService');
const { createSupplier, updateSupplier, assertActiveChangeAllowed } = require('../agent/commands/supplier');


/**
 * 职责：获取供应商列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { keyword } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;
    
    const where = {
      ...archiveFilter(req.query.status),
      ...(keyword ? {
        OR: [
          { name: { contains: keyword } },
          { shortName: { contains: keyword } },
        ],
      } : {}),
    };
    
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        skip,
        take: pageSize,
        ...(lite
          ? {
              select: {
                id: true,
                name: true,
                shortName: true,
                hasQualityIssue: true,
                isActive: true,
              },
            }
          : {
              include: { aliases: true },
            }),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.supplier.count({ where }),
    ]);
    
    paginated(res, suppliers, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取供应商详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: { aliases: true, products: { include: { product: true } } },
    });
    
    if (!supplier) {
      throw createError('供应商不存在', 404);
    }
    
    success(res, supplier);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建供应商
 */
const create = async (req, res, next) => {
  try {
    const supplier = await createSupplier({
      input: req.body,
      prismaClient: prisma,
    });
    
    created(res, supplier, '供应商创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新供应商
 */
const update = async (req, res, next) => {
  try {
    assertActiveChangeAllowed(req.user?.role, req.body?.isActive);
    const supplier = await updateSupplier({
      id: req.params.id,
      input: req.body,
      prismaClient: prisma,
    });
    
    success(res, supplier, '供应商更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：归档供应商（软停用，任何时候可归档、不检查合同；可由 ADMIN 恢复，历史单据保持关联）
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
    if (!supplier) throw createError('供应商不存在', 404);

    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    
    success(res, null, '供应商归档成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：永久删除预览（ADMIN）：各类关联记录计数、阻断原因与确认令牌
 */
const hardDeletePreview = async (req, res, next) => {
  try {
    success(res, await supplierHardDelete.preview(prisma, req.params.id));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：永久删除供应商及其关联历史（ADMIN，需与预览匹配的令牌，单事务）
 */
const hardDelete = async (req, res, next) => {
  try {
    const result = await supplierHardDelete.hardDelete(prisma, {
      supplierId: req.params.id,
      confirmToken: req.body?.confirmToken,
      actorId: req.user.id,
      req,
    });
    success(res, result, '供应商已永久删除');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：添加供应商昵称
 */
const addAlias = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { alias } = req.body;
    
    const supplierAlias = await prisma.supplierAlias.create({
      data: { supplierId: id, alias },
    });
    
    created(res, supplierAlias, '昵称添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：标记质量问题
 */
const markQualityIssue = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hasQualityIssue, qualityNote } = req.body;
    
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { hasQualityIssue, qualityNote },
    });
    
    success(res, supplier, '质量问题标记成功');
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
  hardDeletePreview,
  hardDelete,
  addAlias,
  markQualityIssue,
};
