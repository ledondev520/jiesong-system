/**
 * Input: PackingItem (已有 348 条，含 productId + storeId + salesContractId)
 * Output: 从 PackingItem 聚合生成 SalesItem 记录
 * Pos: 修复脚本，为出口合同补全明细行
 *
 * 运行: cd backend && node prisma/fix-sales-items.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 从 PackingItem 生成 SalesItem ===\n');

  const existing = await prisma.salesItem.count();
  if (existing > 0) {
    console.log(`已有 ${existing} 条 SalesItem，跳过`);
    await prisma.$disconnect();
    return;
  }

  // 0. 按 (salesContractId, productId, storeId) 聚合 packing items
  const packingItems = await prisma.packingItem.findMany({
    where: { storeId: { not: null } },
    select: {
      salesContractId: true,
      productId: true,
      storeId: true,
      quantity: true,
      totalPrice: true,
      unit: true,
    },
  });

  const grouped = new Map();
  for (const pi of packingItems) {
    const key = `${pi.salesContractId}|${pi.productId}|${pi.storeId}`;
    const cur = grouped.get(key);
    if (!cur) {
      grouped.set(key, {
        salesContractId: pi.salesContractId,
        productId: pi.productId,
        storeId: pi.storeId,
        quantity: pi.quantity || 0,
        totalPrice: pi.totalPrice || 0,
        unit: pi.unit,
        count: 1,
      });
    } else {
      cur.quantity += pi.quantity || 0;
      cur.totalPrice += pi.totalPrice || 0;
      cur.count++;
    }
  }

  console.log(`PackingItem: ${packingItems.length} 条 → 聚合为 ${grouped.size} 组`);

  // 1. 批量创建 SalesItem
  let created = 0;
  for (const [, g] of grouped) {
    const unitPrice = g.quantity > 0 ? g.totalPrice / g.quantity : 0;
    await prisma.salesItem.create({
      data: {
        salesContractId: g.salesContractId,
        productId: g.productId,
        storeId: g.storeId,
        quantity: g.quantity,
        unit: g.unit || null,
        costPrice: 0,
        sellingPrice: Math.round(unitPrice * 100) / 100,
      },
    });
    created++;
  }

  console.log(`创建 SalesItem: ${created} 条`);

  // 2. 验证
  const total = await prisma.salesItem.count();
  const withPrice = await prisma.salesItem.count({ where: { sellingPrice: { gt: 0 } } });
  console.log(`\n验证: 总数=${total}, 有价格=${withPrice}`);

  await prisma.$disconnect();
}

main();
