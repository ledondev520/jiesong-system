/**
 * Input: 供应商名录.csv, docs/商品供应商关联表.csv
 * Output: 补全 Supplier 字段 + 创建 PurchaseContract / PurchaseItem
 * Pos: 一次性数据导入脚本，为系统补全采购侧数据
 *
 * 运行: cd backend && node prisma/import-purchase-data.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const prisma = new PrismaClient();

// ==================== 路径 ====================
const SUPPLIER_CSV = path.resolve(__dirname, '../../供应商名录.csv');
const PURCHASE_CSV = path.resolve(__dirname, '../../docs/商品供应商关联表.csv');

function readCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });
  return data;
}

/**
 * 职责：用 供应商名录.csv 补全已有 Supplier 的缺失字段
 * 思路：按供应商名称匹配，仅填空字段不覆盖已有值
 */
async function enrichSuppliers() {
  console.log('\n=== 1. 补全供应商信息 ===');
  const rows = readCSV(SUPPLIER_CSV);

  // 按供应商名称去重，保留最完整的一行
  const supplierMap = new Map();
  for (const row of rows) {
    const name = (row['供应商名称'] || '').trim();
    if (!name || name === '供应商名称') continue;
    const contractNo = (row['合同编号'] || '').trim();
    if (contractNo.startsWith('（无')) continue;

    const existing = supplierMap.get(name);
    const taxId = (row['纳税人识别号'] || '').trim();
    if (!existing || (taxId && !existing.taxId)) {
      supplierMap.set(name, {
        name,
        taxId: taxId || undefined,
        address: (row['单位地址'] || '').trim() || undefined,
        bankName: (row['收款银行'] || '').trim() || undefined,
        bankAccount: (row['收款帐号'] || '').trim() || undefined,
        phone: (row['电话'] || '').trim() || undefined,
      });
    }
  }

  let updated = 0;
  for (const [name, data] of supplierMap) {
    const supplier = await prisma.supplier.findFirst({ where: { name } });
    if (!supplier) {
      // 0. 不存在则创建
      await prisma.supplier.create({ data: { name, ...data, isActive: true } });
      updated++;
      continue;
    }

    // 1. 仅补空字段
    const patch = {};
    if (!supplier.taxId && data.taxId) patch.taxId = data.taxId;
    if (!supplier.address && data.address) patch.address = data.address;
    if (!supplier.bankName && data.bankName) patch.bankName = data.bankName;
    if (!supplier.bankAccount && data.bankAccount) patch.bankAccount = data.bankAccount;
    if (!supplier.phone && data.phone) patch.phone = data.phone;

    if (Object.keys(patch).length > 0) {
      await prisma.supplier.update({ where: { id: supplier.id }, data: patch });
      updated++;
    }
  }

  console.log(`  供应商：共 ${supplierMap.size} 家，补全/新建 ${updated} 条`);
}

/**
 * 职责：从 商品供应商关联表.csv 创建 PurchaseContract + PurchaseItem
 * 思路：
 *   1. 按合同编号分组 CSV 行
 *   2. 每组创建一个 PurchaseContract（若不存在）
 *   3. 每行创建一个 PurchaseItem（需关联 Product）
 */
async function importPurchaseContracts() {
  console.log('\n=== 2. 导入采购合同 ===');
  const rows = readCSV(PURCHASE_CSV);

  // 1. 按合同编号分组
  const contractGroups = new Map();
  for (const row of rows) {
    const contractNo = (row['合同编号'] || '').trim();
    if (!contractNo) continue;
    if (!contractGroups.has(contractNo)) contractGroups.set(contractNo, []);
    contractGroups.get(contractNo).push(row);
  }

  let created = 0;
  let skipped = 0;
  let itemsCreated = 0;

  for (const [contractNo, items] of contractGroups) {
    // 2. 检查是否已存在
    const existing = await prisma.purchaseContract.findFirst({ where: { contractNo } });
    if (existing) {
      skipped++;
      continue;
    }

    const firstRow = items[0];
    const supplierName = (firstRow['供应商名称'] || '').trim();
    const signedAt = (firstRow['签订日期'] || '').trim();
    const storeName = (firstRow['发货店铺'] || '').trim();

    // 3. 查找或创建供应商
    let supplier = await prisma.supplier.findFirst({ where: { name: supplierName } });
    if (!supplier && supplierName) {
      supplier = await prisma.supplier.create({ data: { name: supplierName, isActive: true } });
    }
    if (!supplier) {
      console.log(`  [跳过] ${contractNo}: 无供应商`);
      skipped++;
      continue;
    }

    // 4. 计算合同总额
    const totalAmount = items.reduce((sum, row) => {
      const amount = parseFloat((row['金额'] || '0').replace(/[,，]/g, ''));
      return sum + (isNaN(amount) ? 0 : amount);
    }, 0);

    // 5. 创建合同
    const contract = await prisma.purchaseContract.create({
      data: {
        contractNo,
        supplierId: supplier.id,
        totalAmount: Math.round(totalAmount * 100) / 100,
        paidAmount: 0,
        status: 'COMPLETED',
        signedAt: signedAt ? new Date(signedAt) : null,
        storeName: storeName || null,
      },
    });
    created++;

    // 6. 创建合同明细行
    for (const row of items) {
      const productName = (row['商品名称'] || '').trim();
      const unit = (row['单位'] || '').trim();
      const qty = parseFloat((row['数量'] || '0').replace(/[,，]/g, ''));
      const unitPrice = parseFloat((row['单价'] || '0').replace(/[,，]/g, ''));
      const totalPrice = parseFloat((row['金额'] || '0').replace(/[,，]/g, ''));

      if (!productName) continue;

      // 6.1 查找商品（按 customsName 近似匹配）
      let product = await prisma.product.findFirst({
        where: { customsName: { contains: productName } },
      });
      if (!product) {
        product = await prisma.product.create({
          data: { customsName: productName, unit: unit || '个', isActive: true },
        });
      }

      await prisma.purchaseItem.create({
        data: {
          purchaseContractId: contract.id,
          productId: product.id,
          quantity: isNaN(qty) ? 0 : qty,
          unitPrice: isNaN(unitPrice) ? 0 : Math.round(unitPrice * 100) / 100,
          totalPrice: isNaN(totalPrice) ? 0 : Math.round(totalPrice * 100) / 100,
          unit: unit || null,
        },
      });
      itemsCreated++;
    }
  }

  console.log(`  采购合同：共 ${contractGroups.size} 个，新建 ${created}，跳过 ${skipped}`);
  console.log(`  采购明细：新建 ${itemsCreated} 条`);
}

async function main() {
  console.log('========================================');
  console.log('  捷淞系统 — 采购数据批量导入');
  console.log('========================================');

  try {
    await enrichSuppliers();
    await importPurchaseContracts();

    // 最终统计
    const counts = {
      suppliers: await prisma.supplier.count(),
      products: await prisma.product.count(),
      purchaseContracts: await prisma.purchaseContract.count(),
      purchaseItems: await prisma.purchaseItem.count(),
    };
    console.log('\n=== 导入完成 ===');
    console.log(`  供应商: ${counts.suppliers}`);
    console.log(`  商品: ${counts.products}`);
    console.log(`  采购合同: ${counts.purchaseContracts}`);
    console.log(`  采购明细: ${counts.purchaseItems}`);
  } catch (err) {
    console.error('导入失败:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
