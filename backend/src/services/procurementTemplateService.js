/**
 * Input: 出货汇总CSV文件（根目录）
 * Output: 门店开业采购模板数据（通用模板、按店明细、门店列表）
 * Pos: 核心分析服务，解析历史出货记录，生成优先级化的采购指南
 *      优先级策略：以密歇根门店为模板基准，其采购项目标记为"强烈建议"
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

// CSV文件路径（仓库根目录）：__dirname = backend/src/services → 上3层到 jiesong_system/
const CSV_PATH = path.resolve(__dirname, '../../../出货汇总0315.csv');

// 以密歇根门店作为标准模板参照店（其采购项 = 强烈建议）
const TEMPLATE_STORE = '密歇根';

// ==================== 品类关键词映射 ====================
const CATEGORY_RULES = [
  { category: '传送设备', keywords: ['传送带', '回转火锅', '回转传送', '减速电机'] },
  { category: '厨房设备', keywords: ['电磁炉', '电烤炉', '冷冻肉切片', '切菜机', '切骨机', '搅拌机', '焊机', '燃气煮面', '煮面炉', '接油盘', '不锈钢桶', '不锈钢操作台', '置物架', '小型饭团', '烤网', '洗碗机', '清洗机'] },
  { category: '火锅器材', keywords: ['不锈钢圈', '烤盘', '锅具', '鸳鸯锅', '汤锅', '汤桶', '水盘', '烧烤网', '长方盘', '竹蒸笼', '上压肉杆', '下压肉杆', '烤网烤盘'] },
  { category: '装修材料', keywords: ['瓷砖', '石材', '石英石', '超薄石', '马赛克', '岩板', '人造石英', '釉面砖', '玻璃马赛克', '地膜', 'PU石皮', '钢化玻璃', '金属蜂窝板', '亚克力板', '玻璃护栏', '不锈钢护栏', '铸铝门', '大理石材', '地弹簧门', '隔断'] },
  { category: '家具软装', keywords: ['餐桌', '卡座', '椅子', '不锈钢门', '屏风', '酒架', '吧台', '泉州铁艺', '大型酒架', '五金桌脚', '桌架', '桌面', '餐边柜', '自助餐台'] },
  { category: '灯光照明', keywords: ['LED', '吊灯', '灯带', '灯具', '满天星', '灯笼', '灯牌', '台灯'] },
  { category: '餐具用品', keywords: ['餐盘', '餐具', '盘碗', '陶瓷', '密胺', '蒸笼', '不锈钢餐具', '陶瓷餐具', '陶瓷盘', '陶瓷炖盅', '工作服'] },
  { category: '装饰配件', keywords: ['玻璃瓶', '玻璃酒瓶', '花墙', '壁炉', '仿真植物', '铁艺屏风', '窗帘', '音响', 'KTV', 'ktv', '机柜', '防鸟刺', '铝合金', '支撑柱', '烟管'] },
  { category: '食材物料', keywords: ['火锅底料', '菌汤', '清油', '底料'] },
];

// ==================== 补充信息清理规则 ====================
// 尺寸规格（如"800*800"、"1200*1400*20"）
const SPEC_PATTERN = /\d+[\*×xX]\d+/;
// 以数字开头（数量描述，如"3000个黑色盘"、"8英寸1000"）
const QTY_START_PATTERN = /^\d/;
// 内部运营备注关键词
const INTERNAL_NOTE_PATTERN = /^(代订|淘宝|已|样品|试验|备用|在[^\s]{1,3}那|测试|机动|修复|寄到|自购|何总|定制|小样|补充|搭配|配套)/;
// 含等号或"等XX器材"（分组备注，如"电磁炉等火锅器材"）
const GROUPING_PATTERN = /等[^。\s]+器材|等[^。\s]{2,}设备/;
// 含大写字母+空格模式（内部代码，如"圣荷西 B C E"）
const CODE_PATTERN = /[A-Z] [A-Z]/;

/**
 * 职责：清理商品补充信息，只保留有价值的产品类型描述
 * 思路：仅保留2-8字的类型描述（如"雾化壁炉"、"鸟笼灯"、"水晶屏风"）
 *      过滤掉：尺寸规格、数量描述、内部运营备注、分组备注、内部代码
 */
function cleanSupplement(supplement, productName) {
  if (!supplement || supplement.length < 2) return '';
  // 先截取逗号前的部分（可能有多个选项描述）
  let s = supplement.trim().split(/[,，]/)[0].trim();
  if (!s || s.length < 2) return '';
  if (SPEC_PATTERN.test(s)) return '';
  if (QTY_START_PATTERN.test(s)) return '';
  if (INTERNAL_NOTE_PATTERN.test(s)) return '';
  if (GROUPING_PATTERN.test(s)) return '';
  if (CODE_PATTERN.test(s)) return '';
  // 含"搭配"（搭配关系备注）或大写英文字母（内部编号）
  if (s.includes('搭配') || /[A-Z]/.test(s)) return '';
  if (productName.includes(s) || s.includes(productName)) return '';
  if (s.length > 8) return '';
  return s;
}

