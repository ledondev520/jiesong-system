/**
 * Input: Prisma、客户/门店请求字段
 * Output: 客户与门店字段校验、新门店所属客户解析（DATA-MODEL-2026 §2.4 的 API 规则）
 * Pos: 客户 API 与门店创建共用；校验失败抛 400，不写库
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

const INCOTERMS = ['FOB', 'CFR', 'CIF', 'EXW', 'DDP'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STORE_CODE = /^[A-Z0-9-]{2,12}$/;
const MAX_TEXT = 500;

/** 校验 partialUpdate 之后的客户字段（只校验出现的字段）；v1 仅 USD。 */
const validateCustomerData = (data) => {
  for (const [field, value] of Object.entries(data)) {
    if (typeof value === 'string' && value.length > MAX_TEXT) throw createError(`${field}过长`, 400);
  }
  if (data.country != null && !/^[A-Z]{2}$/.test(data.country)) throw createError('国家须为两位字母代码', 400);
  if (data.contactEmail != null && !EMAIL.test(data.contactEmail)) throw createError('联系邮箱格式无效', 400);
  if (data.defaultCurrency !== undefined && data.defaultCurrency !== 'USD') throw createError('目前仅支持美元(USD)', 400);
  if (data.defaultIncoterm !== undefined && !INCOTERMS.includes(data.defaultIncoterm)) {
    throw createError(`贸易术语须为 ${INCOTERMS.join('/')}`, 400);
  }
  return data;
};

/** 门店简称：2–12 位 A-Z0-9-，统一大写；空串/null 表示清空 */
const normalizeStoreCode = (value) => {
  if (value === undefined) return undefined;
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!STORE_CODE.test(code)) throw createError('门店简称须为 2–12 位字母、数字或连字符', 400);
  return code;
};

/**
 * 新门店所属客户：显式 customerId 必须存在且未归档；缺省时仅当恰有一个启用客户才采用，否则 400。
 */
const resolveCustomerIdForNewStore = async (customerId, db = prisma) => {
  if (customerId !== undefined && customerId !== null && customerId !== '') {
    const customer = await db.customer.findUnique({ where: { id: String(customerId) }, select: { id: true, isActive: true } });
    if (!customer) throw createError('客户不存在', 400);
    if (!customer.isActive) throw createError('客户已归档，不能新增门店', 400);
    return customer.id;
  }
  const active = await db.customer.findMany({ where: { isActive: true }, select: { id: true }, take: 2 });
  if (active.length !== 1) throw createError('请选择客户', 400);
  return active[0].id;
};

module.exports = { INCOTERMS, validateCustomerData, normalizeStoreCode, resolveCustomerIdForNewStore };
