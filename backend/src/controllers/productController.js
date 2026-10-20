/**
 * Input: Prisma客户端
 * Output: 商品相关的HTTP响应
 * Pos: 商品控制器，处理商品CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { listLowStockAlerts } = require('../services/inventoryAlertService');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { normalizePagination, parsePositiveInt } = require('../utils/pagination');

const parseLowStockThreshold = (value, options = {}) => {
  if (value === undefined) {
    return options.allowUndefined ? undefined : 0;
  }

  if (value === null || value === '') {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createError('lowStockThreshold 必须是大于等于 0 的数字', 400);
  }

  return parsed;
};

/**
 * 职责：获取商品列表
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { keyword, categoryId } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;
    
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
    
    const lowStock = req.query.lowStock === 'true' || req.query.lowStock === true;
    const alerts = lowStock ? (await listLowStockAlerts(prisma, { keyword })).alerts : [];
    if (lowStock) where.id = { in: alerts.map(alert => alert.productId) };
    const alertByProduct = new Map(alerts.map(alert => [alert.productId, alert]));

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        ...(lite
          ? {
              select: {
                id: true,
                customsName: true,
                description: true,
                specification: true,
                unit: true,
                hsCode: true,
                declaration: true,
                grossWeight: true,
                netWeight: true,
                volume: true,
                packingSpec: true,
                length: true,
                width: true,
                height: true,
                lowStockThreshold: true,
                isActive: true,
                createdAt: true,
                updatedAt: true,
              },
            }
          : {
              include: { category: true },
            }),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.product.count({ where }),
    ]);
    
    const items = lowStock ? products.map(product => ({ ...product, availableStock: alertByProduct.get(product.id)?.currentStock ?? 0 })) : products;
    paginated(res, items, total, page, pageSize);
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
 * 思路：接收商品基本信息、体积/重量/尺寸信息，存入数据库
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
        hsCode: data.hsCode,
        declaration: data.declaration,
        lowStockThreshold: parseLowStockThreshold(data.lowStockThreshold),
        categoryId: data.categoryId,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        packingSpec: data.packingSpec,
        length: data.length,
        width: data.width,
        height: data.height,
      },
    });
    
    created(res, product, '商品创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新商品
 * 思路：更新商品基本信息、体积/重量/尺寸信息
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
        hsCode: data.hsCode,
        declaration: data.declaration,
        lowStockThreshold: parseLowStockThreshold(data.lowStockThreshold, { allowUndefined: true }),
        categoryId: data.categoryId,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        packingSpec: data.packingSpec,
        length: data.length,
        width: data.width,
        height: data.height,
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

/**
 * 职责：获取商品历史价格
 * 思路：查询priceHistories表，按时间倒序返回
 */
const getPriceHistory = async (req, res, next) => {
  try {
    const { id } = req.params;
    const limit = parsePositiveInt(req.query.limit, 20, 1, 500);
    
    const history = await prisma.priceHistory.findMany({
      where: { productId: id },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });
    
    // 获取相关供应商信息
    const supplierIds = [...new Set(history.filter(h => h.supplierId).map(h => h.supplierId))];
    const suppliers = await prisma.supplier.findMany({
      where: { id: { in: supplierIds } },
      select: { id: true, name: true, shortName: true },
    });
    const supplierMap = new Map(suppliers.map(s => [s.id, s]));
    
    // 组装结果
    const result = history.map(h => ({
      ...h,
      supplier: h.supplierId ? supplierMap.get(h.supplierId) : null,
    }));
    
    success(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：记录商品价格
 */
const recordPrice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { price, supplierId } = req.body;
    
    const record = await prisma.priceHistory.create({
      data: {
        productId: id,
        supplierId,
        price,
      },
    });
    
    // 同时更新商品-供应商关联表的价格
    if (supplierId) {
      await prisma.productSupplier.upsert({
        where: { productId_supplierId: { productId: id, supplierId } },
        update: { price },
        create: { productId: id, supplierId, price },
      });
    }
    
    success(res, record, '价格记录成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取价格趋势统计
 */
const getPriceTrend = async (req, res, next) => {
  try {
    const { id } = req.params;
    const days = parsePositiveInt(req.query.days, 90, 1, 3650);
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const history = await prisma.priceHistory.findMany({
      where: {
        productId: id,
        recordedAt: { gte: startDate },
      },
      orderBy: { recordedAt: 'asc' },
    });
    
    // 计算统计数据
    const prices = history.map(h => h.price);
    const stats = {
      count: prices.length,
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      avg: prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : 0,
      latest: prices.length ? prices[prices.length - 1] : 0,
      trend: history.map(h => ({
        date: h.recordedAt.toISOString().slice(0, 10),
        price: h.price,
      })),
    };
    
    success(res, stats);
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
  getPriceHistory,
  recordPrice,
  getPriceTrend,
};
