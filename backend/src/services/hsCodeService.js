/**
 * Input: 商品名或 HSCode 查询参数、Prisma 客户端
 * Output: HSCode 查询结果与税率
 * Pos: HSCode 服务层，负责本地商品编码检索
 */

const prisma = require('../utils/prisma');

const normalizeKeyword = (value) => String(value || '').trim();

const listHsCodes = async ({ keyword = '', page = 1, pageSize = 50 } = {}) => {
  const normalizedKeyword = normalizeKeyword(keyword);
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);

  const where = normalizedKeyword
    ? {
        productName: {
          contains: normalizedKeyword,
        },
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.hsCode.findMany({
      where,
      orderBy: [
        { effectiveDate: 'desc' },
        { hsCode: 'asc' },
      ],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.hsCode.count({ where }),
  ]);

  return {
    items,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    },
  };
};

const searchByProductName = async (keyword) => {
  const normalizedKeyword = normalizeKeyword(keyword);

  if (!normalizedKeyword) {
    return [];
  }

  return prisma.hsCode.findMany({
    where: {
      productName: {
        contains: normalizedKeyword,
      },
    },
    orderBy: [
      { effectiveDate: 'desc' },
      { hsCode: 'asc' },
    ],
    take: 10,
  });
};

const searchByHsCode = async (code) => {
  const normalizedCode = normalizeKeyword(code);

  if (!normalizedCode) {
    return null;
  }

  return prisma.hsCode.findFirst({
    where: { hsCode: normalizedCode },
    orderBy: { effectiveDate: 'desc' },
  });
};

const getTaxRate = async (code) => {
  const record = await searchByHsCode(code);
  return record ? record.taxRate : null;
};

/**
 * 批量 HSCode 匹配
 * @param {string[]} productNames - 商品名称列表
 * @returns {Promise<Array>} - 每个商品名称对应的最佳匹配结果
 */
const batchMatchHsCodes = async (productNames) => {
  if (!Array.isArray(productNames) || productNames.length === 0) {
    return [];
  }

  const results = [];

  for (const productName of productNames) {
    const normalizedKeyword = normalizeKeyword(productName);

    if (!normalizedKeyword) {
      results.push({
        productName,
        hsCode: null,
        match: null,
        confidence: 'none',
      });
      continue;
    }

    // 查找最佳匹配
    const matches = await prisma.hsCode.findMany({
      where: {
        productName: {
          contains: normalizedKeyword,
        },
      },
      orderBy: [
        { effectiveDate: 'desc' },
        { hsCode: 'asc' },
      ],
      take: 1,
    });

    if (matches.length > 0) {
      const match = matches[0];
      // 计算匹配置信度
      let confidence = 'low';
      if (match.productName === normalizedKeyword) {
        confidence = 'exact';
      } else if (match.productName.includes(normalizedKeyword) && normalizedKeyword.length >= 4) {
        confidence = 'high';
      }

      results.push({
        productName,
        hsCode: match.hsCode,
        match: {
          hsCode: match.hsCode,
          productName: match.productName,
          taxRate: match.taxRate,
          refundRate: match.refundRate,
          exportTaxRate: match.exportTaxRate,
          vatRate: match.vatRate,
          unit: match.unit,
          declarationElements: match.declarationElements,
          supervisionConditions: match.supervisionConditions,
        },
        confidence,
      });
    } else {
      results.push({
        productName,
        hsCode: null,
        match: null,
        confidence: 'none',
      });
    }
  }

  return results;
};

module.exports = {
  listHsCodes,
  searchByProductName,
  searchByHsCode,
  getTaxRate,
  batchMatchHsCodes,
};
