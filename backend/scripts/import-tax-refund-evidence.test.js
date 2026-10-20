/**
 * Input: 人工构造的出口、进货和受理通知书结构化文档
 * Output: 出口退税证据交叉校验与文件筛选契约测试
 * Pos: import-tax-refund-evidence Adapter 的纯函数测试
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const { validateTaxRefundEvidence } = require('./import-tax-refund-evidence');

const tableDocument = (category, header, rows) => ({
  category,
  redactionCount: 0,
  sheets: [{ rows: [header, ...rows].map((values, index) => ({ sourceRow: index + 1, valuesJson: JSON.stringify(values) })) }],
});

const noticeDocument = (month, batch, amount) => ({
  category: 'TAX_REFUND_ACCEPTANCE_NOTICE',
  redactionCount: 0,
  sheets: [{ rows: [{ sourceRow: 1, valuesJson: JSON.stringify([`申报年月:${month} 申报批次:${batch} 申报退税额:${amount}元`]) }] }],
});

function validDocuments() {
  const exportHeader = ['申报年月', '申报批次', '序号', '关联号', '退税额'];
  const purchaseHeader = ['申报年月', '申报批次', '序号', '关联号', '可退税额'];
  const batches = [
    ['202407', '001', '00000001', 'A', 1.23],
    ['202408', '001', '00000001', 'B', 2.34],
    ['202409', '001', '00000001', 'C', 3.45],
    ['202410', '001', '00000001', 'D', 4.56],
    ['202411', '001', '00000001', 'E', 5.67],
    ['202512', '001', '00000001', 'F', 6.78],
    ['202512', '002', '00000001', 'G', 7.89],
    ['202512', '003', '00000001', 'H', 8.90],
    ['202605', '001', '00000001', 'I', 9.01],
    ['202606', '001', '00000001', 'J', 10.12],
  ];
  return [
    tableDocument('TAX_REFUND_EXPORT_DETAIL', exportHeader, batches.slice(0, 4)),
    tableDocument('TAX_REFUND_EXPORT_DETAIL', exportHeader, batches.slice(4, 8)),
    tableDocument('TAX_REFUND_EXPORT_DETAIL', exportHeader, batches.slice(8)),
    tableDocument('TAX_REFUND_PURCHASE_DETAIL', purchaseHeader, batches.slice(0, 4)),
    tableDocument('TAX_REFUND_PURCHASE_DETAIL', purchaseHeader, batches.slice(4, 8)),
    tableDocument('TAX_REFUND_PURCHASE_DETAIL', purchaseHeader, batches.slice(8)),
    ...batches.map(([month, batch, , , amount]) => noticeDocument(month, batch, amount)),
  ];
}

test('validateTaxRefundEvidence: 三类资料完整一致时通过', () => {
  const result = validateTaxRefundEvidence(validDocuments());
  assert.equal(result.documentCount, 16);
  assert.equal(result.exportRows, 10);
  assert.equal(result.purchaseRows, 10);
  assert.equal(result.declarationBatches, 10);
  assert.equal(result.acceptanceNotices, 10);
});

test('validateTaxRefundEvidence: 缺少明细对应批次时拒绝写库', () => {
  const documents = validDocuments();
  documents[2].sheets[0].rows.pop();
  documents[5].sheets[0].rows.pop();
  assert.throws(() => validateTaxRefundEvidence(documents), /无对应申报明细/);
});

test('validateTaxRefundEvidence: 出口与进货退税额不一致时拒绝写库', () => {
  const documents = validDocuments();
  documents[3].sheets[0].rows[1].valuesJson = JSON.stringify(['202407', '001', '00000001', 'A', 9.99]);
  assert.throws(() => validateTaxRefundEvidence(documents), /退税额.*不一致/);
});
