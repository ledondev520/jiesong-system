/**
 * Input: Private migrated SQLite and synthetic catalog/purchase identifiers
 * Output: Independently stored dashboard KPI, historical risk and product-trace facts
 * Pos: Test-only literal source fixture; never calls dashboard/business services
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const { execFileSync } = require('node:child_process');

/**
 * 职责：以独立 SQL 写入已知事实，区分最近六笔与更早风险、派生与正式货值。
 * @param database 当前私有合成 SQLite 路径
 * @param ids 当前场景已有的商品、供应商、港口、采购及明细 ID
 * @returns 浏览器及 HTTP 验收使用的合成合同定位信息
 * @throws SQLite 插入或外键校验失败
 */
function seedDashboardSources(database, ids) {
  const createdAt = Date.parse('2026-06-01T00:00:00Z');
  const updatedAt = Date.parse('2026-07-01T00:00:00Z');
  /** 职责：补齐通用合成时间戳；@param data SQL 来源行；@returns 完整合成来源行。 */
  const row = data => ({ createdAt, updatedAt, ...data });
  /** 职责：补齐销售汇率及目的港；@param data 销售来源行；@returns 合成销售行。 */
  const sale = data => row({ exchangeRate: 7.2, portId: ids.portId, ...data });
  /** 职责：补齐可装下的小箱参数；@param data 装箱来源行；@returns 合成装箱行。 */
  const packing = data => row({ productId: ids.productId, quantity: 12, unit: '件',
    boxes: 1, grossWeight: 10, netWeight: 9, volume: 0.1,
    length: 500, width: 500, height: 400, unitPrice: 1, ...data });
  const tables = {
    products: [row({ id: 'dashboard-navigation-product', customsName: '合成导航商品', unit: '件' }),
      row({ id: 'dashboard-inactive-product', customsName: '合成停用商品', isActive: 0 })],
    stores: [row({ id: 'dashboard-store-a', name: '合成追踪门店甲', portId: ids.portId }),
      row({ id: 'dashboard-store-b', name: '合成追踪门店乙', portId: ids.portId })],
    purchase_contracts: [
      row({ id: 'dashboard-draft-purchase', contractNo: 'CG-SYNTHETIC-DRAFT-B', supplierId: ids.supplierId,
        status: 'DRAFT', totalAmount: 200, paidAmount: 50 }),
      row({ id: 'dashboard-pending-purchase', contractNo: 'CG-SYNTHETIC-PENDING', supplierId: ids.supplierId,
        status: 'PENDING', totalAmount: 300, paidAmount: 100 }),
      row({ id: 'dashboard-cancelled-purchase', contractNo: 'CG-SYNTHETIC-CANCELLED', supplierId: ids.supplierId,
        status: 'CANCELLED', totalAmount: 900, paidAmount: 100 }),
      row({ id: 'dashboard-completed-purchase', contractNo: 'CG-SYNTHETIC-COMPLETED', supplierId: ids.supplierId,
        status: 'COMPLETED', totalAmount: 100, paidAmount: 100, invoiceNo: 'SYNTHETIC-INVOICE' }),
    ],
    purchase_items: [
      row({ id: 'dashboard-completed-purchase-item', purchaseContractId: 'dashboard-completed-purchase',
        productId: 'dashboard-navigation-product', quantity: 10, unitPrice: 10, totalPrice: 100,
        specification: '合成已完成箱', boxes: 1, grossWeight: 10, netWeight: 9, volume: 0.1 }),
    ],
    sales_contracts: [
      ...Array.from({ length: 7 }, (_, index) => sale({
        id: `dashboard-recent-${index + 1}`, contractNo: `EXP-SYNTHETIC-RECENT-${index + 1}`,
        status: 'SHIPPED', shippedAt: Date.parse('2026-09-01T00:00:00Z'),
        updatedAt: Date.parse(`2026-10-0${index + 1}T00:00:00Z`),
      })),
      sale({ id: 'dashboard-old-risk', contractNo: 'EXP-SYNTHETIC-OLD-RISK', status: 'DRAFT',
        totalAmount: 1000, receivedAmount: 250, totalBoxes: 2, grossWeight: 25000, volume: 0.2 }),
      sale({ id: 'dashboard-packing-only', contractNo: 'EXP-SYNTHETIC-PACKING-ONLY', status: 'SHIPPED',
        shippedAt: Date.parse('2026-07-15T00:00:00Z'), amountSource: 'FORMAL_DOCUMENT', totalAmount: 400,
        receivedAmount: 100, totalBoxes: 2, grossWeight: 20, volume: 0.2 }),
      sale({ id: 'dashboard-missing-params', contractNo: 'EXP-SYNTHETIC-MISSING-PARAMS', status: 'CONFIRMED',
        updatedAt: Date.parse('2026-09-01T00:00:00Z') }),
      sale({ id: 'dashboard-cancelled-sale', contractNo: 'EXP-SYNTHETIC-CANCELLED', status: 'CANCELLED',
        totalAmount: 9999, receivedAmount: 0, updatedAt: Date.parse('2026-10-08T00:00:00Z') }),
      sale({ id: 'dashboard-completed-sale', contractNo: 'EXP-SYNTHETIC-COMPLETED', status: 'COMPLETED',
        totalAmount: 100, receivedAmount: 100, amountSource: 'FORMAL_DOCUMENT',
        totalBoxes: 1, grossWeight: 10, volume: 0.1, shippedAt: Date.parse('2026-07-15T00:00:00Z') }),
    ],
    sales_items: [row({ id: 'dashboard-sales-source', salesContractId: 'dashboard-old-risk',
      productId: ids.productId, storeId: 'dashboard-store-a', quantity: 11, costPrice: 1, sellingPrice: 2 })],
    packing_items: [
      packing({ id: 'dashboard-dual-owned', salesContractId: 'dashboard-old-risk', storeId: 'dashboard-store-a',
        purchaseContractNo: 'CG-SYNTHETIC-MISSING', totalPrice: 700, grossWeight: 25000 }),
      packing({ id: 'dashboard-dual-third-party', salesContractId: 'dashboard-old-risk', storeId: 'dashboard-store-a',
        isOwnedByJiesong: 0, totalPrice: 300 }),
      packing({ id: 'dashboard-packing-store', salesContractId: 'dashboard-packing-only', storeId: 'dashboard-store-b',
        quantity: 17, totalPrice: 350 }),
      packing({ id: 'dashboard-packing-no-store', salesContractId: 'dashboard-packing-only',
        quantity: 19, isOwnedByJiesong: 0, totalPrice: 50 }),
      packing({ id: 'dashboard-purchase-action', salesContractId: 'dashboard-recent-7',
        productId: 'dashboard-navigation-product', quantity: 3, totalPrice: 0,
        purchaseContractNo: 'PO-SYNTHETIC-ROLE', purchaseItemId: ids.purchaseItemId }),
      packing({ id: 'dashboard-completed-packing', salesContractId: 'dashboard-completed-sale',
        productId: 'dashboard-navigation-product', quantity: 10, totalPrice: 100,
        purchaseContractNo: 'CG-SYNTHETIC-COMPLETED', purchaseItemId: 'dashboard-completed-purchase-item' }),
    ],
    // Metadata-only synthetic fixtures establish completed stages; no original bytes or file writes.
    contract_files: [
      { id: 'dashboard-synthetic-signed-metadata', purchaseContractId: 'dashboard-completed-purchase',
        fileName: 'synthetic-metadata-only.pdf', filePath: 'synthetic-unused/signed-metadata.pdf',
        fileType: 'PDF', fileSize: 0, category: 'SIGNED_CONTRACT' },
    ],
    sales_contract_files: [
      { id: 'dashboard-synthetic-carrier-metadata', salesContractId: 'dashboard-completed-sale',
        fileName: 'synthetic-metadata-only.pdf', filePath: 'synthetic-unused/carrier-metadata.pdf',
        fileType: 'PDF', fileSize: 0, category: 'CARRIER_DOCUMENT' },
    ],
    packing_list_checks: [
      row({ id: 'dashboard-synthetic-passed-check', salesContractId: 'dashboard-completed-sale',
        salesContractFileId: 'dashboard-synthetic-carrier-metadata', automaticStatus: 'PASSED',
        status: 'PASSED', summaryJson: '{}' }),
    ],
    customs_declarations: [
      row({ id: 'dashboard-synthetic-declaration', declarationNo: 'CD-SYNTHETIC-COMPLETED',
        salesContractId: 'dashboard-completed-sale', status: 'DRAFT' }),
    ],
    tax_refunds: [
      row({ id: 'dashboard-synthetic-refund', refundNo: 'TR-SYNTHETIC-COMPLETED',
        salesContractId: 'dashboard-completed-sale', customsDeclarationId: 'dashboard-synthetic-declaration', status: 'APPLIED' }),
    ],
    inventories: [row({ id: 'dashboard-in-stock', productId: ids.productId, quantity: 8, status: 'IN_STOCK' }),
      row({ id: 'dashboard-out-stock', productId: ids.productId, quantity: 4, status: 'OUT_STOCK' }),
      row({ id: 'dashboard-producing', productId: ids.productId, quantity: 20, status: 'PRODUCING' })],
    financial_periods: [
      { id: 'dashboard-finance-old', year: 2025, month: 12, periodLabel: '合成2025年12账期',
        reportDate: Date.parse('2025-12-31'), importedAt: Date.parse('2026-10-05'), updatedAt },
      { id: 'dashboard-finance-current', year: 2026, month: 9, periodLabel: '合成2026年9账期',
        reportDate: Date.parse('2026-09-30'), importedAt: Date.parse('2026-10-01'), updatedAt },
    ],
  };
  execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect(sys.argv[1])
c.execute('PRAGMA foreign_keys=ON')
c.execute('UPDATE purchase_contracts SET status=?,totalAmount=?,paidAmount=?,updatedAt=? WHERE id=?',('DRAFT',1130,130,${updatedAt},sys.argv[2]))
for table,rows in json.load(sys.stdin).items():
  for row in rows:
    columns=list(row)
    c.execute('INSERT INTO "'+table+'" ('+','.join('"'+key+'"' for key in columns)+') VALUES ('+','.join('?' for key in columns)+')',list(row.values()))
c.commit()
c.close()`, database, ids.purchaseId], { input: JSON.stringify(tables), timeout: 10000 });
  return { riskId: 'dashboard-old-risk', riskNo: 'EXP-SYNTHETIC-OLD-RISK',
    taskId: 'dashboard-recent-7', taskNo: 'EXP-SYNTHETIC-RECENT-7',
    purchaseNo: 'CG-SYNTHETIC-ROLE', latestPeriodLabel: '合成2026年9账期' };
}

module.exports = { seedDashboardSources };
