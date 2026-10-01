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
  items: [{
    id: 'pi-1',
    specification: '标准箱',
    boxes: 1,
    grossWeight: 1000,
    netWeight: 950,
    volume: 60,
    length: 1000,
    width: 1000,
    height: 1000,
  }],
  files: [{ id: 'cf-1', fileName: '盖章合同.pdf', category: 'SIGNED_CONTRACT' }],
};

test('历史补录付款未核验时不把默认零值当成未付定金', () => {
  for (const note of ['付款待核验', '付款未核验', '付款记录尚未核验', '付款记录未核验']) {
    const purchase = { ...basePurchase, paidAmount: 0, note };
    const workflow = buildTradeWorkflow(baseSales, new Map([[purchase.contractNo, purchase]]));
    const payment = workflow.stages.find(s => s.key === 'payment');
    assert.match(payment.reason, /付款.*待核验/);
    assert(!payment.reason.includes('待付'));
    assert.equal(payment.action.label, '核验采购付款');
    assert.equal(payment.action.href, '/dashboard/purchase/pc-1');
    assert.match(workflow.stages.find(s => s.key === 'finance').reason, /付款待核验/);
    const verified = buildTradeWorkflow(baseSales, new Map([[purchase.contractNo, { ...purchase, paidAmount: 5000 }]]));
    assert.equal(verified.stages.find(s => s.key === 'payment').status, 'completed');
  }
});

test('已发运不再受发运前排柜门槛阻塞，缺失采购资料仍需补录', () => {
  for (const packingItems of [[], [{ ...baseSales.packingItems[0], length: 13000 }]]) {
    const result = buildTradeWorkflow({ ...baseSales, status: 'SHIPPED', grossWeight: 23000, packingItems });
    assert.equal(result.stages.find(s => s.key === 'loading').status, 'completed');
    assert.equal(result.stages.find(s => s.key === 'procurement').status, 'current');
    assert.match(result.stages.find(s => s.key === 'procurement').reason, /已发运，待补录/);
    assert(!result.issues.some(issue => issue.includes('仍有')));
    const before = buildTradeWorkflow({ ...baseSales, status: 'PACKING', grossWeight: 23000, packingItems });
    assert.equal(before.stages.find(s => s.key === 'loading').status, 'blocked');
  }
});

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

