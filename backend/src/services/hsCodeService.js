/**
 * Input: 商品名或 HSCode 查询参数、Prisma 客户端
 * Output: HSCode 查询结果与税率
 * Pos: HSCode 服务层，负责本地商品编码检索
 */

const prisma = require('../utils/prisma');

const normalizeKeyword = (value) => String(value || '').trim();

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

module.exports = {
  searchByProductName,
  searchByHsCode,
  getTaxRate,
};
