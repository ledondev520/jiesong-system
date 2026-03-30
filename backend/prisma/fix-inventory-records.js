/**
 * Input: PackingItem + SalesContract 现有数据
 * Output: 基于 PackingItem 生成 Inventory 记录
 * Pos: 修复脚本，为工作台"未发货清单"补全库存数据
 *
 * 运行: cd backend && node prisma/fix-inventory-records.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== 生成 Inventory 记录 ===\n');

  const contracts = await prisma.salesContract.findMany({
    select: { id: true, contractNo: true, status: true },
  });

  let created = 0;
  let skipped = 0;

  for (const contract of contracts) {
    const packingItems = await prisma.packingItem.findMany({
      where: { salesContractId: contract.id },
      include: { product: { select: { unit: true } } },
    });

    if (packingItems.length === 0) continue;

    // 0. SHIPPED → OUTBOUND, DRAFT/其他 → PRODUCING
    const status = contract.status === 'SHIPPED' ? 'OUTBOUND' : 'PRODUCING';

    for (const pi of packingItems) {
      // 1. 检查是否已存在
      const existing = await prisma.inventory.findFirst({
        where: { productId: pi.productId, salesContractId: contract.id },
      });
      if (existing) {
        skipped++;
        continue;
      }

      await prisma.inventory.create({
        data: {
          productId: pi.productId,
          salesContractId: contract.id,
          quantity: pi.quantity || 0,
          unit: pi.product?.unit || pi.unit || null,
          status,
          inboundAt: status === 'OUTBOUND' ? new Date() : null,
          outboundAt: status === 'OUTBOUND' ? new Date() : null,
        },
      });
      created++;
    }
  }

  // 2. 统计
  const total = await prisma.inventory.count();
  const producing = await prisma.inventory.count({ where: { status: 'PRODUCING' } });
  const outbound = await prisma.inventory.count({ where: { status: 'OUTBOUND' } });
  const linked = await prisma.inventory.count({ where: { salesContractId: { not: null }, status: { not: 'OUTBOUND' } } });

  console.log(`新建: ${created}, 跳过: ${skipped}`);
  console.log(`\n库存总数: ${total}`);
  console.log(`  PRODUCING (未发货): ${producing}`);
  console.log(`  OUTBOUND (已出库): ${outbound}`);
  console.log(`  未发货清单可见条目: ${linked}`);

  await prisma.$disconnect();
}

main();
