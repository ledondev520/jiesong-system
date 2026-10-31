/**
 * Input: quote headers/items from authenticated SALES/ADMIN users, the one pricing rule (config/pricing.json)
 * Output: persisted Quote/QuoteItem rows, state transitions and the ACCEPTED→CONVERTED sales-order transaction
 * Pos: docs/redesign/DATA-MODEL-2026.md §4. Quotes are never deleted (CANCELLED instead); edits only in DRAFT.
 * Prices come only from priceFor(); a client formulaPrice is ignored, a client unitPrice counts only with isManualPrice.
 */
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { partialUpdate } = require('../utils/partialUpdate');
const { loadPricingSnapshot } = require('./pricingConfigService');
const { priceFor, effectiveRateFor, round } = require('./exportPricing');
const { lastConfirmedPrices } = require('./lastConfirmedPrice');
const { withCategoryChains } = require('./productCategoryChain');
const { generateNextContractNo } = require('./shared/contractUtils');
const { QUOTE_STATUS, NOT_ALLOWED, planTransition } = require('./quoteStateMachine');

const INCOTERMS = ['FOB', 'CFR', 'CIF', 'EXW', 'DDP'];
const MAX_ITEMS = 500;
const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;

const bad = (message) => createError(message, 400);
const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

const headerFields = {
  customerId: { type: 'string', nullable: true },
  currency: { type: 'string', normalize: (v) => { if (v.toUpperCase() !== 'USD') throw bad('币种暂仅支持 USD'); return 'USD'; } },
  incoterm: { type: 'string', normalize: (v) => { if (!INCOTERMS.includes(v.toUpperCase())) throw bad('贸易术语无效'); return v.toUpperCase(); } },
  paymentTerms: { type: 'string', nullable: true },
  portOfLoading: { type: 'string', nullable: true },
  note: { type: 'string', nullable: true },
  validUntil: { type: 'string', nullable: true, normalize: (v) => { const d = new Date(v); if (Number.isNaN(d.getTime())) throw bad('有效期日期无效'); return d; } },
  spotRate: { type: 'number', nullable: true, normalize: (v) => { if (!(v > 0)) throw bad('现汇必须为正数'); return v; } },
};

const itemInclude = {
  items: {
    orderBy: { sortOrder: 'asc' },
    include: {
      product: { select: { id: true, customsName: true, specification: true, unit: true, categoryId: true } },
      store: { select: { id: true, name: true, code: true } },
    },
  },
  customer: { select: { id: true, name: true } },
  salesContract: { select: { id: true, contractNo: true } },
};

const shanghaiStartOfToday = (now = new Date()) => {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - SHANGHAI_OFFSET_MS;
};
// Expiry is computed, never stored (§4.3): a SENT quote past validUntil shows 已过期.
const present = (quote) => (quote && {
  ...quote,
  isExpired: quote.status === QUOTE_STATUS.SENT && !!quote.validUntil && quote.validUntil.getTime() < shanghaiStartOfToday(),
});

const readQuote = async (db, id) => {
  const quote = await db.quote.findUnique({ where: { id }, include: itemInclude });
  if (!quote) throw createError('报价不存在', 404);
  return quote;
};

const getQuote = async (id) => present(await readQuote(prisma, id));

const listQuotes = async ({ skip, pageSize, keyword, status }) => {
  const where = {};
  if (status) where.status = String(status).trim().toUpperCase();
  if (keyword) where.OR = [{ quoteNo: { contains: keyword } }, { note: { contains: keyword } }, { customer: { name: { contains: keyword } } }];
  const [rows, total] = await Promise.all([
    prisma.quote.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' },
      include: { customer: { select: { id: true, name: true } }, _count: { select: { items: true } } } }),
    prisma.quote.count({ where }),
  ]);
  return { rows: rows.map(present), total };
};

