/**
 * Input: 商品名或 HSCode 查询参数、Prisma 客户端
 * Output: HSCode 查询结果与税率（支持精确包含搜索与相似度模糊搜索）
 * Pos: HSCode 服务层，负责本地商品编码检索
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

const normalizeKeyword = (value) => String(value || '').trim();

/**
 * 职责：计算两个字符串的 Dice 相似度（双字符 bigram 集合重叠）
 * 思路：
 *   1. 将两个字符串分别切成 2-char bigram 集合
 *   2. 计算交集大小 / (集合1大小 + 集合2大小) * 2
 *   3. 对于长度为1的字符串退化为字符集合 Jaccard
 * @param {string} a - 查询关键词
 * @param {string} b - 商品名称
 * @returns {number} 0~1 的相似度分数
 */
function diceSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // 1. 若 b 包含 a，给一个较高的基准分
  if (b.includes(a)) return 0.85 + Math.min(0.15, a.length / b.length * 0.15);

  // 2. 构造 bigram 集合
  const getBigrams = (str) => {
    const s = new Set();
    for (let i = 0; i < str.length - 1; i++) s.add(str.slice(i, i + 2));
    return s;
  };

  const bigrams1 = getBigrams(a);
  const bigrams2 = getBigrams(b);

  // 3. 单字符退化为字符集合
  if (bigrams1.size === 0 || bigrams2.size === 0) {
    const chars1 = new Set([...a]);
    const chars2 = new Set([...b]);
    let inter = 0;
    chars1.forEach((c) => { if (chars2.has(c)) inter++; });
    return (2 * inter) / (chars1.size + chars2.size);
  }

  let inter = 0;
  bigrams1.forEach((bg) => { if (bigrams2.has(bg)) inter++; });
  return (2 * inter) / (bigrams1.size + bigrams2.size);
}

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

/**
 * 职责：对商品名称做模糊相似度搜索，返回结果含 similarity 分数（0~1）
 * 思路：
 *   1. 先做 LIKE contains 精确匹配（最快路径）
 *   2. 用关键词各 bigram 追加候选（OR LIKE 查询）
 *   3. 对所有候选用 Dice 计算相似度，过滤 < 0.2 的噪声
 *   4. 降序排列后分页返回
 * @param {{ keyword: string, page: number, pageSize: number }} params
 */
const fuzzySearchHsCodes = async ({ keyword = '', page = 1, pageSize = 20 } = {}) => {
  const q = normalizeKeyword(keyword);
  if (!q) return listHsCodes({ page, pageSize });

  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safePageSize = Math.min(Math.max(parseInt(pageSize, 10) || 20, 1), 200);

  // 1. 精确包含匹配（限量 300 条，用于快速召回）
  const exactItems = await prisma.hsCode.findMany({
    where: { productName: { contains: q } },
    take: 300,
  });
  const seenIds = new Set(exactItems.map((r) => r.id));
  const candidates = [...exactItems];

  // 2. Bigram 候选召回：合并为单次 OR 查询，减少 DB 往返次数
  if (q.length >= 2) {
    const bigrams = [];
    for (let i = 0; i < q.length - 1; i++) bigrams.push(q.slice(i, i + 2));
    const uniqueBigrams = [...new Set(bigrams)].slice(0, 6); // 最多 6 个 bigram

    // 单次查询：productName 包含任意一个 bigram
    const bigramRows = await prisma.hsCode.findMany({
      where: {
        OR: uniqueBigrams.map((bg) => ({ productName: { contains: bg } })),
      },
      take: 600, // 硬顶候选池
    });

    for (const row of bigramRows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        candidates.push(row);
      }
    }
  }

  // 3. 相似度评分并过滤
  const THRESHOLD = 0.2;
  const scored = candidates
    .map((item) => ({ ...item, similarity: diceSimilarity(q, item.productName) }))
    .filter((item) => item.similarity >= THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity);

  // 4. 分页
  const total = scored.length;
  const items = scored.slice((safePage - 1) * safePageSize, safePage * safePageSize);

  return {
    items,
    fuzzy: true,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.max(Math.ceil(total / safePageSize), 1),
    },
  };
};

module.exports = {
  listHsCodes,
  fuzzySearchHsCodes,
  searchByProductName,
  searchByHsCode,
  getTaxRate,
  batchMatchHsCodes,
};
