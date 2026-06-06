/**
 * 批量商品分类治理脚本
 * Input: prisma/dev.db 中 categoryId 为 NULL 的商品
 * Output: 按语义规则自动分配分类
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 分类规则：按优先级排序（前面的优先级更高）
const CLASSIFICATION_RULES = [
  // 1. 食品 - 最具体
  { keywords: ['火锅底料', '火锅料', '老火锅料', '清油', '菌汤', '煲汤料', '汤料'], categoryName: '食品' },

  // 1.5 其他特殊物品
  { keywords: ['防鸟刺'], categoryName: '装饰品' },
  { keywords: ['自销烟'], categoryName: '设备' },

  // 2. 设备 - 各类机器设备
  {
    keywords: [
      '焊机', '搅拌机', '切菜机', '切骨机', '切片机', '清洗机', '电机', '减速电机',
      '传送带', '回转', '净化器', '油烟', '饭团机', '拌醋机', '切卷机', '洗米机',
      '保温箱', '寿司机', '润滑油', '音响', '音箱', '包装音响', '多管道', '输送机',
      '肉杆', '刀片',
    ],
    categoryName: '设备',
  },

  // 3. 照明
  { keywords: ['LED', '灯带', '灯具', '吊灯', '灯牌', '灯笼', '满天星', '灯'], categoryName: '照明' },

  // 4. 餐具
  {
    keywords: [
      '餐具', '餐盘', '盘碗', '碗', '碟', '盘子', '密胺', '陶瓷餐具', '陶瓷盘',
      '炖盅', '蒸笼', '竹蒸笼', '烧烤签', '钢签', '签子', '寿司用具', '筷子', '勺',
      '托盘',
    ],
    categoryName: '餐具',
  },

  // 5. 厨卫
  {
    keywords: [
      '厨房', '橱柜', '洗手盘', '水龙头', '冰箱', '冷柜', '电磁炉', '电烤炉',
      '煮面炉', '燃气灶', '火锅', '鸳鸯锅', '汤锅', '汤桶', '烤盘', '烤网',
      '接油盘', '吧台', '烟管', '无烟', '旋风锅', '锅具', '锅', '烤盘清洗机',
      '落地式烤网清洗机', '不锈钢火锅', '不锈钢清汤', '不锈钢桶', '操作台',
      '水盘', '薄饼架',
    ],
    categoryName: '厨卫',
  },

  // 6. 门窗
  { keywords: ['门', '窗', '门框', '窗框', '地弹簧', '包厢门', '卫生间门', '厨房门', '铸铝门'], categoryName: '门窗' },

  // 7. 软装
  { keywords: ['窗帘', '隔断', '百叶', '卷帘', '隔板'], categoryName: '软装' },

  // 8. 家具
  {
    keywords: [
      '椅', '桌', '柜', '床', '沙发', '卡座', '置物架', '收银台', '餐桌',
      '工作台', '桌脚', '桌架', '圆桌脚', '铸铁脚', '铸铁托', '自助餐台',
      '调酒台', '等位桌', '支撑架', '酒架', '屏风', '软包',
    ],
    categoryName: '家具',
  },

  // 9. 装饰品
  {
    keywords: [
      '花瓶', '摆件', '装饰', '仿真植物', '仿真花', '仿真绿', '花墙', '绿植',
      '花草', '壁炉',
    ],
    categoryName: '装饰品',
  },

  // 10. 服装
  { keywords: ['工作服', '衣服', '服装', '制服'], categoryName: '服装' },

  // 11. 建材
  {
    keywords: [
      '瓷砖', '石材', '石英石', '大理石', '岩板', 'PU石皮', '板材', '木板',
      '地板', '木地板', '釉面砖', '黑白根', '地膜', '地砖', '石皮', '石板材',
      '厨房石', '石头桌面', '玉石', '吧台石', '石材台面', '地板', '非金属矿物制品',
      '陶瓷', '亚克力板', '亚克力光面', '亚克力乳白', '玻璃地弹', '玻璃门',
      '砖', '柱',
    ],
    categoryName: '建材',
  },

  // 12. 玻璃制品
  { keywords: ['玻璃', '镜子', '镜', '挡边玻璃', '钢化玻璃', '马赛克', '酒瓶'], categoryName: '玻璃制品' },

  // 13. 金属制品
  {
    keywords: [
      '不锈钢', '铁', '铝', '金属', '五金', '蜂窝板', '铝合金', '铸铝', '铁板',
      '钢板', '打磨片', '砂轮',
    ],
    categoryName: '金属制品',
  },

  // 14. 其他
  { keywords: ['样品', '13%专票', '优惠价', '折扣', '运费', '文件损坏'], categoryName: '其他' },
];

async function main() {
  console.log('=== 商品分类治理开始 ===');

  // 1. 获取或创建分类
  const categories = {};
  for (const rule of CLASSIFICATION_RULES) {
    if (categories[rule.categoryName]) continue; // 已创建

    let cat = await prisma.productCategory.findUnique({
      where: { name: rule.categoryName },
    });
    if (!cat) {
      cat = await prisma.productCategory.create({
        data: { name: rule.categoryName },
      });
      console.log(`创建分类: ${rule.categoryName} (${cat.id})`);
    } else {
      console.log(`复用分类: ${rule.categoryName} (${cat.id})`);
    }
    categories[rule.categoryName] = cat.id;
  }

  // 2. 获取未分类商品
  const products = await prisma.product.findMany({
    where: { categoryId: null },
    select: {
      id: true,
      customsName: true,
      description: true,
      specification: true,
    },
  });
  console.log(`\n未分类商品总数: ${products.length}`);

  // 3. 批量分类
  let classified = 0;
  const unclassified = [];
  const stats = {};

  for (const product of products) {
    const text = `${product.customsName || ''} ${product.description || ''} ${product.specification || ''}`;
    let matched = false;

    for (const rule of CLASSIFICATION_RULES) {
      if (rule.keywords.some((kw) => text.includes(kw))) {
        await prisma.product.update({
          where: { id: product.id },
          data: { categoryId: categories[rule.categoryName] },
        });
        classified++;
        stats[rule.categoryName] = (stats[rule.categoryName] || 0) + 1;
        matched = true;
        break;
      }
    }

    if (!matched) {
      unclassified.push({ id: product.id, text: text.trim() });
    }
  }

  // 4. 输出统计
  console.log(`\n=== 分类结果 ===`);
  console.log(`已分类: ${classified}/${products.length}`);
  console.log(`未分类: ${unclassified.length}/${products.length}`);

  console.log(`\n--- 各类别分布 ---`);
  for (const [name, count] of Object.entries(stats).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${name}: ${count}`);
  }

  if (unclassified.length > 0) {
    console.log(`\n--- 仍未分类的商品 ---`);
    for (const item of unclassified.slice(0, 20)) {
      console.log(`  [${item.id}] ${item.text}`);
    }
    if (unclassified.length > 20) {
      console.log(`  ... 还有 ${unclassified.length - 20} 个`);
    }
  }

  console.log('\n=== 商品分类治理完成 ===');
}

main()
  .catch((err) => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