const nextQuoteNo = async (db, now = new Date()) => {
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  const prefix = `QT${String(local.getUTCFullYear()).slice(2)}${String(local.getUTCMonth() + 1).padStart(2, '0')}-`;
  const rows = await db.quote.findMany({ where: { quoteNo: { startsWith: prefix } }, select: { quoteNo: true } });
  const last = rows.reduce((max, row) => Math.max(max, Number(row.quoteNo.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(last + 1).padStart(3, '0')}`;
};

/** Validates raw item input; returns plain rows without prices. Throws 400 before anything is written. */
const normalizeItems = async (db, raw) => {
  if (!Array.isArray(raw) || raw.length > MAX_ITEMS) throw bad('明细格式无效');
  const rows = raw.map((item, index) => {
    if (!item || typeof item !== 'object' || typeof item.productId !== 'string' || !item.productId) throw bad(`第${index + 1}行缺少商品`);
    if (!isNumber(item.quantity) || item.quantity <= 0) throw bad(`第${index + 1}行数量必须大于0`);
    const cost = item.costCny ?? null;
    if (cost !== null && (!isNumber(cost) || cost <= 0)) throw bad(`第${index + 1}行成本必须大于0`);
    const manual = item.isManualPrice === true;
    if (manual && (!isNumber(item.unitPrice) || item.unitPrice < 0)) throw bad(`第${index + 1}行手动单价无效`);
    return {
      productId: item.productId, storeId: item.storeId || null, quantity: item.quantity,
      unit: item.unit ?? null, specification: item.specification ?? null, note: item.note ?? null,
      costCny: cost, costSupplierId: item.costSupplierId ?? null, costContractNo: item.costContractNo ?? null,
      isManualPrice: manual, manualPrice: manual ? item.unitPrice : null, sortOrder: index,
    };
  });
  const productIds = [...new Set(rows.map((r) => r.productId))];
  const products = await db.product.findMany({ where: { id: { in: productIds } },
    select: { id: true, categoryId: true, unit: true, specification: true } });
  if (products.length !== productIds.length) throw bad('包含不存在的商品');
  const storeIds = [...new Set(rows.map((r) => r.storeId).filter(Boolean))];
  if (storeIds.length && (await db.store.count({ where: { id: { in: storeIds } } })) !== storeIds.length) throw bad('包含不存在的门店');
  const byId = new Map(products.map((p) => [p.id, p]));
  return withCategoryChains(rows.map((r) => ({ ...r, product: byId.get(r.productId) })), db)
    .then((withChains) => withChains.map((r) => ({ ...r, unit: r.unit ?? r.product.unit ?? null, specification: r.specification ?? r.product.specification ?? null })));
};

/**
 * The only place prices are produced: formulaPrice from priceFor(), manual override kept, totals rounded to cents.
 * Non-manual lines of repeat products take the last owner-confirmed price (lastConfirmedPrice.js); formulaPrice stays the rule price.
 */
const priceItems = async (db, rows, spotRate, { excludeQuoteId } = {}) => {
  const { config, revision } = loadPricingSnapshot();
  const spot = spotRate ?? config.exchangeRate;
  const pricingRate = effectiveRateFor(spot, config);
  if (!(pricingRate > 0)) throw bad('现汇无效，无法计算报价');
  const last = await lastConfirmedPrices(db, rows.filter((row) => !row.isManualPrice).map((row) => row.productId), { excludeQuoteId });
  const items = rows.map(({ product, manualPrice, ...row }) => {
    const priced = priceFor({ costCny: row.costCny, categoryIds: product?.categoryIds || [], spotRate: spot }, config);
    const formulaPrice = priced.status === 'OK' ? priced.unitPriceUsd : null;
    const unitPrice = row.isManualPrice ? manualPrice : (last.get(row.productId)?.price ?? formulaPrice ?? 0);
    return { ...row, markup: priced.status === 'OK' ? priced.markup : null, formulaPrice, unitPrice,
      totalPrice: round(unitPrice * row.quantity, 2) };
  });
  return { items, spotRate: spot, pricingRate, pricingRevision: revision, totalAmount: round(items.reduce((s, i) => s + i.totalPrice, 0), 2) };
};

const assertActiveCustomer = async (db, customerId) => {
  const customer = await db.customer.findUnique({ where: { id: customerId } });
  if (!customer || !customer.isActive) throw bad('客户不存在或已归档');
  return customer;
};

const createWithNumber = async (build) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(build);
    } catch (error) {
      if (error.code !== 'P2002' || attempt === 2) throw error;
    }
  }
  return undefined;
};

const createQuote = async (body = {}, actor) => {
  const input = body || {};
  let data = partialUpdate(input, headerFields);
  let rawItems = input.items;
  const spotInput = data.spotRate;
  if (input.copyFromQuoteId) {
    const source = await readQuote(prisma, String(input.copyFromQuoteId));
    data = { customerId: source.customerId, currency: source.currency, incoterm: source.incoterm, paymentTerms: source.paymentTerms,
      portOfLoading: source.portOfLoading, note: source.note, ...data };
    // Copy keeps manual prices; everything else is repriced with the current rule at the current (or given) spot.
    rawItems ??= source.items.map((i) => ({ productId: i.productId, storeId: i.storeId, quantity: i.quantity, unit: i.unit,
      specification: i.specification, note: i.note, costCny: i.costCny, costSupplierId: i.costSupplierId, costContractNo: i.costContractNo,
      isManualPrice: i.isManualPrice, unitPrice: i.unitPrice }));
  }
  if (data.customerId) await assertActiveCustomer(prisma, data.customerId);
  else if (!Object.hasOwn(data, 'customerId')) {
    const active = await prisma.customer.findMany({ where: { isActive: true }, take: 2 });
    if (active.length === 1) data.customerId = active[0].id;
  }
  if (data.customerId) {
    const customer = await prisma.customer.findUnique({ where: { id: data.customerId } });
    data.incoterm ??= customer.defaultIncoterm;
    data.paymentTerms ??= customer.defaultPaymentTerms;
    data.portOfLoading ??= customer.defaultPortOfLoading;
  }
  delete data.spotRate;
  const priced = rawItems === undefined ? null : await priceItems(prisma, await normalizeItems(prisma, rawItems), spotInput);
  const id = await createWithNumber(async (tx) => {
    const quote = await tx.quote.create({ data: {
      ...data, quoteNo: await nextQuoteNo(tx), createdById: actor.id,
      ...(priced ? { spotRate: priced.spotRate, pricingRate: priced.pricingRate, pricingRevision: priced.pricingRevision, totalAmount: priced.totalAmount } : {}),
      ...(!priced && spotInput ? { spotRate: spotInput } : {}),
    } });
    if (priced?.items.length) await tx.quoteItem.createMany({ data: priced.items.map((i) => ({ ...i, quoteId: quote.id })) });
    return quote.id;
  });
  return getQuote(id);
};

/** Header/items edit. Only DRAFT; the updateMany status guard makes a concurrent send/cancel win with 409. */
const editQuote = async (id, body) => {
  const current = await readQuote(prisma, id);
  if (current.status !== QUOTE_STATUS.DRAFT) throw createError(NOT_ALLOWED, 400);
  const data = partialUpdate(body, headerFields);
  if (data.customerId) await assertActiveCustomer(prisma, data.customerId);
  const spotChanged = Object.hasOwn(data, 'spotRate') && data.spotRate !== current.spotRate;
  let priced = null;
  if (body.items !== undefined || spotChanged) {
    const raw = body.items ?? current.items.map((i) => ({ ...i, unitPrice: i.unitPrice }));
    const spot = Object.hasOwn(data, 'spotRate') ? data.spotRate : (current.spotRate ?? undefined);
    priced = await priceItems(prisma, await normalizeItems(prisma, raw), spot ?? undefined, { excludeQuoteId: id });
  }
  delete data.spotRate;
  if (!priced && !Object.keys(data).length) return present(current);
  await prisma.$transaction(async (tx) => {
    const result = await tx.quote.updateMany({ where: { id, status: QUOTE_STATUS.DRAFT }, data: {
      ...data,
      ...(priced ? { spotRate: priced.spotRate, pricingRate: priced.pricingRate, pricingRevision: priced.pricingRevision, totalAmount: priced.totalAmount } : {}),
    } });
    if (result.count !== 1) throw createError('报价已被其他操作修改，请刷新', 409);
    if (priced) {
      await tx.quoteItem.deleteMany({ where: { quoteId: id } });
      if (priced.items.length) await tx.quoteItem.createMany({ data: priced.items.map((i) => ({ ...i, quoteId: id })) });
    }
  });
  return getQuote(id);
};

const convertToOrder = async (tx, quote) => {
  const storeIds = [...new Set(quote.items.map((i) => i.storeId))];
  const stores = await tx.store.findMany({ where: { id: { in: storeIds } }, select: { portId: true } });
  const ports = new Set(stores.map((s) => s.portId));
  const contractNo = await generateNextContractNo({ prisma: tx, year: new Date().getFullYear() });
  const order = await tx.salesContract.create({ data: {
    contractNo, status: 'DRAFT', customerId: quote.customerId, currency: quote.currency, incoterm: quote.incoterm,
    paymentTerms: quote.paymentTerms, portOfLoading: quote.portOfLoading, quoteId: quote.id,
    // Owner decision 2026-10-31: order FX = spot − 0.2, i.e. the rate the quote was priced with.
    exchangeRate: quote.pricingRate, portId: ports.size === 1 ? [...ports][0] : null,
    totalAmount: round(quote.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0), 2),
  } });
  await tx.salesItem.createMany({ data: quote.items.map((i) => ({
    salesContractId: order.id, productId: i.productId, storeId: i.storeId, quantity: i.quantity, unit: i.unit,
    specification: i.specification, note: i.note, costPrice: i.costCny ?? 0, sellingPrice: i.unitPrice,
  })) });
  return order;
};

const transitionQuote = async (id, to) => {
  let order = null;
  try {
    await prisma.$transaction(async (tx) => {
      const quote = await readQuote(tx, id);
      const extra = planTransition(quote, to);
      const result = await tx.quote.updateMany({ where: { id, status: quote.status }, data: { status: to, ...extra } });
      if (result.count !== 1) throw createError('报价状态已变化，请刷新', 409);
      if (to === QUOTE_STATUS.CONVERTED) order = await convertToOrder(tx, quote);
    });
  } catch (error) {
    // Unique quoteId / contractNo: someone converted the same quote or took the number first.
    if (error.code === 'P2002') throw createError('报价已转换或合同编号冲突，请刷新后重试', 409);
    throw error;
  }
  const quote = await getQuote(id);
  return order ? { ...quote, convertedOrder: { id: order.id, contractNo: order.contractNo } } : quote;
};

/** PUT /quotes/:id: either a status transition alone (`status` already parsed by the controller), or field/item edits. */
const updateQuote = async (id, body, status) => {
  const input = body || {};
  if (status !== undefined) {
    if (Object.keys(input).some((key) => key !== 'status')) throw bad('状态变更不能与其他字段同时提交');
    return transitionQuote(id, status.toUpperCase());
  }
  return editQuote(id, input);
};

module.exports = { listQuotes, getQuote, createQuote, updateQuote, nextQuoteNo, priceItems };
