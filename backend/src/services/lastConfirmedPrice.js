/**
 * Input: Prisma 客户端（或事务）、商品 ID 列表、可排除的当前单据
 * Output: Map<productId, { price, at, source: 'ORDER' | 'QUOTE' }> —— 每个老商品最近一次负责人确认的美元单价
 * Pos: 报价/订单预填价（负责人 2026-11-01 PRICING-LASTPRICE）：老商品取上次确认价，没有才用成本公式。
 *
 * “确认”= 单据已离开 DRAFT（负责人先审再放行）：订单 status != DRAFT 的 SalesItem.sellingPrice，
 * 报价 status ∈ SENT/ACCEPTED/CONVERTED 的 QuoteItem.unitPrice。取“确认时刻”最新者（订单 SalesItem.createdAt，报价 Quote.sentAt；不用 updatedAt，库存分配/状态流转会刷新它），同刻订单优先；价格须 > 0。
 * 同一商品只看 productId（跨客户）。PriceHistory 是供应商采购成本，不是售价，不用。
 * shortcut: 每个商品拉全部历史行在内存里取第一条，数据量小；单品历史上千行时改成按商品分组取最新。
 */
const CONFIRMED_QUOTE_STATUSES = ['SENT', 'ACCEPTED', 'CONVERTED'];

// rows 已按时间倒序，每个商品取第一条
const newest = (rows) => rows.reduce((best, row) => (best.has(row.productId) ? best : best.set(row.productId, row)), new Map());

const lastConfirmedPrices = async (db, productIds, { excludeQuoteId, excludeSalesContractId } = {}) => {
  const ids = [...new Set((productIds || []).filter((id) => typeof id === 'string' && id))];
  const result = new Map();
  if (ids.length === 0) return result;
  const [orderRows, quoteRows] = await Promise.all([
    db.salesItem.findMany({
      where: {
        productId: { in: ids },
        sellingPrice: { gt: 0 },
        salesContract: { status: { not: 'DRAFT' } },
        ...(excludeSalesContractId ? { salesContractId: { not: excludeSalesContractId } } : {}),
      },
      select: { productId: true, sellingPrice: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.quoteItem.findMany({
      where: {
        productId: { in: ids },
        unitPrice: { gt: 0 },
        // sentAt 在 DRAFT→SENT 写入、退回 DRAFT 清空；非 DRAFT 报价必有值
        quote: { status: { in: CONFIRMED_QUOTE_STATUSES }, sentAt: { not: null }, ...(excludeQuoteId ? { id: { not: excludeQuoteId } } : {}) },
      },
      select: { productId: true, unitPrice: true, quote: { select: { sentAt: true } } },
      orderBy: { quote: { sentAt: 'desc' } },
    }),
  ]);
  const orders = newest(orderRows);
  const quotes = newest(quoteRows);
  for (const id of ids) {
    const order = orders.get(id);
    const quote = quotes.get(id);
    if (order && (!quote || order.createdAt >= quote.quote.sentAt)) {
      result.set(id, { price: order.sellingPrice, at: order.createdAt, source: 'ORDER' });
    } else if (quote) {
      result.set(id, { price: quote.unitPrice, at: quote.quote.sentAt, source: 'QUOTE' });
    }
  }
  return result;
};

module.exports = { lastConfirmedPrices, CONFIRMED_QUOTE_STATUSES };
