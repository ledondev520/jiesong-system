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
const { normalizePagination } = require('../utils/pagination');
const { createSupplier, updateSupplier } = require('../agent/commands/supplier');

/**
 * 职责：获取供应商列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { keyword } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;
    
    const where = keyword ? {
      OR: [
        { name: { contains: keyword } },
        { shortName: { contains: keyword } },
      ],
    } : {};
    
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
 * 职责：删除供应商（软删除）
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.supplier.update({
      where: { id },
      data: { isActive: false },
    });
    
    success(res, null, '供应商删除成功');
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
  addAlias,
  markQualityIssue,
};