// ==================== 数据缓存 ====================
let _cache = null;

/**
 * 职责：读取并解析CSV文件，返回干净的行数组
 */
function loadCSV() {
  if (_cache) return _cache;
  if (!fs.existsSync(CSV_PATH)) throw new Error(`CSV文件未找到: ${CSV_PATH}`);

  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const { data } = Papa.parse(raw, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  _cache = data.filter((row) => {
    const store = (row['门店'] || '').trim();
    const product = (row['报关名'] || '').trim();
    return store && product && store !== '门店' && product !== '报关名';
  });

  return _cache;
}

/**
 * 职责：根据报关名匹配品类
 */
function classifyProduct(productName) {
  const name = productName.trim();
  for (const { category, keywords } of CATEGORY_RULES) {
    if (keywords.some((kw) => name.includes(kw))) return category;
  }
  return '其他配件';
}

// 门店名称规范化映射
const STORE_NORMALIZE = {
  'burbank': 'Burbank',
  'westminster': 'Westminster',
  '威斯敏': 'Westminster',
  '安娜汉姆': '安纳汉姆',
  '圣荷西625店': '圣荷西625',
  '红木城店': '红木城',
  '625': '圣荷西625',
  '圣马特店': '圣马特',
  '圣荷西': '圣荷西2115',   // 圣荷西 合并入 圣荷西2115
};

function normalizeStore(name) {
  const trimmed = name.trim();
  return STORE_NORMALIZE[trimmed] || STORE_NORMALIZE[trimmed.toLowerCase()] || trimmed;
}

/**
 * 职责：将门店名字符串拆分成规范化的门店列表
 */
function splitStores(storeName) {
  return storeName
    .replace(/and/gi, '|')
    .replace(/[、，,\/\+和]/g, '|')
    .split('|')
    .map((s) => normalizeStore(s.trim()))
    .filter(Boolean);
}

function parseAmount(val) {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[,，\s"]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseQty(val) {
  if (!val) return 0;
  const cleaned = val.toString().replace(/[（(）)]/g, '').split(/[^0-9.]/)[0];
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * 职责：获取CSV中所有不重复的门店名列表
 */
function getStoreList() {
  const rows = loadCSV();
  const stores = new Set();
  for (const row of rows) {
    splitStores((row['门店'] || '').trim()).forEach((n) => stores.add(n));
  }
  return Array.from(stores).sort();
}

/**
 * 职责：获取通用开业采购模板
 * 思路：
 *   1. 以密歇根门店采购清单为模板基准：凡密歇根买过的物品 → "强烈建议"
 *   2. 非密歇根但3+家门店均有采购 → "建议"
 *   3. 其余 → "可选"
 *   4. 参考数量 = 每家采购此物品的门店的平均数量（均值）
 *   5. 补充信息自动清洗（去除规格参数和内部备注）
 * @returns {Object}
 */
function getUniversalTemplate() {
  const rows = loadCSV();

  // 1. 先收集密歇根门店的商品集合（作为模板基准）
  const templateStoreProducts = new Set();
  for (const row of rows) {
    const stores = splitStores((row['门店'] || '').trim());
    if (stores.includes(TEMPLATE_STORE)) {
      const product = (row['报关名'] || '').trim();
      if (product) templateStoreProducts.add(product);
    }
  }

  // 2. 按报关名聚合：使用 storeQtyMap 统计每家门店的采购量，最终算均值
  const productMap = new Map();

  for (const row of rows) {
    const product = (row['报关名'] || '').trim();
    if (!product) continue;

    const rawSupplement = (row['商品补充信息'] || '').trim();
    const rawStores = (row['门店'] || '').trim();
    const unit = (row['单位'] || '').trim();
    const manufacturer = (row['厂家'] || '').trim();
    const qty = parseQty(row['报关数量']);
    const amount = parseAmount(row[' 采购金额 '] || row['采购金额']);
    const stores = splitStores(rawStores);

    if (!productMap.has(product)) {
      productMap.set(product, {
        name: product,
        displayName: product,
        supplement: cleanSupplement(rawSupplement, product),
        category: classifyProduct(product),
        storeSet: new Set(),
        storeQtyMap: new Map(),  // storeName → total qty
        units: new Set(),
        manufacturers: new Set(),
        totalAmount: 0,
        rowCount: 0,
      });
    }

    const entry = productMap.get(product);
    // 补充信息：取第一个有效的
    if (!entry.supplement && rawSupplement) {
      entry.supplement = cleanSupplement(rawSupplement, product);
    }

    for (const store of stores) {
      entry.storeSet.add(store);
      // 累加该门店的数量
      entry.storeQtyMap.set(store, (entry.storeQtyMap.get(store) || 0) + qty);
    }

    if (unit) entry.units.add(unit);
    if (manufacturer && !['淘宝', '淘宝定制', '淘宝在线采购', 'zeqin', '王总定制'].includes(manufacturer)) {
      entry.manufacturers.add(manufacturer);
    }
    entry.totalAmount += amount;
    entry.rowCount++;
  }

  // 3. 构建结果数组
  const totalStores = getStoreList().length;
  const items = [];

  for (const [, entry] of productMap) {
    const storeCount = entry.storeSet.size;
    const frequency = Math.round((storeCount / totalStores) * 100);

    // 优先级：密歇根买过 → 强烈建议；否则按跨店频率
    let priority;
    if (templateStoreProducts.has(entry.name)) {
      priority = '强烈建议';
    } else if (storeCount >= 3) {
      priority = '建议';
    } else {
      priority = '可选';
    }

    // 均值数量：将各门店的该产品采购量取均值（有数量的门店）
    const storeQtys = Array.from(entry.storeQtyMap.values()).filter((q) => q > 0);
    const avgQtyPerStore = storeQtys.length > 0
      ? Math.round(storeQtys.reduce((a, b) => a + b, 0) / storeQtys.length)
      : null;

    // 选取单位：优先干净的单位，否则从脏数据中提取括号前的内容
    const allUnits = Array.from(entry.units).filter(Boolean);
    const cleanUnit = allUnits.find((u) => !/[（(）)\d]/.test(u))
      || (allUnits[0] ? allUnits[0].replace(/[（(）)].*/g, '').trim() : '');
    const unit = cleanUnit || '—';

    items.push({
      name: entry.name,
      supplement: entry.supplement,
      category: entry.category,
      storeCount,
      frequency,
      priority,
      isTemplateStore: templateStoreProducts.has(entry.name),  // 是否密歇根模板店采购
      avgQtyPerStore,
      unit,
      manufacturers: Array.from(entry.manufacturers).slice(0, 2),
      totalAmount: Math.round(entry.totalAmount),
      rowCount: entry.rowCount,
    });
  }

  // 4. 排序：优先级 → 门店数 → 金额
  const priorityOrder = { '强烈建议': 0, '建议': 1, '可选': 2 };
  items.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.storeCount - a.storeCount;
  });

  // 5. 按品类分组
  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return {
    totalStores,
    totalProducts: items.length,
    mustHaveCount: items.filter((i) => i.priority === '强烈建议').length,
    templateStore: TEMPLATE_STORE,
    items,
    byCategory,
  };
}

/**
 * 职责：获取指定门店的历史采购清单
 */
function getStoreTemplate(storeName) {
  const rows = loadCSV();

  const matchedRows = rows.filter((row) => {
    const stores = splitStores((row['门店'] || '').trim());
    return stores.some((s) => s === storeName || s.includes(storeName) || storeName.includes(s));
  });

  const productMap = new Map();
  for (const row of matchedRows) {
    const product = (row['报关名'] || '').trim();
    const rawSupplement = (row['商品补充信息'] || '').trim();
    const unit = (row['单位'] || '').trim();
    const manufacturer = (row['厂家'] || '').trim();
    const qty = parseQty(row['报关数量']);
    const amount = parseAmount(row[' 采购金额 '] || row['采购金额']);
    const spec = (row['规格'] || '').trim();
    const date = (row['出货日期'] || '').trim();

    if (!productMap.has(product)) {
      productMap.set(product, {
        name: product,
        supplement: cleanSupplement(rawSupplement, product),
        category: classifyProduct(product),
        totalQty: 0,
        unit,
        manufacturer,
        spec: SPEC_PATTERN.test(spec) ? '' : spec,
        totalAmount: 0,
        shipments: [],
      });
    }

    const entry = productMap.get(product);
    entry.totalQty += qty;
    entry.totalAmount += amount;
    if (date || qty) {
      entry.shipments.push({ date, qty, amount });
    }
  }

  const items = Array.from(productMap.values()).map((e) => ({
    ...e,
    totalAmount: Math.round(e.totalAmount),
  }));

  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const byCategory = {};
  for (const item of items) {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  }

  return {
    storeName,
    totalProducts: items.length,
    totalAmount: Math.round(items.reduce((s, i) => s + i.totalAmount, 0)),
    items,
    byCategory,
  };
}

module.exports = { getStoreList, getUniversalTemplate, getStoreTemplate };
