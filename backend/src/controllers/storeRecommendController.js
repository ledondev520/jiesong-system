/**
 * Input: PackingItem, Store, Product, ProductCategory
 * Output: 门店采购建议API
 * Pos: 控制器层，提供门店采购建议分析
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success } = require('../utils/response');

/**
 * 职责：获取门店采购统计（按商品分类）
 * 思路：统计每个门店购买的商品，按分类聚合
 */
const getStoreStats = async (req, res, next) => {
  try {
    // 1. 获取所有门店的采购数据
    const packingItems = await prisma.packingItem.findMany({
      where: { storeId: { not: null } },
      include: {
        store: true,
        product: { include: { category: { include: { parent: true } } } },
      },
    });

    // 2. 按门店聚合
    const storeMap = new Map();
    
    packingItems.forEach(item => {
      const storeId = item.storeId;
      const storeName = item.store?.name || '未知';
      
      if (!storeMap.has(storeId)) {
        storeMap.set(storeId, {
          storeId,
          storeName,
          totalAmount: 0,
          productCount: 0,
          categories: new Map(),
          products: new Map(),
        });
      }
      
      const store = storeMap.get(storeId);
      store.totalAmount += item.totalPrice || 0;
      
      // 按商品统计
      const productId = item.productId;
      const productName = item.product?.customsName || '未知';
      if (!store.products.has(productId)) {
        store.products.set(productId, {
          productId,
          productName,
          quantity: 0,
          totalPrice: 0,
          category: item.product?.category?.parent?.name || item.product?.category?.name || '未分类',
        });
      }
      const prod = store.products.get(productId);
      prod.quantity += item.quantity || 0;
      prod.totalPrice += item.totalPrice || 0;
      
      // 按分类统计
      const catName = item.product?.category?.parent?.name || item.product?.category?.name || '未分类';
      if (!store.categories.has(catName)) {
        store.categories.set(catName, { name: catName, amount: 0, count: 0 });
      }
      const cat = store.categories.get(catName);
      cat.amount += item.totalPrice || 0;
      cat.count++;
    });

    // 3. 转换为数组
    const stores = Array.from(storeMap.values()).map(s => ({
      storeId: s.storeId,
      storeName: s.storeName,
      totalAmount: s.totalAmount,
      productCount: s.products.size,
      categories: Array.from(s.categories.values()).sort((a, b) => b.amount - a.amount),
      products: Array.from(s.products.values()).sort((a, b) => b.totalPrice - a.totalPrice),
    })).sort((a, b) => b.totalAmount - a.totalAmount);

    success(res, stores);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：生成门店采购建议
 * 思路：基于参考门店的采购数据，为目标门店生成建议
 */
const getRecommendation = async (req, res, next) => {
  try {
    const { referenceStoreIds, targetStoreName } = req.body;
    
    // 1. 获取参考门店的采购数据
    let whereCondition = { storeId: { not: null } };
    if (referenceStoreIds && referenceStoreIds.length > 0) {
      whereCondition.storeId = { in: referenceStoreIds };
    }
    
    const packingItems = await prisma.packingItem.findMany({
      where: whereCondition,
      include: {
        store: true,
        product: { include: { category: { include: { parent: true } } } },
      },
    });

    // 2. 按商品聚合（统计所有参考门店的采购情况）
    const productMap = new Map();
    const storeSet = new Set();
    
    packingItems.forEach(item => {
      storeSet.add(item.storeId);
      
      const productId = item.productId;
      if (!productMap.has(productId)) {
        productMap.set(productId, {
          productId,
          productName: item.product?.customsName || '未知',
          category: item.product?.category?.parent?.name || item.product?.category?.name || '未分类',
          subCategory: item.product?.category?.name || '未分类',
          storeCount: new Set(),
          totalQuantity: 0,
          quantities: [],
          totalAmount: 0,
          avgUnitPrice: 0,
        });
      }
      
      const prod = productMap.get(productId);
      prod.storeCount.add(item.storeId);
      prod.totalQuantity += item.quantity || 0;
      prod.quantities.push(item.quantity || 0);
      prod.totalAmount += item.totalPrice || 0;
    });

    const totalStores = storeSet.size || 1;

    // 3. 计算建议（按出现频率和平均数量）
    const recommendations = Array.from(productMap.values()).map(p => {
      const frequency = p.storeCount.size / totalStores;
      const avgQuantity = p.quantities.length > 0 
        ? p.quantities.reduce((a, b) => a + b, 0) / p.quantities.length 
        : 0;
      const avgUnitPrice = p.totalQuantity > 0 ? p.totalAmount / p.totalQuantity : 0;
      
      return {
        productId: p.productId,
        productName: p.productName,
        category: p.category,
        subCategory: p.subCategory,
        frequency: Math.round(frequency * 100),
        storeCount: p.storeCount.size,
        avgQuantity: Math.round(avgQuantity * 10) / 10,
        suggestedQuantity: Math.ceil(avgQuantity),
        avgUnitPrice: Math.round(avgUnitPrice * 100) / 100,
        estimatedCost: Math.round(avgQuantity * avgUnitPrice * 100) / 100,
        priority: frequency >= 0.5 ? '强烈建议' : frequency >= 0.2 ? '建议采购' : '可选',
      };
    }).sort((a, b) => b.frequency - a.frequency);

    // 4. 按分类分组
    const byCategory = {};
    recommendations.forEach(r => {
      if (!byCategory[r.category]) {
        byCategory[r.category] = [];
      }
      byCategory[r.category].push(r);
    });

    // 5. 计算总预估金额
    const totalEstimated = recommendations.reduce((sum, r) => sum + r.estimatedCost, 0);

    success(res, {
      targetStoreName: targetStoreName || '新门店',
      referenceStoreCount: totalStores,
      totalProducts: recommendations.length,
      totalEstimatedCost: Math.round(totalEstimated * 100) / 100,
      recommendations,
      byCategory,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取所有门店列表（用于选择参考门店）
 */
const getStoreList = async (req, res, next) => {
  try {
    const stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    success(res, stores);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getStoreStats,
  getRecommendation,
  getStoreList,
};
