const test = require('node:test');
const assert = require('node:assert/strict');
const { QUOTE_STATUS, TRANSITIONS, canTransition, isTerminal, planTransition } = require('./quoteStateMachine');

const good = {
  status: 'DRAFT', customerId: 'c1', spotRate: 6.72, pricingRate: 6.52, pricingRevision: 'r',
  items: [{ storeId: 's1', quantity: 2, unitPrice: 10 }],
};
const NOW = new Date('2026-10-31T00:00:00Z');
const all = Object.keys(QUOTE_STATUS);

test('every ordered pair is allowed or refused exactly as the transition table says', () => {
  const allowed = new Set(['DRAFT>SENT', 'DRAFT>CANCELLED', 'SENT>DRAFT', 'SENT>ACCEPTED', 'SENT>REJECTED', 'SENT>CANCELLED',
    'ACCEPTED>CONVERTED', 'ACCEPTED>CANCELLED']);
  for (const from of all) for (const to of all) {
    assert.equal(canTransition(from, to), allowed.has(`${from}>${to}`), `${from}>${to}`);
    if (!allowed.has(`${from}>${to}`)) {
      assert.throws(() => planTransition({ ...good, status: from }, to), { statusCode: 400, message: '报价状态不允许此操作' }, `${from}>${to}`);
    }
  }
  assert.deepEqual(all.filter(isTerminal).sort(), ['CANCELLED', 'CONVERTED', 'REJECTED']);
  assert.deepEqual(Object.keys(TRANSITIONS).sort(), all.sort());
});

test('side effects: sentAt on send, cleared on reopen, acceptedAt on accept', () => {
  assert.deepEqual(planTransition(good, 'SENT', NOW), { sentAt: NOW });
  assert.deepEqual(planTransition({ ...good, status: 'SENT' }, 'DRAFT', NOW), { sentAt: null });
  assert.deepEqual(planTransition({ ...good, status: 'SENT' }, 'ACCEPTED', NOW), { acceptedAt: NOW });
  assert.deepEqual(planTransition({ ...good, status: 'SENT' }, 'REJECTED', NOW), {});
  assert.deepEqual(planTransition({ ...good, status: 'ACCEPTED' }, 'CONVERTED', NOW), {});
});

test('DRAFT→SENT guard needs customer, items, store, quantity, price and rates', () => {
  const bad = [
    { customerId: null }, { items: [] },
    { items: [{ storeId: null, quantity: 1, unitPrice: 5 }] },
    { items: [{ storeId: 's', quantity: 0, unitPrice: 5 }] },
    { items: [{ storeId: 's', quantity: 1, unitPrice: 0 }] },
    { spotRate: null }, { pricingRate: null }, { pricingRevision: null },
  ];
  for (const patch of bad) assert.throws(() => planTransition({ ...good, ...patch }, 'SENT'), { statusCode: 400 }, JSON.stringify(patch));
});

test('convert re-checks the send guards; cancelling needs no guard', () => {
  assert.throws(() => planTransition({ ...good, status: 'ACCEPTED', items: [] }, 'CONVERTED'), { statusCode: 400 });
  assert.deepEqual(planTransition({ ...good, status: 'DRAFT', items: [] }, 'CANCELLED', NOW), {});
});
