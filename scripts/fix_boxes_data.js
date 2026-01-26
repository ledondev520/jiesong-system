/**
 * Input: PackingItem 表中 EXP25 开头合同的装箱明细
 * Output: 将错误的箱数数据置空
 * Pos: 数据修复脚本，清理因导入脚本错误导致的箱数数据
 * 
 * 问题背景：
 *   原导入脚本错误地将"数量"字段的值当作"箱数"使用，
 *   但实际上 CSV 中没有箱数字段，这两个是不同的概念。
 * 
 * 修复逻辑：
 *   对于 EXP25 开头的合同，如果 boxes == quantity 或 boxes == Math.ceil(quantity)，
 *   说明箱数是从数量错误推导的，应该置空。
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');

const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

async function main() {
  console.log('=== 修复 EXP25 合同的箱数数据 ===\n');
  
  // 1. 获取所有 EXP25 开头的合同
  console.log('1. 查找 EXP25 开头的合同...');
  const contracts = await prisma.salesContract.findMany({
    where: {
      contractNo: { startsWith: 'EXP25' },
    },
    include: {
      packingItems: true,
    },
  });
  console.log(`   找到 ${contracts.length} 个合同\n`);
  
  // 2. 检查并修复装箱明细的箱数
  console.log('2. 检查装箱明细...');
  let fixedCount = 0;
  let totalItems = 0;
  
  for (const contract of contracts) {
    for (const item of contract.packingItems) {
      totalItems++;
      
      // 判断是否为错误数据：boxes 等于 quantity 或 Math.ceil(quantity)
      const isBoxesFromQuantity = 
        item.boxes === item.quantity || 
        item.boxes === Math.ceil(item.quantity);
      
      if (isBoxesFromQuantity && item.boxes !== null) {
        // 修复：将箱数置空
        await prisma.packingItem.update({
          where: { id: item.id },
          data: { boxes: null },
        });
        
        console.log(`   - 修复: ${contract.contractNo} 商品ID=${item.productId} (boxes: ${item.boxes} -> null)`);
        fixedCount++;
      }
    }
  }
  
  // 3. 更新合同的总箱数
  console.log('\n3. 更新合同汇总数据...');
  for (const contract of contracts) {
    // 重新计算总箱数
    const stats = await prisma.packingItem.aggregate({
      where: { 
        salesContractId: contract.id,
        boxes: { not: null }, // 只统计有箱数的
      },
      _sum: { boxes: true },
    });
    
    // 检查是否有任何有效箱数
    const hasValidBoxes = await prisma.packingItem.findFirst({
      where: { 
        salesContractId: contract.id,
        boxes: { not: null },
      },
    });
    
    // 如果没有有效箱数数据，设为0（数据库不允许null）
    const newTotalBoxes = hasValidBoxes ? (stats._sum.boxes || 0) : 0;
    
    if (contract.totalBoxes !== newTotalBoxes) {
      await prisma.salesContract.update({
        where: { id: contract.id },
        data: { totalBoxes: newTotalBoxes },
      });
      console.log(`   - 更新: ${contract.contractNo} totalBoxes: ${contract.totalBoxes} -> ${newTotalBoxes}`);
    }
  }
  
  console.log('\n=== 修复完成 ===');
  console.log(`检查装箱明细: ${totalItems} 条`);
  console.log(`修复箱数数据: ${fixedCount} 条`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
