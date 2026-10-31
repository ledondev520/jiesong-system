const pricing = require('../../services/pricingConfigService');
const { priceFor } = require('../../services/exportPricing');
const { chainFor } = require('../../services/productCategoryChain');
const prisma = require('../../utils/prisma');
const { createError } = require('../../middleware/errorHandler');
const { success } = require('../../utils/response');

const categoryParents = async () => new Map(
  (await prisma.productCategory.findMany({ select: { id: true, parentId: true, name: true } }))
    .map((row) => [row.id, row]),
);

/**
 * 保存前核对分类：categoryId 必须存在；categoryName 是展示快照，以数据库当前名称为准。
 * 没有分类加价时不查库。
 */
const withVerifiedCategories = async (config) => {
  if (!config || !Array.isArray(config.categoryMarkups) || config.categoryMarkups.length === 0) return config;
  const rows = await categoryParents();
  const categoryMarkups = config.categoryMarkups.map((entry) => {
    const row = rows.get(entry?.categoryId);
    if (!row) throw createError(`报价配置分类不存在：${String(entry?.categoryId).slice(0, 64)}`, 400);
    return { ...entry, categoryName: row.name };
  });
  return { ...config, categoryMarkups };
};

const getPricing = (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    return success(res, { ...pricing.loadPricingSnapshot(), schema: pricing.schema });
  } catch (error) { return next(error); }
};

const updatePricing = async (req, res, next) => {
  try {
    const config = await withVerifiedCategories(req.body?.config);
    const result = pricing.updatePricingConfig(config, req.body?.revision, req.user.id);
    res.set('Cache-Control', 'no-store');
    return success(res, { ...result, schema: pricing.schema });
  } catch (error) { return next(error); }
};

const MAX_DRAFT_BYTES = 4096;

/**
 * 报价预览（只读 GET）：与单据生成共用 priceFor()。
 * query：costCny、categoryId?、spotRate?、config?（未保存草稿的 JSON，仅校验、不写文件；≤4KB，
 * 前端只带预览分类相关的加价项）。
 */
const previewPricing = async (req, res, next) => {
  try {
    const { costCny, categoryId, spotRate, config: draftText } = req.query || {};
    let config;
    if (draftText === undefined) config = pricing.loadPricingConfig();
    else {
      if (typeof draftText !== 'string' || Buffer.byteLength(draftText) > MAX_DRAFT_BYTES) throw createError('预览配置过大或格式无效', 400);
      let draft;
      try { draft = JSON.parse(draftText); } catch { throw createError('预览配置不是有效 JSON', 400); }
      config = pricing.validatePricingConfig(draft);
    }
    let categoryIds = [];
    if (categoryId !== undefined && categoryId !== '') {
      if (typeof categoryId !== 'string') throw createError('categoryId 必须是文本', 400);
      const rows = await categoryParents();
      if (!rows.has(categoryId)) throw createError('商品分类不存在', 400);
      categoryIds = chainFor(categoryId, new Map([...rows].map(([id, row]) => [id, row.parentId])));
    }
    const spot = spotRate === undefined || spotRate === '' ? undefined : spotRate;
    res.set('Cache-Control', 'no-store');
    return success(res, priceFor({ costCny: costCny === '' ? undefined : costCny, categoryIds, spotRate: spot }, config));
  } catch (error) { return next(error); }
};

module.exports = { getPricing, previewPricing, updatePricing };
