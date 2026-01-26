/**
 * Input: 商品数据
 * Output: 创建商品分类并批量分类商品
 * Pos: 一次性数据脚本，根据火锅+烧烤店业务场景分类商品
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');
const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

/**
 * 商品分类定义（火锅+烧烤店场景）
 */
const CATEGORIES = [
  { name: '餐厅设备', children: ['火锅设备', '烧烤设备', '厨房电器', '传送设备'] },
  { name: '餐具用品', children: ['锅具', '碗盘餐具', '餐桌配件'] },
  { name: '装修材料', children: ['地面材料', '墙面材料', '门窗', '屏风隔断'] },
  { name: '灯具照明', children: ['吊灯', '灯带', 'LED显示'] },
  { name: '家具家居', children: ['桌椅', '柜架', '软装配饰'] },
  { name: '后厨设备', children: ['厨房台面', '切割设备', '储物设备'] },
  { name: '其他配件', children: ['五金配件', '包装材料', '杂项'] },
];

/**
 * 商品分类映射规则
 */
const PRODUCT_RULES = {
  // 餐厅设备
  '火锅设备': ['火锅', '电磁炉', '鸳鸯锅', '旋风锅', '汤锅', '汤桶', '接油盘', '烟管', '油烟净化器', '排烟管'],
  '烧烤设备': ['电烤炉', '烤盘', '烧烤网', '烤网清洗机'],
  '厨房电器': ['冷冻肉切片机', '切菜机', '切骨机', '搅拌机', '煮面炉', '饭团机', '焊机'],
  '传送设备': ['传送带', '回转火锅传送设备', '寿司输送机', '减速电机', '电机'],
  
  // 餐具用品
  '锅具': ['锅具', '不锈钢桶', '不锈钢圈', '不锈钢火锅', '碗', '盘碗'],
  '碗盘餐具': ['餐盘', '密胺餐盘', '密胺餐具', '陶瓷盘', '陶瓷炖盅', '陶瓷餐具', '玻璃碗', '玻璃瓶', '玻璃酒瓶', '长方盘', '餐具', '不锈钢餐具', '竹蒸笼'],
  '餐桌配件': ['桌脚', '桌架', '圆桌脚', '铸铁一字脚', '铸铁十字托'],
  
  // 装修材料
  '地面材料': ['瓷砖', '岩板', '釉面砖', '玻璃马赛克', '地膜'],
  '墙面材料': ['大理石材', '大理石板材', '石英石', '人造石英石', '超薄石材', 'PU石皮', '玉石', '吧台石', '厨房石', '金属蜂窝板', '亚克力板'],
  '门窗': ['不锈钢门', '铸铝门', '地弹簧门', '玻璃门', '包厢门', '卫生间门', '厨房门', '平开门', '玻璃护栏', '不锈钢护栏', '铝槽玻璃栏杆', '挡边玻璃', '钢化玻璃'],
  '屏风隔断': ['屏风', '铁艺屏风', '不锈钢屏风', '水晶屏风', '隔断', '卫生间隔板', '卫生间隔断板'],
  
  // 灯具照明
  '吊灯': ['吊灯', 'LED吊灯', '满天星吊灯', '灯具'],
  '灯带': ['灯带', 'LED灯带'],
  'LED显示': ['LED显示屏', 'LED模组'],
  
  // 家具家居
  '桌椅': ['餐桌', '椅子', '卡座'],
  '柜架': ['酒架', '铁艺酒架', '大型酒架', '置物架', '餐边柜', '机柜', '自助餐台'],
  '软装配饰': ['仿真植物花墙', '仿真绿植花墙', '窗帘', '壁炉', '音响设备'],
  
  // 后厨设备
  '厨房台面': ['不锈钢桌面', '不锈钢操作台', '不锈钢工作台', '洗手盘'],
  '切割设备': ['冷冻肉切片机', '切菜机', '切骨机'],
  '储物设备': ['置物架'],
  
  // 其他配件
  '五金配件': ['支撑柱', '防鸟刺', '水盘'],
  '包装材料': ['铝合金提箱'],
  '杂项': ['工作服', '样品', '火锅底料', '菌汤火锅料', '清油火锅料'],
};

async function main() {
  console.log('=== 商品分类设置 ===\n');
  
  // 1. 创建分类
  console.log('1. 创建分类结构...');
  const categoryMap = new Map(); // name -> id
  
  for (const cat of CATEGORIES) {
    // 创建一级分类
    let parent = await prisma.productCategory.findFirst({ where: { name: cat.name } });
    if (!parent) {
      parent = await prisma.productCategory.create({
        data: { name: cat.name },
      });
      console.log(`   + ${cat.name}`);
    }
    categoryMap.set(cat.name, parent.id);
    
    // 创建二级分类
    for (const childName of cat.children) {
      let child = await prisma.productCategory.findFirst({ where: { name: childName } });
      if (!child) {
        child = await prisma.productCategory.create({
          data: { name: childName, parentId: parent.id },
        });
        console.log(`     - ${childName}`);
      }
      categoryMap.set(childName, child.id);
    }
  }
  
  // 2. 批量分类商品
  console.log('\n2. 批量分类商品...');
  const products = await prisma.product.findMany();
  let updated = 0;
  
  for (const product of products) {
    const name = product.customsName;
    let matchedCategory = null;
    
    // 按规则匹配
    for (const [catName, keywords] of Object.entries(PRODUCT_RULES)) {
      for (const keyword of keywords) {
        if (name.includes(keyword)) {
          matchedCategory = catName;
          break;
        }
      }
      if (matchedCategory) break;
    }
    
    if (matchedCategory && categoryMap.has(matchedCategory)) {
      const categoryId = categoryMap.get(matchedCategory);
      if (product.categoryId !== categoryId) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId },
        });
        console.log(`   ${name} -> ${matchedCategory}`);
        updated++;
      }
    } else {
      // 未匹配的归入"杂项"
      const miscId = categoryMap.get('杂项');
      if (miscId && product.categoryId !== miscId) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId: miscId },
        });
        console.log(`   ${name} -> 杂项 (未匹配)`);
        updated++;
      }
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`总商品: ${products.length}`);
  console.log(`已分类: ${updated}`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
