/**
 * Input: 采购明细生产规格、箱数、总毛净重、总体积与可选箱体尺寸
 * Output: 生产资料完整性、汇总指标和持久化输入校验测试
 * Pos: 采购生产资料 Module 契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  evaluatePurchaseProductionReadiness,
  normalizeProductionDetailInput,
  updatePurchaseProductionDetails,
} = require('./purchaseProductionService');

test('生产资料完整且无箱体尺寸时允许完工，并明确使用体积推算3D尺寸', () => {
  const result = evaluatePurchaseProductionReadiness([{
    id: 'pi-1',
    specification: '800×800mm，4片/箱',
    boxes: 120,
    grossWeight: 2400,
    netWeight: 2280,
    volume: 12.5,
    length: null,
    width: null,
    height: null,
  }]);

  assert.equal(result.ready, true);
  assert.equal(result.incompleteItemCount, 0);
  assert.equal(result.estimatedDimensionItemCount, 1);
  assert.deepEqual(result.totals, {
    boxes: 120,
    grossWeight: 2400,
    netWeight: 2280,
    volume: 12.5,
  });
});

test('缺规格、箱数、重量或体积时禁止确认生产完成并返回逐行缺项', () => {
  const result = evaluatePurchaseProductionReadiness([{
    id: 'pi-2',
    specification: ' ',
    boxes: 0,
    grossWeight: null,
    netWeight: 0,
    volume: null,
  }]);

  assert.equal(result.ready, false);
  assert.equal(result.incompleteItemCount, 1);
  assert.deepEqual(result.items[0].issues.map((issue) => issue.code), [
    'MISSING_SPECIFICATION',
    'MISSING_BOXES',
    'MISSING_GROSS_WEIGHT',
    'MISSING_NET_WEIGHT',
    'MISSING_VOLUME',
  ]);
});

test('只填写部分箱体尺寸或净重大于毛重时禁止确认完工', () => {
  const result = evaluatePurchaseProductionReadiness([{
    id: 'pi-3',
    specification: '标准箱',
    boxes: 10,
    grossWeight: 100,
    netWeight: 110,
    volume: 1.2,
    length: 500,
    width: 400,
    height: null,
  }]);

  assert.equal(result.ready, false);
  assert.deepEqual(result.items[0].issues.map((issue) => issue.code), [
    'NET_WEIGHT_EXCEEDS_GROSS',
    'INCOMPLETE_DIMENSIONS',
  ]);
});

test('生产资料输入只接受非负数字、整数箱数和成套尺寸', () => {
  assert.deepEqual(normalizeProductionDetailInput({
    id: 'pi-4',
    specification: '  510*510*810  ',
    boxes: '8',
    grossWeight: '80.5',
    netWeight: '75',
    volume: '0.86',
    length: '510',
    width: '510',
    height: '810',
  }), {
    id: 'pi-4',
    specification: '510*510*810',
    boxes: 8,
    grossWeight: 80.5,
    netWeight: 75,
    volume: 0.86,
    length: 510,
    width: 510,
    height: 810,
  });

  assert.throws(
    () => normalizeProductionDetailInput({ id: 'pi-5', boxes: 1.5 }),
    /箱数必须为非负整数/,
  );
  assert.throws(
    () => normalizeProductionDetailInput({ id: 'pi-5', grossWeight: -1 }),
    /毛重不能为负数/,
  );
});

test('批量保存只更新当前合同的采购明细并返回刷新后的合同', async () => {
  const updates = [];
  const refreshed = { id: 'pc-1', items: [{ id: 'pi-1', boxes: 8 }] };
  const tx = {
    purchaseContract: {
      findUnique: async (args) => (
        args.select
          ? { id: 'pc-1', items: [{ id: 'pi-1' }] }
          : refreshed
      ),
    },
    purchaseItem: {
      update: async (args) => {
        updates.push(args);
        return args.data;
      },
    },
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };

  const result = await updatePurchaseProductionDetails('pc-1', [{
    id: 'pi-1',
    specification: '标准箱',
    boxes: 8,
    grossWeight: 80,
    netWeight: 75,
    volume: 0.86,
  }], prismaClient);

  assert.equal(result, refreshed);
  assert.deepEqual(updates, [{
    where: { id: 'pi-1' },
    data: {
      specification: '标准箱',
      boxes: 8,
      grossWeight: 80,
      netWeight: 75,
      volume: 0.86,
      length: null,
      width: null,
      height: null,
    },
  }]);

  await assert.rejects(
    () => updatePurchaseProductionDetails('pc-1', [{ id: 'pi-other', boxes: 1 }], prismaClient),
    /不属于当前合同/,
  );
});
