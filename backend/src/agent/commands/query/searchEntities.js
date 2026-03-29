/**
 * Input: 查询关键字、类型过滤、结果上限
 * Output: 统一查询结果数组
 * Pos: Agent 命令层查询能力，供 CLI / MCP / HTTP 复用
 */

const prisma = require('../../../utils/prisma');

const DEFAULT_TYPES = ['product', 'supplier', 'purchase', 'sales'];
const MAX_LIMIT = 20;

const normalizeText = (value) => String(value || '').trim().toLowerCase();

const sanitizeTypes = (types) => {
  if (!Array.isArray(types) || !types.length) {
    return DEFAULT_TYPES;
  }

  const normalized = types
    .map((type) => String(type || '').trim().toLowerCase())
    .filter((type) => DEFAULT_TYPES.includes(type));

  return normalized.length ? Array.from(new Set(normalized)) : DEFAULT_TYPES;
};

const sanitizeLimit = (limit) => {
  const parsed = Number.parseInt(String(limit || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 10;
  }
  return Math.min(parsed, MAX_LIMIT);
};

const computeScore = (query, ...candidates) => {
  const q = normalizeText(query);
  const texts = candidates.map(normalizeText).filter(Boolean);
  let best = 0;

  for (const text of texts) {
    if (text === q) best = Math.max(best, 100);
    else if (text.startsWith(q)) best = Math.max(best, 90);
    else if (text.includes(q)) best = Math.max(best, 75);
  }

  return best;
};

const searchProducts = async (query, limit) => {
  const items = await prisma.product.findMany({
    where: {
      OR: [
        { customsName: { contains: query } },
        { description: { contains: query } },
      ],
    },
    take: limit,
    select: {
      id: true,
      customsName: true,
      specification: true,
      unit: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return items.map((item) => ({
    type: 'product',
    id: item.id,
    title: item.customsName,
    subtitle: item.specification || item.unit || '',
    score: computeScore(query, item.customsName, item.specification, item.unit),
  }));
};

const searchSuppliers = async (query, limit) => {
  const items = await prisma.supplier.findMany({
    where: {
      OR: [
        { name: { contains: query } },
        { shortName: { contains: query } },
      ],
    },
    take: limit,
    select: {
      id: true,
      name: true,
      shortName: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return items.map((item) => ({
    type: 'supplier',
    id: item.id,
    title: item.name,
    subtitle: item.shortName || '',
    score: computeScore(query, item.name, item.shortName),
  }));
};

const searchPurchases = async (query, limit) => {
  const items = await prisma.purchaseContract.findMany({
    where: {
      OR: [
        { contractNo: { contains: query } },
        { supplier: { name: { contains: query } } },
      ],
    },
    take: limit,
    select: {
      id: true,
      contractNo: true,
      supplier: {
        select: {
          name: true,
        },
      },
    },
    orderBy: { contractNo: 'desc' },
  });

  return items.map((item) => ({
    type: 'purchase',
    id: item.id,
    title: item.contractNo,
    subtitle: item.supplier?.name || '采购合同',
    score: computeScore(query, item.contractNo, item.supplier?.name),
  }));
};

const searchSales = async (query, limit) => {
  const items = await prisma.salesContract.findMany({
    where: {
      contractNo: { contains: query },
    },
    take: limit,
    select: {
      id: true,
      contractNo: true,
      totalAmount: true,
    },
    orderBy: { contractNo: 'desc' },
  });

  return items.map((item) => ({
    type: 'sales',
    id: item.id,
    title: item.contractNo,
    subtitle: `$${Number(item.totalAmount || 0).toLocaleString()}`,
    score: computeScore(query, item.contractNo),
  }));
};

const sortResults = (results) => results.sort((a, b) => {
  if (b.score !== a.score) return b.score - a.score;
  return a.title.localeCompare(b.title, 'zh-CN');
});

const searchEntities = async ({ query, types, limit } = {}) => {
  const normalizedQuery = String(query || '').trim();
  if (normalizedQuery.length < 2) {
    return [];
  }

  const resolvedTypes = sanitizeTypes(types);
  const resolvedLimit = sanitizeLimit(limit);
  const tasks = [];

  if (resolvedTypes.includes('product')) {
    tasks.push(searchProducts(normalizedQuery, resolvedLimit));
  }
  if (resolvedTypes.includes('supplier')) {
    tasks.push(searchSuppliers(normalizedQuery, resolvedLimit));
  }
  if (resolvedTypes.includes('purchase')) {
    tasks.push(searchPurchases(normalizedQuery, resolvedLimit));
  }
  if (resolvedTypes.includes('sales')) {
    tasks.push(searchSales(normalizedQuery, resolvedLimit));
  }

  const results = (await Promise.all(tasks)).flat();
  return sortResults(results).slice(0, resolvedLimit);
};

module.exports = {
  searchEntities,
};
