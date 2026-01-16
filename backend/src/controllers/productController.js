/**
 * Input: Prisma客户端
 * Output: 商品相关的HTTP响应
 * Pos: 商品控制器，处理商品CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取商品列表
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, keyword, categoryId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {};
    if (keyword) {
      where.OR = [
        { customsName: { contains: keyword } },
        { description: { contains: keyword } },
      ];
    }
    if (categoryId) {
      where.categoryId = categoryId;
    }
    
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    
    paginated(res, products, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取商品详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        suppliers: { include: { supplier: true } },
        priceHistories: { take: 10, orderBy: { recordedAt: 'desc' } },
      },
    });
    
    if (!product) {
      throw createError('商品不存在', 404);
    }
    
    success(res, product);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建商品
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    const product = await prisma.product.create({
      data: {
        customsName: data.customsName,
        description: data.description,
        specification: data.specification,
        unit: data.unit,
        categoryId: data.categoryId,
      },
    });
    
    created(res, product, '商品创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新商品
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const product = await prisma.product.update({
      where: { id },
      data: {
        customsName: data.customsName,
        description: data.description,
        specification: data.specification,
        unit: data.unit,
        categoryId: data.categoryId,
      },
    });
    
    success(res, product, '商品更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除商品（软删除）
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    
    success(res, null, '商品删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取商品供应商列表
 */
const getSuppliers = async (req, res, next) => {
  try {
    const { id } = req.params;
    const suppliers = await prisma.productSupplier.findMany({
      where: { productId: id },
      include: { supplier: true },
    });
    
    success(res, suppliers);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：关联供应商
 */
const addSupplier = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { supplierId, price } = req.body;
    
    const relation = await prisma.productSupplier.upsert({
      where: { productId_supplierId: { productId: id, supplierId } },
      update: { price },
      create: { productId: id, supplierId, price },
    });
    
    success(res, relation, '供应商关联成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取商品分类
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await prisma.productCategory.findMany({
      orderBy: { name: 'asc' },
    });
    
    success(res, categories);
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
  getSuppliers,
  addSupplier,
  getCategories,
};
