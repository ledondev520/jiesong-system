/**
 * Input: Store数据
 * Output: 合并重复门店，统一名称
 * Pos: 数据清洗脚本，合并重复的门店名称
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');
const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

/**
 * 门店合并规则：key为标准名称，value为需要合并的别名列表
 */
const MERGE_RULES = {
  '安纳汉姆': ['安娜汉姆'],
  '圣荷西2115': ['San Jose 2115', 'san jose 2115', '圣荷西'],
  'Westminster': ['westminster'],
  '禧瑞都': ['喜瑞都'],
  'Burbank': ['burbank'],
};

async function main() {
  console.log('=== 门店数据合并 ===\n');
  
  // 1. 获取所有门店
  const stores = await prisma.store.findMany();
  console.log(`当前门店数: ${stores.length}\n`);
  
  // 2. 按规则合并
  for (const [standardName, aliases] of Object.entries(MERGE_RULES)) {
    console.log(`处理: ${standardName}`);
    
    // 找到标准门店
    let standardStore = stores.find(s => s.name === standardName);
    if (!standardStore) {
      console.log(`  - 标准门店不存在，跳过`);
      continue;
    }
    
    // 找到所有别名门店
    for (const alias of aliases) {
      const aliasStore = stores.find(s => s.name === alias);
      if (!aliasStore) {
        console.log(`  - 别名 "${alias}" 不存在`);
        continue;
      }
      
      if (aliasStore.id === standardStore.id) {
        continue;
      }
      
      // 将别名门店的packingItems迁移到标准门店
      const updateResult = await prisma.packingItem.updateMany({
        where: { storeId: aliasStore.id },
        data: { storeId: standardStore.id },
      });
      console.log(`  - "${alias}" -> "${standardName}": 迁移 ${updateResult.count} 条记录`);
      
      // 将别名门店的salesItems迁移
      const salesResult = await prisma.salesItem.updateMany({
        where: { storeId: aliasStore.id },
        data: { storeId: standardStore.id },
      });
      if (salesResult.count > 0) {
        console.log(`    销售明细: ${salesResult.count} 条`);
      }
      
      // 删除别名门店（如果没有其他关联）
      try {
        await prisma.store.delete({ where: { id: aliasStore.id } });
        console.log(`  - 删除别名门店: "${alias}"`);
      } catch (e) {
        console.log(`  - 无法删除别名门店 "${alias}": ${e.message}`);
      }
    }
  }
  
  // 3. 显示合并后的门店列表
  console.log('\n=== 合并后门店列表 ===');
  const finalStores = await prisma.store.findMany({ orderBy: { name: 'asc' } });
  finalStores.forEach(s => console.log(`  - ${s.name}`));
  console.log(`\n总计: ${finalStores.length} 个门店`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
