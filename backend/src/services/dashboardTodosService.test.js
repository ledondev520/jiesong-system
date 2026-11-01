const test = require('node:test');
const assert = require('node:assert/strict');
const { LISTS } = require('./dashboardTodosService');

test('missingInvoice: 已关联发票记录的合同即使 invoiceNo 为空也不列出', async () => {
  const contracts = [
    { id: 'matched', contractNo: 'PO-MATCHED', invoiceNo: '', totalAmount: 10, supplier: { name: 'S' } },
    { id: 'manual', contractNo: 'PO-MANUAL', invoiceNo: 'INV-1', totalAmount: 10, supplier: { name: 'S' } },
    { id: 'missing', contractNo: 'PO-MISSING', invoiceNo: '  ', totalAmount: 10, supplier: { name: 'S' } },
  ];
  let invoiceWhere;
  const db = {
    purchaseContract: { findMany: async () => contracts },
    invoiceRecord: {
      findMany: async ({ where }) => {
        invoiceWhere = where;
        return [{ matchedContractId: 'matched' }];
      },
    },
  };
  const result = await LISTS.missingInvoice.load(db);
  assert.deepEqual(result.items.map((i) => i.contractNo), ['PO-MISSING']);
  assert.equal(result.count, 1);
  assert.equal(invoiceWhere.matchStatus, 'MATCHED');
  assert.equal(invoiceWhere.matchedContractType, 'PURCHASE');
  assert.deepEqual(invoiceWhere.matchedContractId.in, ['matched', 'missing']);
});
