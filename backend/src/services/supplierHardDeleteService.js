/**
 * Input: Prisma 事务客户端、供应商ID、预览确认令牌
 * Output: 供应商永久删除的预览（计数、阻断原因、确认令牌）与单事务删除
 * Pos: 仅 ADMIN 路由使用；归档（软停用）仍走 supplierController.remove
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const crypto = require('crypto');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');
const { recalculateContractStats } = require('./salesService');

// shortcut: attachment files on disk are kept (same as purchase delete); only ContractFile rows go. Upgrade if disk cleanup is wanted.
// PriceHistory.supplierId has no FK and is a product price snapshot, so it is left untouched.

/** Relation filters rooted at one supplier; nested filters avoid SQLite bound-variable limits on id lists. */
const filters = (supplierId) => {
  const contract = { supplierId };
  const item = { purchaseContract: contract };
  const receipt = { purchaseContract: contract };
  return {
    contract,
    item,
    receipt,
    receiptItem: { receipt },
    inspection: { receipt },
    packing: { purchaseItem: item },
    inventory: { OR: [{ purchaseItem: item }, { receiptInspection: { receipt } }] },
    file: { purchaseContract: contract },
    payment: { purchaseContract: contract },
  };
};

const collect = async (tx, supplierId) => {
  const f = filters(supplierId);
  const contractIds = (await tx.purchaseContract.findMany({ where: f.contract, select: { id: true } })).map((c) => c.id);
  // Polymorphic matches carry no FK; chunk the id list under the SQLite variable limit.
  const matched = async (model) => {
    let total = 0;
    for (let i = 0; i < contractIds.length; i += 500) {
      total += await tx[model].count({ where: { matchedContractType: 'PURCHASE', matchedContractId: { in: contractIds.slice(i, i + 500) } } });
    }
    return total;
  };
  const [aliases, productLinks, contractTemplates, contracts, items, inventories, packingItems, files, supplierInvoiceFiles,
    receipts, receiptItems, inspections, payments, contractsWithInvoiceNo, bankTransactions, invoiceRecords, customsItems] = await Promise.all([
    tx.supplierAlias.count({ where: { supplierId } }),
    tx.productSupplier.count({ where: { supplierId } }),
    tx.contractTemplate.count({ where: { type: 'PURCHASE', supplierId } }),
    tx.purchaseContract.count({ where: f.contract }),
    tx.purchaseItem.count({ where: f.item }),
    tx.inventory.count({ where: f.inventory }),
    tx.packingItem.count({ where: f.packing }),
    tx.contractFile.count({ where: f.file }),
    tx.contractFile.count({ where: { ...f.file, category: 'SUPPLIER_INVOICE' } }),
    tx.purchaseReceipt.count({ where: f.receipt }),
    tx.purchaseReceiptItem.count({ where: f.receiptItem }),
    tx.purchaseReceiptInspection.count({ where: f.inspection }),
    tx.payment.count({ where: f.payment }),
    tx.purchaseContract.count({ where: { ...f.contract, invoiceNo: { not: null } } }),
    matched('bankTransaction'),
    matched('invoiceRecord'),
    tx.customsDeclarationItem.count({ where: { packingItem: f.packing } }),
  ]);
  const counts = { aliases, productLinks, contractTemplates, contracts, items, inventories, packingItems, files, receipts, receiptItems, inspections };
  // Money records are never deleted silently (owner decision 2026-10-31, default; Stans may change).
  const blockers = [];
  if (payments > 0) blockers.push(`存在 ${payments} 条付款/应付核销记录`);
  if (bankTransactions > 0) blockers.push(`存在 ${bankTransactions} 条已匹配银行流水`);
  if (invoiceRecords > 0 || contractsWithInvoiceNo > 0 || supplierInvoiceFiles > 0) blockers.push('存在已匹配发票或发票附件/发票号');
  if (customsItems > 0) blockers.push(`装箱行已被 ${customsItems} 条报关明细引用`);
  return { counts, blockers };
};

// Deterministic HMAC over supplier id + counts: any change since the preview invalidates the token.
const tokenFor = (supplierId, counts) =>
  crypto.createHmac('sha256', config.jwt.secret).update(`supplier-hard-delete:${supplierId}:${JSON.stringify(counts)}`).digest('hex');

/** Must run inside a transaction that already holds the writer lock (see lockSupplier). */
const lockSupplier = async (tx, supplierId) => {
  const locked = await tx.$executeRaw`UPDATE suppliers SET id = id WHERE id = ${supplierId}`;
  if (locked !== 1) throw createError('供应商不存在', 404);
};

const preview = async (prisma, supplierId) => prisma.$transaction(async (tx) => {
  await lockSupplier(tx, supplierId);
  const { counts, blockers } = await collect(tx, supplierId);
  return { counts, blockers, canDelete: blockers.length === 0, confirmToken: blockers.length === 0 ? tokenFor(supplierId, counts) : null };
});

const hardDelete = async (prisma, { supplierId, confirmToken, actorId, req }) => prisma.$transaction(async (tx) => {
  await lockSupplier(tx, supplierId);
  const { counts, blockers } = await collect(tx, supplierId);
  if (blockers.length > 0) throw createError(`涉及资金或报关记录，不可永久删除：${blockers.join('；')}`, 409);
  const expected = Buffer.from(tokenFor(supplierId, counts));
  const given = Buffer.from(String(confirmToken || ''));
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    throw createError('确认令牌无效或关联数据已变化，请重新预览后再确认', 409);
  }
  const f = filters(supplierId);
  // Children first: Inventory/Receipt* are Restrict, PackingItem would otherwise be SetNull-orphaned.
  await tx.inventory.deleteMany({ where: f.inventory });
  await tx.purchaseReceiptInspection.deleteMany({ where: f.inspection });
  await tx.purchaseReceiptItem.deleteMany({ where: f.receiptItem });
  await tx.purchaseReceipt.deleteMany({ where: f.receipt });
  // Sales contracts lose cargo rows here, so their box/weight/volume totals are recomputed by the existing sales logic.
  const salesIds = (await tx.packingItem.findMany({ where: f.packing, select: { salesContractId: true }, distinct: ['salesContractId'] })).map((r) => r.salesContractId);
  await tx.packingItem.deleteMany({ where: f.packing });
  for (const id of salesIds) await recalculateContractStats(id, tx);
  await tx.purchaseContract.deleteMany({ where: f.contract }); // cascades items + ContractFile rows
  await tx.contractTemplate.deleteMany({ where: { type: 'PURCHASE', supplierId } });
  await tx.productSupplier.deleteMany({ where: { supplierId } });
  await tx.supplierAlias.deleteMany({ where: { supplierId } });
  const supplier = await tx.supplier.delete({ where: { id: supplierId }, select: { id: true, name: true } });
  // Same transaction as the delete: no deletion without its audit row.
  await tx.operationLog.create({
    data: {
      actorType: 'USER',
      userId: actorId,
      action: 'HARD_DELETE',
      entity: 'Supplier',
      entityId: supplierId,
      requestId: req?.headers?.['x-request-id'] || null,
      oldValue: JSON.stringify({ name: supplier.name, counts }),
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
    },
  });
  return { counts };
}, { timeout: 30000 });

module.exports = { preview, hardDelete };
