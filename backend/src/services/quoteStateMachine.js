/**
 * Input: quote status pair and the quote snapshot (header + items)
 * Output: whether a transition is allowed, the side-effect fields it sets, or a Chinese 400 reason
 * Pos: pure state machine for docs/redesign/DATA-MODEL-2026.md §4.3; persistence and concurrency live in quoteService.js
 */
const { createError } = require('../middleware/errorHandler');

const QUOTE_STATUS = Object.freeze({
  DRAFT: 'DRAFT', SENT: 'SENT', ACCEPTED: 'ACCEPTED', REJECTED: 'REJECTED', CONVERTED: 'CONVERTED', CANCELLED: 'CANCELLED',
});
const NOT_ALLOWED = '报价状态不允许此操作';

const TRANSITIONS = Object.freeze({
  DRAFT: ['SENT', 'CANCELLED'],
  SENT: ['DRAFT', 'ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['CONVERTED', 'CANCELLED'],
  REJECTED: [],
  CONVERTED: [],
  CANCELLED: [],
});

const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

/** Guard shared by DRAFT→SENT and ACCEPTED→CONVERTED (the sent guards must still hold). */
const assertSendable = (quote) => {
  const items = quote.items || [];
  const ok = quote.customerId
    && items.length > 0
    && items.every((item) => item.storeId && positive(item.quantity) && positive(item.unitPrice))
    && positive(quote.spotRate) && positive(quote.pricingRate) && quote.pricingRevision;
  if (!ok) throw createError('报价信息不完整：需客户、门店、数量、单价和汇率后才能发送', 400);
};

const isTerminal = (status) => (TRANSITIONS[status] || []).length === 0;
const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

/** Returns the extra fields the transition writes; throws 400 for a refused pair or a failed guard. */
const planTransition = (quote, to, now = new Date()) => {
  const from = quote.status;
  if (!canTransition(from, to)) throw createError(NOT_ALLOWED, 400);
  if (to === QUOTE_STATUS.SENT || to === QUOTE_STATUS.CONVERTED) assertSendable(quote);
  if (to === QUOTE_STATUS.SENT) return { sentAt: now };
  if (to === QUOTE_STATUS.DRAFT) return { sentAt: null };
  if (to === QUOTE_STATUS.ACCEPTED) return { acceptedAt: now };
  return {};
};

module.exports = { QUOTE_STATUS, NOT_ALLOWED, TRANSITIONS, assertSendable, canTransition, isTerminal, planTransition };
