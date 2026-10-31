/** Merge rules of lastConfirmedPrices with a stub client; the DRAFT / price > 0 / exclusion filters are asserted on the query
 *  and exercised against real SQLite in integration/last-confirmed-price.integration.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { lastConfirmedPrices } = require('./lastConfirmedPrice');

const at = (day) => new Date(`2026-10-${day}T00:00:00Z`);
const stub = ({ orders = [], quotes = [] } = {}) => {
  const calls = {};
  return {
    calls,
    salesItem: { findMany: async (args) => { calls.order = args; return orders; } },
    quoteItem: { findMany: async (args) => { calls.quote = args; return quotes; } },
  };
};

test('queries only confirmed documents with a positive price and honours exclusions', async () => {
  const db = stub();
  await lastConfirmedPrices(db, ['p1', 'p1', '', 'p2'], { excludeQuoteId: 'q9', excludeSalesContractId: 'c9' });
  assert.deepEqual(db.calls.order.where, {
    productId: { in: ['p1', 'p2'] }, sellingPrice: { gt: 0 }, salesContract: { status: { not: 'DRAFT' } }, salesContractId: { not: 'c9' },
  });
  assert.deepEqual(db.calls.quote.where, {
    productId: { in: ['p1', 'p2'] }, unitPrice: { gt: 0 }, quote: { status: { in: ['SENT', 'ACCEPTED', 'CONVERTED'] }, sentAt: { not: null }, id: { not: 'q9' } },
  });
  const none = stub();
  assert.equal((await lastConfirmedPrices(none, [])).size, 0);
  assert.equal(none.calls.order, undefined);
});

test('newest of order and quote wins per product; a tie goes to the order', async () => {
  const db = stub({
    // rows arrive newest first, as the queries order them
    orders: [
      { productId: 'tie', sellingPrice: 10, createdAt: at('05') }, { productId: 'tie', sellingPrice: 1, createdAt: at('01') },
      { productId: 'old-order', sellingPrice: 20, createdAt: at('02') },
    ],
    quotes: [
      { productId: 'tie', unitPrice: 11, quote: { sentAt: at('05') } },
      { productId: 'old-order', unitPrice: 21, quote: { sentAt: at('03') } },
      { productId: 'quote-only', unitPrice: 30.5, quote: { sentAt: at('04') } },
    ],
  });
  const result = await lastConfirmedPrices(db, ['tie', 'old-order', 'quote-only', 'never-sold']);
  assert.deepEqual([...result].map(([id, v]) => [id, v.price, v.source]), [['tie', 10, 'ORDER'], ['old-order', 21, 'QUOTE'], ['quote-only', 30.5, 'QUOTE']]);
});
