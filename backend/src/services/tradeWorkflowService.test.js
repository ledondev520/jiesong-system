/**
 * Input: 出口合同、关联采购合同与材料记录
 * Output: 单笔出口专项单的阶段、阻塞、下一动作和进度
 * Pos: 经营中台主线路契约测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTradeWorkflow } = require('./tradeWorkflowService');

const baseSales = {
  id: 'sc-1',
  contractNo: 'EXP260008',
  status: 'PACKING',
  totalAmount: 1000,
  receivedAmount: 0,
  exchangeRate: 6.64,
  grossWeight: 1000,
  volume: 60,
  shippedAt: null,
  packingItems: [{
    id: 'pk-1',
    productId: 'p-1',
    purchaseContractNo: 'CG260001',
    boxes: 1,
    quantity: 1,
    volume: 60,
    length: 1000,
    width: 1000,
    height: 1000,
    invoiceNo: null,
    product: { customsName: '酒架' },
  }],
  files: [],
  customsDeclarations: [],
  taxRefunds: [],
};

const basePurchase = {
  id: 'pc-1',
  contractNo: 'CG260001',
  status: 'READY',
  totalAmount: 5000,
  paidAmount: 1500,
  invoiceNo: null,
  files: [{ id: 'cf-1', fileName: '盖章合同.pdf', category: 'SIGNED_CONTRACT' }],
};

test('从采购合同号关联整笔专项单并给出最早下一动作', () => {
  const workflow = buildTradeWorkflow(baseSales, new Map([[basePurchase.contractNo, basePurchase]]));

  assert.deepEqual(workflow.purchaseContractNos, ['CG260001']);
  assert.equal(workflow.stages[0].status, 'completed');
  assert.equal(workflow.stages[1].key, 'payment');
  assert.equal(workflow.stages[1].status, 'current');
  assert.equal(workflow.nextAction.label, '登记采购尾款');
  assert.equal(workflow.nextAction.href, '/dashboard/purchase/pc-1');
});

test('未关联采购合同时明确阻塞而不是伪造完成线路', () => {
  const workflow = buildTradeWorkflow(
    { ...baseSales, packingItems: [{ ...baseSales.packingItems[0], purchaseContractNo: null }] },
    new Map(),
  );

  assert.equal(workflow.stages[0].status, 'blocked');
  assert.match(workflow.stages[0].reason, /未关联购销合同/);
  assert.equal(workflow.nextAction.label, '关联购销合同');
  assert.equal(workflow.nextAction.href, '/dashboard/sales/sc-1');
});

test('商业利用率达标但存在未装箱时装柜阶段保持阻塞', () => {
  const workflow = buildTradeWorkflow(
    {
      ...baseSales,
      packingItems: [{ ...baseSales.packingItems[0], length: 13000 }],
    },
    new Map([[basePurchase.contractNo, { ...basePurchase, paidAmount: 5000 }]]),
  );

  const loading = workflow.stages.find((stage) => stage.key === 'loading');
  assert.equal(loading.status, 'blocked');
  assert.match(loading.reason, /1 箱无法装入/);
});

test('发运后的内部退税准备日为次月5日', () => {
  const workflow = buildTradeWorkflow(
    { ...baseSales, status: 'SHIPPED', shippedAt: new Date('2026-07-03T00:00:00.000Z') },
    new Map([[basePurchase.contractNo, { ...basePurchase, paidAmount: 5000 }]]),
  );

  const taxStage = workflow.stages.find((stage) => stage.key === 'tax-refund');
  assert.equal(taxStage.prepareOn, '2026-08-05');
  assert.match(taxStage.reason, /内部准备提醒/);
});

test('已签约但未归档盖章件时采购阶段仍待办', () => {
  const workflow = buildTradeWorkflow(
    baseSales,
    new Map([[basePurchase.contractNo, { ...basePurchase, files: [] }]]),
  );

  const procurement = workflow.stages.find((stage) => stage.key === 'procurement');
  assert.equal(procurement.status, 'current');
  assert.match(procurement.reason, /盖章件/);
  assert.equal(procurement.action.label, '上传供应商盖章件');
});

test('历史 OTHER 分类的 Word/PDF 附件可作为签章存档兼容', () => {
  const workflow = buildTradeWorkflow(
    baseSales,
    new Map([[
      basePurchase.contractNo,
      { ...basePurchase, files: [{ fileName: '历史购销合同.docx', category: 'OTHER' }] },
    ]]),
  );

  assert.equal(workflow.stages.find((stage) => stage.key === 'procurement').status, 'completed');
});

test('PO/CG 合同号别名下的装箱明细发票号可正确结清', () => {
  const workflow = buildTradeWorkflow(
    {
      ...baseSales,
      status: 'SHIPPED',
      packingItems: [{
        ...baseSales.packingItems[0],
        purchaseContractNo: 'PO260001',
        invoiceNo: 'INV-260001',
      }],
    },
    new Map([[basePurchase.contractNo, basePurchase]]),
  );

  assert.equal(workflow.stages.find((stage) => stage.key === 'invoice').status, 'completed');
});
