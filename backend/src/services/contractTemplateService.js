/**
 * Input: Prisma 客户端
 * Output: 合同模板业务逻辑
 * Pos: 合同模板服务层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：列出合同模板
 * 思路：支持按类型筛选，按创建时间倒序
 */
const list = async ({ type, createdBy } = {}) => {
  const where = {};
  if (type) where.type = type;
  if (createdBy) where.createdBy = createdBy;

  const templates = await prisma.contractTemplate.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });

  return templates.map((t) => ({
    ...t,
    items: safeParseItems(t.items),
  }));
};

/**
 * 职责：获取单个合同模板
 */
const getById = async (id) => {
  const template = await prisma.contractTemplate.findUnique({
    where: { id },
  });

  if (!template) {
    throw createError('合同模板不存在', 404);
  }

  return {
    ...template,
    items: safeParseItems(template.items),
  };
};

/**
 * 职责：创建合同模板
 */
const create = async (data) => {
  const { name, type, supplierId, taxRate, note, items, createdBy } = data;

  if (!name || !type) {
    throw createError('模板名称和类型不能为空', 400);
  }

  const template = await prisma.contractTemplate.create({
    data: {
      name,
      type,
      supplierId: supplierId || null,
      taxRate: taxRate ?? null,
      note: note || null,
      items: typeof items === 'string' ? items : JSON.stringify(items || []),
      createdBy: createdBy || 'system',
    },
  });

  return {
    ...template,
    items: safeParseItems(template.items),
  };
};

/**
 * 职责：删除合同模板
 */
const remove = async (id) => {
  await prisma.contractTemplate.delete({
    where: { id },
  });

  return { id };
};

/**
 * 职责：安全解析 items JSON 字符串
 */
function safeParseItems(itemsJson) {
  if (!itemsJson) return [];
  try {
    const parsed = JSON.parse(itemsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

module.exports = {
  list,
  getById,
  create,
  remove,
};
