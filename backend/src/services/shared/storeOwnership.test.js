const test = require('node:test');
const assert = require('node:assert/strict');
const { assertStoresOwnedBy } = require('./storeOwnership');

const db = (stores) => ({ store: { findMany: async ({ where }) => stores.filter((store) => where.id.in.includes(store.id)) } });

test('评审 R1-3：门店必须属于所选客户；未关联客户的旧门店放行；不存在的门店拒绝', async () => {
  const stores = [{ id: 'a1', customerId: 'A' }, { id: 'b1', customerId: 'B' }, { id: 'legacy', customerId: null }];
  assert.equal((await assertStoresOwnedBy(db(stores), ['a1', 'a1', 'legacy', null], 'A')).length, 2);
  await assert.rejects(assertStoresOwnedBy(db(stores), ['a1', 'b1'], 'A'), (error) => error.statusCode === 400 && /不属于所选客户/.test(error.message));
  await assert.rejects(assertStoresOwnedBy(db(stores), ['missing'], 'A'), /已不存在/);
  assert.deepEqual(await assertStoresOwnedBy(db(stores), [], 'A'), []);
});
