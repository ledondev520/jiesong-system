/**
 * Input: packingListCheckService（逐商品比对、PDF 归档、历史记录与人工结论）
 * Output: 船司装箱单持久化核对回归测试
 * Pos: 出口装箱单核对 Module 测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildComparison,
  checkPackingListPdf,
  listPackingListChecks,
  reviewPackingListCheck,
  _internal,
} = require('./packingListCheckService');

const SAMPLE_CONTRACT = {
  contractNo: 'EXP-2026-001',
  totalBoxes: 850,
  grossWeight: 18500,
  netWeight: 17200,
  volume: 62.5,
  packingItems: [
    { id: 'pk-1', productId: 'p-1', boxes: 500, quantity: 5000, product: { customsName: '陶瓷杯', hsCode: '6911101900' } },
    { id: 'pk-2', productId: 'p-2', boxes: 350, quantity: 2800, product: { customsName: '玻璃碗', hsCode: '7013490000' } },
  ],
};

test('extractNumbers: 提取含千分位与小数的数值', () => {
  const numbers = _internal.extractNumbers('G.W. 18,500.00 KGS  CBM 62.5  850 CTNS');
  assert.deepEqual(numbers, [18500, 62.5, 850]);
});

test('matchNumber: 容差内匹配返回最接近值', () => {
  const result = _internal.matchNumber([18492, 100], 18500, 1, 0.005);
  assert.equal(result.matched, true); // 0.5% 容差 = 92.5 > 8
  assert.equal(result.closest, 18492);
});

test('buildComparison: 数据一致时全部匹配', () => {
  const pdfText = `
    PACKING LIST
    Invoice No.: EXP-2026-001
    TOTAL: 850 CTNS
    G.W.: 18,500.00 KGS   N.W.: 17,200.00 KGS
    MEAS: 62.50 CBM
    陶瓷杯 6911101900  500 CTNS  5,000 PCS
    玻璃碗 7013490000  350 CTNS  2,800 PCS
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  assert.equal(result.summary.ok, true);
  assert.equal(result.summary.fieldMismatched, 0);
  assert.equal(result.summary.itemCheckMismatched, 0);
  assert.equal(result.items[0].identity.matched, true);
  const contractNoField = result.fields.find((f) => f.key === 'contractNo');
  assert.equal(contractNoField.matched, true);
});

test('buildComparison: 毛重不一致时标记差异', () => {
  const pdfText = `
    PACKING LIST for EXP-2026-001
    850 CTNS  G.W. 17,300 KGS  N.W. 17,200 KGS  62.5 CBM
    陶瓷杯 6911101900 500 / 5000   玻璃碗 7013490000 350 / 2800
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  assert.equal(result.summary.ok, false);
  const grossField = result.fields.find((f) => f.key === 'grossWeight');
  assert.equal(grossField.matched, false);
  assert.equal(grossField.closest, 17300);
});

test('buildComparison: 合同号缺失与明细数量差异均警示', () => {
  const pdfText = `
    PACKING LIST (no contract number here)
    850 CTNS 18,500 KGS 17,200 KGS 62.5 CBM
    陶瓷杯 6911101900 500 CTNS 5,000 PCS
    玻璃碗 7013490000 350 CTNS 2,750 PCS
  `;
  const result = buildComparison(SAMPLE_CONTRACT, pdfText);

  const contractNoField = result.fields.find((f) => f.key === 'contractNo');
  assert.equal(contractNoField.matched, false);

  const bowlRow = result.items.find((i) => i.productName === '玻璃碗');
  assert.equal(bowlRow.quantity.matched, false);
  assert.equal(result.summary.itemCheckMismatched, 1);
});

test('buildComparison: 商品身份未命中时不拿全局重复数字伪造该行匹配', () => {
  const result = buildComparison(SAMPLE_CONTRACT, `
    PACKING LIST EXP-2026-001
    850 CTNS 18,500 KGS 17,200 KGS 62.5 CBM
    陶瓷杯 6911101900 500 CTNS 5,000 PCS
    OTHER CARGO 350 CTNS 2,800 PCS
  `);

  const bowlRow = result.items.find((item) => item.productName === '玻璃碗');
  assert.equal(bowlRow.identity.matched, false);
  assert.equal(bowlRow.boxes.matched, null);
  assert.equal(bowlRow.quantity.matched, null);
  assert.equal(result.summary.itemCheckMismatched, 1);
  assert.equal(result.summary.ok, false);
});

test('buildComparison: 系统未录入的指标跳过比对（matched=null）', () => {
  const contract = { ...SAMPLE_CONTRACT, netWeight: 0, volume: null };
  const result = buildComparison(contract, 'EXP-2026-001 850 18500');
  const netField = result.fields.find((f) => f.key === 'netWeight');
  const volumeField = result.fields.find((f) => f.key === 'volume');
  assert.equal(netField.matched, null);
  assert.equal(volumeField.matched, null);
});

test('checkPackingListPdf: 自动比对后归档原 PDF 并持久化逐项差异', async () => {
  let archivedArgs = null;
  let createdData = null;
  const prismaClient = {
    salesContract: { findUnique: async () => SAMPLE_CONTRACT },
    packingListCheck: {
      create: async ({ data }) => {
        createdData = data;
        return {
          id: 'check-1',
          checkedAt: new Date('2026-07-10T00:00:00.000Z'),
          reviewedAt: null,
          reviewNote: null,
          reviewedBy: null,
          checkedBy: { id: 'user-1', name: '复核员' },
          file: { id: 'file-1', fileName: 'carrier.pdf', uploadedAt: new Date('2026-07-10T00:00:00.000Z') },
          ...data,
        };
      },
    },
  };

  const result = await checkPackingListPdf('sales-1', {
    buffer: Buffer.from('%PDF-demo'),
    originalname: 'carrier.pdf',
    mimetype: 'application/pdf',
  }, {
    checkedById: 'user-1',
    prismaClient,
    extractText: async () => `
      EXP-2026-001 850 18,500 17,200 62.5
      陶瓷杯 6911101900 500 5,000
      玻璃碗 7013490000 350 2,800
    `,
    archiveFile: async (args) => {
      archivedArgs = args;
      return { id: 'file-1', fileName: 'carrier.pdf' };
    },
  });

  assert.equal(archivedArgs.category, 'CARRIER_DOCUMENT');
  assert.equal(createdData.salesContractFileId, 'file-1');
  assert.equal(createdData.automaticStatus, 'PASSED');
  assert.equal(createdData.status, 'PASSED');
  assert.equal(result.comparison.summary.ok, true);
  assert.equal(result.file.fileName, 'carrier.pdf');
});

test('checkPackingListPdf: 图片型 PDF 仍归档并创建待人工核对记录', async () => {
  let createdData = null;
  const prismaClient = {
    salesContract: { findUnique: async () => SAMPLE_CONTRACT },
    packingListCheck: {
      create: async ({ data }) => {
        createdData = data;
        return { id: 'check-manual', file: { id: 'file-manual', fileName: 'scan.pdf' }, ...data };
      },
    },
  };

  const result = await checkPackingListPdf('sales-1', {
    buffer: Buffer.from('%PDF-scan'),
    originalname: 'scan.pdf',
    mimetype: 'application/pdf',
  }, {
    prismaClient,
    extractText: async () => 'scan',
    archiveFile: async () => ({ id: 'file-manual', fileName: 'scan.pdf' }),
  });

  assert.equal(createdData.status, 'NEEDS_MANUAL_REVIEW');
  assert.equal(result.comparison.summary.manualReviewRequired, true);
  assert.equal(result.comparison.fields.length, 0);
});

test('list/reviewPackingListChecks: 可读取历史并保存人工通过或驳回结论', async () => {
  let updateArgs = null;
  const stored = {
    id: 'check-1',
    salesContractId: 'sales-1',
    automaticStatus: 'DIFFERENCE',
    status: 'DIFFERENCE',
    summaryJson: JSON.stringify({ ok: false, fieldMismatched: 1 }),
    resultJson: JSON.stringify({ summary: { ok: false }, fields: [], items: [] }),
    file: { id: 'file-1', fileName: 'carrier.pdf' },
    checkedBy: { id: 'user-1', name: '核对员' },
    reviewedBy: null,
  };
  const prismaClient = {
    packingListCheck: {
      findMany: async () => [stored],
      findFirst: async () => stored,
      update: async (args) => {
        updateArgs = args;
        return { ...stored, ...args.data, reviewedBy: { id: 'reviewer-1', name: '复核人' } };
      },
    },
  };

  const history = await listPackingListChecks('sales-1', {}, prismaClient);
  assert.equal(history[0].comparison.summary.ok, false);

  const reviewed = await reviewPackingListCheck('sales-1', 'check-1', {
    decision: 'APPROVED',
    note: '已与船司复核原件',
    reviewedById: 'reviewer-1',
  }, prismaClient);
  assert.equal(updateArgs.data.status, 'APPROVED');
  assert.equal(updateArgs.data.reviewNote, '已与船司复核原件');
  assert.equal(reviewed.status, 'APPROVED');
});
