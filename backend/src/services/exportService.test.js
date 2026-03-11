/**
 * Input: exportService 模块
 * Output: 模块导出冒烟测试
 * Pos: 自动补齐基础测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { exportSalesContractExcel } = require('./exportService');

test('exportService: 模块可正常加载并导出', () => {
  const mod = require('./exportService');
  assert.ok(mod !== undefined);
});

test('exportSalesContractExcel: 合同不存在时抛出404业务错误', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;

  prisma.salesContract.findUnique = async () => null;

  try {
    await assert.rejects(
      () => exportSalesContractExcel('not-found-id'),
      (error) => error.statusCode === 404 && /合同不存在/.test(error.message),
    );
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});

test('exportSalesContractExcel: 附带税务测算 sheet', async () => {
  const originalFindUnique = prisma.salesContract.findUnique;

  prisma.salesContract.findUnique = async () => ({
    id: 'contract-id',
    contractNo: 'EXP-0010',
    status: 'CONFIRMED',
    exchangeRate: 7.2,
    totalAmount: 190,
    receivedAmount: 0,
    totalBoxes: 2,
    grossWeight: 10,
    netWeight: 9,
    volume: 1.1,
    shippedAt: null,
    estimatedArrival: null,
    customsBroker: 'ABC',
    isFumigated: false,
    hasTaxRefund: true,
    note: 'demo',
    port: { name: 'Los Angeles' },
    items: [
      {
        quantity: 10,
        unit: '箱',
        costPrice: 80,
        sellingPrice: 15,
        note: 'fruit',
        specification: '80#',
        product: {
          customsName: '苹果',
          hsCode: '0808100000',
          declaration: '鲜苹果|未制果汁',
          specification: '80#',
          unit: '箱',
        },
        store: { name: 'Store A' },
      },
    ],
    packingItems: [
      {
        quantity: 10,
        unit: '箱',
        boxes: 2,
        unitPrice: 15,
        totalPrice: 150,
        grossWeight: 10,
        netWeight: 9,
        volume: 1.1,
        note: '',
        product: {
          customsName: '苹果',
          hsCode: '0808100000',
          declaration: '鲜苹果|未制果汁',
          unit: '箱',
        },
        store: { name: 'Store A' },
      },
    ],
  });

  try {
    const result = await exportSalesContractExcel('contract-id');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(result.buffer);

    assert.deepEqual(
      workbook.worksheets.map((sheet) => sheet.name),
      ['合同信息', '商品明细', '装箱清单', '税务测算'],
    );
    const taxSheet = workbook.getWorksheet('税务测算');
    assert.equal(taxSheet.getCell('A2').value, '合同编号');
    assert.equal(taxSheet.getCell('B2').value, 'EXP-0010');
    assert.equal(taxSheet.getCell('A6').value, '预计退税额(CNY)');
    assert.equal(taxSheet.getCell('B6').value, 86.02);
    assert.equal(taxSheet.getCell('A9').value, '苹果');
    assert.equal(taxSheet.getCell('B9').value, '0808100000');
  } finally {
    prisma.salesContract.findUnique = originalFindUnique;
  }
});
