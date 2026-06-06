/**
 * Input: purchaseImportExportService
 * Output: 导入导出功能验证
 * Pos: 采购合同导入导出服务测试
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const {
  exportPurchasesExcel,
  importPurchasesExcel,
} = require('./purchaseImportExportService');
const prisma = require('../utils/prisma');

test('exportPurchasesExcel: 空数据返回合法 Buffer 和文件名', async () => {
  const result = await exportPurchasesExcel({});
  assert.ok(Buffer.isBuffer(result.buffer), 'buffer 应为 Buffer');
  assert.ok(result.filename.includes('采购合同导出'), 'filename 应包含采购合同导出');
  assert.ok(result.filename.endsWith('.xlsx'), 'filename 应以 .xlsx 结尾');
});

test('exportPurchasesExcel: 按状态筛选导出', async () => {
  const result = await exportPurchasesExcel({ status: 'DRAFT' });
  assert.ok(Buffer.isBuffer(result.buffer));
});

test('importPurchasesExcel: 解析并导入采购合同', async () => {
  // 1. 准备一个临时 Excel 文件
  const tmpDir = path.join(process.cwd(), 'tmp_test_import');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  // 先确保有供应商
  let supplier = await prisma.supplier.findFirst({ where: { name: '测试供应商导入' } });
  if (!supplier) {
    supplier = await prisma.supplier.create({ data: { name: '测试供应商导入' } });
  }

  // 清理历史测试数据
  await prisma.purchaseContract.deleteMany({
    where: { contractNo: { startsWith: 'CGTESTIMP' } },
  });

  const workbook = xlsx.utils.book_new();
  const data = [
    ['合同编号', '供应商名称', '签订日期', '总金额', '币种', '状态', '备注'],
    ['CGTESTIMP001', '测试供应商导入', '2024-06-01', 15000, 'CNY', '草稿', '测试备注'],
    ['', '测试供应商导入', '2024-06-02', 20000, 'CNY', '生产中', '自动生成编号'],
  ];
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(workbook, worksheet, '采购合同');

  const filePath = path.join(tmpDir, 'test_import.xlsx');
  xlsx.writeFile(workbook, filePath);

  // 2. 导入
  const result = await importPurchasesExcel(filePath, 'test-user');
  assert.strictEqual(result.successRows, 2, '应成功导入 2 条');
  assert.strictEqual(result.failedRows, 0, '应无失败');

  // 3. 验证数据库
  const contract1 = await prisma.purchaseContract.findUnique({
    where: { contractNo: 'CGTESTIMP001' },
  });
  assert.ok(contract1, 'CGTESTIMP001 应存在');
  assert.strictEqual(contract1.supplierId, supplier.id);
  assert.strictEqual(contract1.totalAmount, 15000);
  assert.strictEqual(contract1.status, 'DRAFT');

  // 清理
  await prisma.purchaseContract.deleteMany({
    where: { supplierId: supplier.id },
  });
  await prisma.supplier.delete({ where: { id: supplier.id } });
  fs.unlinkSync(filePath);
});

test('importPurchasesExcel: 无效数据返回失败明细', async () => {
  const tmpDir = path.join(process.cwd(), 'tmp_test_import');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

  const workbook = xlsx.utils.book_new();
  const data = [
    ['合同编号', '供应商名称', '签订日期', '总金额', '币种', '状态', '备注'],
    ['CGTEST001', '', '2024-06-01', 15000, 'CNY', '草稿', '供应商为空'],
    ['CGTEST002', '不存在的供应商某某某', '2024-06-02', 20000, 'CNY', '草稿', '供应商不存在'],
  ];
  const worksheet = xlsx.utils.aoa_to_sheet(data);
  xlsx.utils.book_append_sheet(workbook, worksheet, '采购合同');

  const filePath = path.join(tmpDir, 'test_import_fail.xlsx');
  xlsx.writeFile(workbook, filePath);

  const result = await importPurchasesExcel(filePath, 'test-user');
  assert.strictEqual(result.successRows, 0);
  assert.strictEqual(result.failedRows, 2);
  assert.strictEqual(result.errors.length, 2);
  assert.ok(result.errors[0].error.includes('供应商名称为空') || result.errors[0].error.includes('不存在'));

  fs.unlinkSync(filePath);
});