test('历史状态已完成但缺箱规资料时生产阶段不得伪装完成', () => {
  const workflow = buildTradeWorkflow(
    baseSales,
    new Map([[basePurchase.contractNo, { ...basePurchase, items: [{ id: 'pi-1' }] }]]),
  );

  const production = workflow.stages.find((stage) => stage.key === 'production');
  assert.equal(production.status, 'current');
  assert.match(production.reason, /生产完成状态.*仍缺失/);
  assert.equal(production.action.label, '补齐生产资料');
  assert.ok(workflow.issues.includes('采购生产状态已完成，但装柜输入资料不完整'));
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

test('仅空白发票号不能完成供应商发票阶段，发票原件仍为选填', () => {
  const purchaseMap = new Map([['PO260001', {
    ...basePurchase,
    contractNo: 'PO260001',
    invoiceNo: '  ， ; ',
    files: [{ category: 'SUPPLIER_INVOICE', fileName: '发票.pdf' }],
  }]]);
  const workflow = buildTradeWorkflow({
    ...baseSales,
    status: 'SHIPPED',
    packingItems: [{ ...baseSales.packingItems[0], purchaseContractNo: 'PO260001', invoiceNo: null }],
  }, purchaseMap);

  const invoice = workflow.stages.find((stage) => stage.key === 'invoice');
  assert.equal(invoice.status, 'current');
  assert.match(invoice.reason, /发票号码未登记/);
});

test('仅上传任意 PDF 不能伪装完成出口单证，必须有持久化核对结论', () => {
  const workflow = buildTradeWorkflow({
    ...baseSales,
    files: [{ id: 'pdf-1', fileName: 'other.pdf', category: 'OTHER' }],
    customsDeclarations: [{ id: 'cd-1', status: 'DRAFT' }],
    packingListChecks: [],
  }, new Map([[basePurchase.contractNo, { ...basePurchase, paidAmount: 5000 }]]));

  const documents = workflow.stages.find((stage) => stage.key === 'documents');
  assert.equal(documents.status, 'current');
  assert.match(documents.reason, /船司装箱单核对/);
});

test('最新船司核对通过且已有报关记录时出口单证阶段完成', () => {
  const workflow = buildTradeWorkflow({
    ...baseSales,
    customsDeclarations: [{ id: 'cd-1', status: 'DRAFT' }],
    packingListChecks: [{
      id: 'check-1',
      status: 'PASSED',
      checkedAt: new Date('2026-07-10T00:00:00.000Z'),
      file: { id: 'carrier-1', category: 'CARRIER_DOCUMENT', fileName: 'packing-list.pdf' },
    }],
  }, new Map([[basePurchase.contractNo, { ...basePurchase, paidAmount: 5000 }]]));

  const documents = workflow.stages.find((stage) => stage.key === 'documents');
  assert.equal(documents.status, 'completed');
  assert.match(documents.reason, /核对已通过/);
});

test('较新的差异记录覆盖旧通过记录，出口单证重新变为待处理', () => {
  const workflow = buildTradeWorkflow({
    ...baseSales,
    customsDeclarations: [{ id: 'cd-1', status: 'DRAFT' }],
    packingListChecks: [
      { id: 'check-old', status: 'PASSED', checkedAt: new Date('2026-07-09T00:00:00.000Z') },
      { id: 'check-new', status: 'DIFFERENCE', checkedAt: new Date('2026-07-10T00:00:00.000Z') },
    ],
  }, new Map([[basePurchase.contractNo, { ...basePurchase, paidAmount: 5000 }]]));

  const documents = workflow.stages.find((stage) => stage.key === 'documents');
  assert.equal(documents.status, 'current');
  assert.match(documents.reason, /存在差异/);
});

test('采购备注不是丢失合同；已有合同仍需明确采购明细分配', () => {
  for (const reference of ['另采', '乙方合同']) {
    const workflow = buildTradeWorkflow({ ...baseSales, packingItems: [{ ...baseSales.packingItems[0], purchaseContractNo: reference }] });
    assert.match(workflow.stages[0].reason, /采购引用填写为备注/);
  }
  const combined = buildTradeWorkflow({ ...baseSales, packingItems: [{ ...baseSales.packingItems[0], purchaseContractNo: 'CG2500033，71' }] });
  assert.match(combined.stages[0].reason, /多个采购合同号混写/);
  assert(!combined.stages[0].reason.includes('找不到'));
  const memo = buildTradeWorkflow({ ...baseSales, packingItems: [{ ...baseSales.packingItems[0], purchaseContractNo: '单独购买' }] });
  assert.match(memo.stages[0].reason, /采购引用填写为备注/);
  assert(!memo.stages[0].reason.includes('找不到购销合同'));
  const map = new Map([[basePurchase.contractNo, basePurchase]]);
  const unassigned = buildTradeWorkflow(baseSales, map);
  assert(unassigned.issues.includes('采购明细待分配：CG260001'));
  const assigned = buildTradeWorkflow({ ...baseSales, packingItems: [{ ...baseSales.packingItems[0], purchaseItemId: 'pi-1' }] }, map);
  assert(!assigned.issues.some(x => x.startsWith('采购明细待分配')));
});

test('待处理/阻塞/风险范围从全量合同筛选后限量，避免先取最近6笔漏历史风险', async () => {
  const prisma = require('../utils/prisma');
  const { listTradeWorkflows } = require('./tradeWorkflowService');
  const originalSales = prisma.salesContract.findMany;
  const originalPurchase = prisma.purchaseContract.findMany;
  const calls = [];
  prisma.salesContract.findMany = async (args) => {
    calls.push(args);
    return [{ ...baseSales, id: 'older-risk', grossWeight: 23000 }, { ...baseSales, id: 'newer', status: 'SHIPPED', packingItems: [] }];
  };
  prisma.purchaseContract.findMany = async () => [basePurchase];
  try {
    const risk = await listTradeWorkflows({ limit: 1, scope: 'risk' });
    assert.equal(calls[0].take, undefined); assert.equal(risk[0].id, 'older-risk');
    const blocked = await listTradeWorkflows({ limit: 1, scope: 'blocked' });
    assert.ok(blocked[0].stages.some((stage) => stage.status === 'blocked'));
    const pending = await listTradeWorkflows({ limit: 1, scope: 'pending' });
    assert.ok(pending[0].completedStageCount < pending[0].stageCount);
    await listTradeWorkflows({ limit: 6, scope: 'recent' });
    assert.equal(calls.at(-1).take, 6);
  } finally { prisma.salesContract.findMany = originalSales; prisma.purchaseContract.findMany = originalPurchase; }
});
