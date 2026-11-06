/**
 * Input: taxRefundDraftService、prisma
 * Output: 自动生成退税草稿测试
 * Pos: 后端服务层测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const prisma = require('../utils/prisma');
const taxRefundDraftService = require('./taxRefundDraftService');

const withMockDelegates = async (mockMap, callback) => {
  const originals = new Map();

  Object.entries(mockMap).forEach(([key, value]) => {
    originals.set(key, prisma[key]);
    prisma[key] = value;
  });

  try {
    await callback();
  } finally {
    originals.forEach((value, key) => {
      if (typeof value === 'undefined') {
        delete prisma[key];
      } else {
        prisma[key] = value;
      }
    });
  }
};

const pack = (over = {}) => ({
  isOwnedByJiesong: true,
  purchaseCost: 11300,
  purchaseItem: { purchaseContract: { taxRate: 13 } },
  ...over,
});

const decl = (over = {}) => ({
  id: 'cd-1',
  declarationNo: 'CUS-2026-001',
  salesContractId: 'sc-1',
  totalAmount: 1600,
  items: [{ id: 'i1', hsCode: '6904100000', totalPrice: 1600, packingItem: pack() }],
  ...over,
});

const hsMock = (map) => ({
  findFirst: async ({ where }) => map[where.hsCode] || null,
});

const harness = (overrides = {}) => {
  const state = { created: [], updated: [], refunds: [], findWhere: null };
  const mocks = {
    customsDeclaration: { findMany: async ({ where }) => { state.findWhere = where; return [decl()]; } },
    taxRefund: {
      findFirst: async () => null,
      findMany: async ({ where }) => state.refunds.filter((r) => r.refundNo.startsWith(where.refundNo.startsWith)),
      create: async ({ data }) => { state.created.push(data); state.refunds.push(data); return { id: `tr-${state.created.length}`, ...data }; },
      updateMany: async (args) => { state.updated.push(args); return { count: 1 }; },
    },
    hsCode: hsMock({ 6904100000: { hsCode: '6904100000', refundRate: 9, taxRate: 35, vatRate: 13 } }),
    forexVerification: { findFirst: async () => ({ id: 'fv-1' }) },
    $transaction: async (cb) => cb(prisma),
    ...overrides,
  };
  return { state, mocks };
};

test('refundable = CNY 含税采购成本 / (1+进项税率) × 退税率，不用美元 FOB', async () => {
  const { state, mocks } = harness();
  await withMockDelegates(mocks, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({ customsDeclarationId: 'cd-1' });
    assert.equal(result.created, 1);
    assert.deepEqual(state.findWhere.status, { not: 'VOID' });
    assert.equal(state.created[0].refundableAmount, 900); // 11300/1.13*9%
    assert.equal(state.created[0].declaredAmount, 1600);
    assert.equal(state.created[0].forexVerificationId, 'fv-1');
    assert.equal(state.created[0].status, 'DRAFT');
    assert.match(state.created[0].refundNo, /^TR-AUTO-\d{8}-001$/);
  });
});

test('refundRate 为 null 时不回退进口关税率，且无采购关联时基数为 0 并标注', async () => {
  const { state, mocks } = harness({
    hsCode: hsMock({ 6904100000: { hsCode: '6904100000', refundRate: null, taxRate: 35 } }),
  });
  await withMockDelegates(mocks, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({});
    assert.equal(result.created, 0);
    assert.equal(result.items[0].reason, 'no_rate_data');
    assert.equal(state.created.length, 0);
  });

  const legacy = harness({
    customsDeclaration: { findMany: async () => [decl({ items: [{ id: 'i1', hsCode: '6904100000', totalPrice: 1600, packingItem: null }] })] },
  });
  await withMockDelegates(legacy.mocks, async () => {
    await taxRefundDraftService.generateTaxRefundDrafts({});
    assert.equal(legacy.state.created[0].refundableAmount, 0);
    assert.match(legacy.state.created[0].note, /UNVERIFIED_PURCHASE_BASIS/);
  });
});

test('已有记录默认跳过', async () => {
  const { mocks } = harness({
    taxRefund: { findFirst: async () => ({ id: 'tr-x', status: 'REFUNDED' }), create: async () => { throw new Error('no'); } },
  });
  await withMockDelegates(mocks, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({});
    assert.equal(result.skipped, 1);
    assert.equal(result.items[0].reason, 'existing_refund');
  });
});

test('replaceExisting 遇非 DRAFT 返回 409 且不写入', async () => {
  for (const status of ['APPLIED', 'APPROVED', 'REFUNDED']) {
    const { state, mocks } = harness({
      taxRefund: {
        findFirst: async () => ({ id: 'tr-x', status }),
        updateMany: async () => { throw new Error('no write'); },
        create: async () => { throw new Error('no write'); },
        delete: async () => { throw new Error('no delete'); },
      },
    });
    await withMockDelegates(mocks, async () => {
      await assert.rejects(
        taxRefundDraftService.generateTaxRefundDrafts({ replaceExisting: true }),
        (e) => e.statusCode === 409,
      );
      assert.equal(state.created.length, 0);
    });
  }
});

test('replaceExisting 对 DRAFT 原位更新，保留 id 与 refundNo', async () => {
  const { state, mocks } = harness();
  mocks.taxRefund.findFirst = async () => ({ id: 'tr-d', refundNo: 'TR-AUTO-X-001', status: 'DRAFT' });
  await withMockDelegates(mocks, async () => {
    const result = await taxRefundDraftService.generateTaxRefundDrafts({ replaceExisting: true });
    assert.equal(result.items[0].refundId, 'tr-d');
    assert.equal(state.created.length, 0);
    assert.deepEqual(state.updated[0].where, { id: 'tr-d', status: 'DRAFT' });
    assert.equal(state.updated[0].data.refundableAmount, 900);
    assert.equal('refundNo' in state.updated[0].data, false);
  });
});

test('同日连续调用与同批多单不撞 refundNo', async () => {
  const { state, mocks } = harness({
    customsDeclaration: { findMany: async () => [decl(), decl({ id: 'cd-2', declarationNo: 'CUS-2' })] },
  });
  await withMockDelegates(mocks, async () => {
    await taxRefundDraftService.generateTaxRefundDrafts({});
    await taxRefundDraftService.generateTaxRefundDrafts({});
    const nos = state.created.map((c) => c.refundNo.slice(-3));
    assert.equal(new Set(nos).size, 4);
  });
});
