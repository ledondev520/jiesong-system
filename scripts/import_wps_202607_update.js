/**
 * Input: docs/wps-import/2026-07/*（EXP260008/EXP260009 出口工作簿 + EXP260008 船司核对单 PDF）+ 招行 2026-05/06 月度对账单（数据已固化为本文件常量）+ backend/prisma 数据库
 * Output: EXP260008/EXP260009 出口合同全量数据（销售明细/装箱明细/汇总指标/附件）、EXP260004 头字段修复、CG2600035/CG2600040 采购合同补建、银行流水付款登记（PAYABLE/INCOME）、采购合同 paidAmount 重算与 DRAFT→SIGNED 状态推进
 * Pos: WPS 2026-07 增量数据幂等导入脚本；默认 dry-run 只打印计划，--apply 才写库；本地与 VPS 各执行一次即可保持两侧数据一致
 *
 * 幂等策略：
 *   - 出口合同按 contractNo upsert；items/packingItems 先删后建（仅限本脚本管理的 EXP260008/009）
 *   - 付款按 idempotencyKey（BANKFLOW-<日期>-<票据号>）唯一去重
 *   - 附件按 salesContractId+fileName 去重
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const SOURCE_DIR = path.join(repoRoot, 'docs/wps-import/2026-07');
const UPLOAD_DIR = path.join(backendPath, 'uploads/sales-contracts');

// ==================== 0. 数据常量（源：WPS 工作簿 + 招行对账单） ====================

// 0.1 出口合同（源：外销出口合同+发票+箱单+EXP260008/009 0703.xlsx）
const EXPORT_CONTRACTS = [
  {
    contractNo: 'EXP260008',
    storeName: '圣荷西2115',
    portName: 'Oakland',
    signedAt: '2026-06-15',
    shippedAt: '2026-07-03',
    exchangeRate: 7,
    customsBroker: '捷淞',
    containerLabel: '33-圣荷西2115',
    totalAmount: 64314,
    totalBoxes: 114,
    grossWeight: 8235,
    netWeight: 7693,
    volume: 63.853,
    note: '[WPS_SOURCE] 11-报关记录/2026年7月/外销出口合同+发票+箱单+EXP260008 0703 圣荷西2115.xlsx（源表柜号写作29-圣荷西2115，与EXP260003冲突，按物理柜顺序修正为33）',
    items: [
      { name: '大型酒架', spec: '3600*660*2450', qty: 1, unit: '套', usd: 12000, hsCode: '7326909000', declaration: '0|0|装饰用途，非工业用途|不锈钢30*30方管|不锈钢拼接而成|', boxes: 4, gw: 1399, nw: 1094, vol: 27.836, manufacturer: '上海', purchaseContractNo: null, supplement: null, origin: '上海市闵行区' },
      { name: '1.2米常温调酒台', spec: '1300*700*1000', qty: 3, unit: '台', usd: 400, hsCode: '9403200000', declaration: '0|0|用于搁置调酒器皿|不锈钢|无品牌|1.2米长|', boxes: 3, gw: 180, nw: 170, vol: 1.82, manufacturer: '广州市拓盛餐饮设备有限公司', purchaseContractNo: 'CG2600034', supplement: '2左1右', origin: '广州市番禺区' },
      { name: '灯具', spec: '1050*1050*260', qty: 13, unit: '件', usd: 300, hsCode: '9405110000', declaration: '0|0|电动照明，用于室内照明使用灯具|无品牌||', boxes: 13, gw: 294, nw: 280, vol: 3.167, manufacturer: '中山市鼎仁照明科技有限公司', purchaseContractNo: 'CG2600038', supplement: null, origin: '中山市' },
      { name: '隔断', spec: '3540*795*1260', qty: 1, unit: '套', usd: 3000, hsCode: '9403200000', declaration: '0|0|用于餐厅包厢门及空间隔断装饰|不锈钢主题搭配金属装饰条|无品牌|1681*2674mm|', boxes: 1, gw: 1179, nw: 1079, vol: 3.55, manufacturer: '佛山市南海区筑界空间门窗厂', purchaseContractNo: 'CG2600039', supplement: '包厢隔断门', origin: '广东省广州市' },
      { name: '大理石制品', spec: '3200*1600*1150', qty: 107.52, unit: '平方米', usd: 146, hsCode: '9403892000', declaration: '0|0|加工为供餐厅使用的台面|无品牌|无型号|', boxes: 10, gw: 3100, nw: 3050, vol: 23.54, manufacturer: null, purchaseContractNo: null, supplement: '阿宗剩余发票', origin: '广东省云浮市' },
      { name: '瓷砖', spec: '800*800*40', qty: 232, unit: '平方米', usd: 13, hsCode: '6907219000', declaration: '0|0|铺面砖|800*800|0.003|无品牌|深灰色', boxes: 80, gw: 1960, nw: 1900, vol: 3.42, manufacturer: null, purchaseContractNo: null, supplement: '89箱800砖', origin: '佛山市禅城区' },
      { name: '寿司饭团机', spec: '585*430*705', qty: 3, unit: '台', usd: 8500, hsCode: '8438800000', declaration: '0|0|米饭饭团成型成卷的食品加工|无品牌|MY-C1|', boxes: 3, gw: 123, nw: 120, vol: 0.52, manufacturer: null, purchaseContractNo: null, supplement: '铺饭机，饭团机，切卷机', origin: '广东省肇庆市' },
    ],
    files: [
      { source: '外销出口合同+发票+箱单+EXP260008 0703 圣荷西2115.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'WPS 出口工作簿（合同/发票/箱单）' },
      { source: 'EXP260008 捷淞WHSU5760872核对单.pdf', mime: 'application/pdf', description: '船司装箱核对单（柜号 WHSU5760872）' },
    ],
  },
  {
    contractNo: 'EXP260009',
    storeName: '威斯敏',
    portName: '洛杉矶',
    signedAt: '2026-06-15',
    shippedAt: '2026-07-03',
    exchangeRate: 7,
    customsBroker: '捷淞',
    containerLabel: '34-威斯敏',
    totalAmount: 27668,
    totalBoxes: 283,
    grossWeight: 22060.3,
    netWeight: 21775,
    volume: 63.306,
    note: '[WPS_SOURCE] 11-报关记录/2026年7月/外销出口合同+发票+箱单+EXP260009 0703 威斯敏.xlsx',
    items: [
      { name: '铁艺屏风', spec: '2450*340*1540', qty: 2, unit: '套', usd: 5000, hsCode: '8306299000', declaration: '0|0|碳钢管|屏风|未镀贵金属|非铃、钟、锣|无品牌|方管4*4 3*3', boxes: 22, gw: 1528, nw: 1450, vol: 23.93, manufacturer: '福建泉州鼎联工艺品有限公司', purchaseContractNo: 'CG2600020', supplement: null, origin: '泉州市安溪县' },
      { name: '自助餐台', spec: '3148*1611*1150', qty: 1, unit: '套', usd: 7000, hsCode: '8419810000', declaration: '0|0|金属框架配石质台面，配有不锈钢餐槽及保温系统|无品牌|无型号|', boxes: 3, gw: 875, nw: 800, vol: 7.8, manufacturer: '广州布菲厨具制造有限公司', purchaseContractNo: null, supplement: null, origin: '广东省广州市' },
      { name: '1.2米常温调酒台', spec: '1300*700*1000', qty: 3, unit: '台', usd: 400, hsCode: '9403200000', declaration: '0|0|用于搁置调酒器皿|不锈钢|无品牌|1.2米长|', boxes: 3, gw: 180, nw: 170, vol: 1.82, manufacturer: '广州市拓盛餐饮设备有限公司', purchaseContractNo: 'CG2600034', supplement: '1左2右', origin: '广州市番禺区' },
      { name: '金属蜂窝板', spec: '2050*1250*430', qty: 22.8, unit: '平方米', usd: 90, hsCode: '7326909000', declaration: '0|0|非工业用|外层不锈钢板，内层铝蜂窝芯|切割成型并封边|', boxes: 3, gw: 258, nw: 250, vol: 1.161, manufacturer: '广州高邦装饰材料有限公司', purchaseContractNo: 'CG2600036', supplement: null, origin: '广东省佛山市' },
      { name: '酒架', spec: '1980*370*1020', qty: 1, unit: '套', usd: 1400, hsCode: '7326909000', declaration: '0|0|非工业用|不锈钢30*30方管|不锈钢拼接而成，使用钢化玻璃承接|', boxes: 1, gw: 149.3, nw: 145, vol: 4.305, manufacturer: '福建省安溪德荣家居用品有限公司', purchaseContractNo: 'CG2600037', supplement: null, origin: '泉州市安溪县' },
      { name: '隔断', spec: '2900*360*1195', qty: 1, unit: '套', usd: 3000, hsCode: '9403200000', declaration: '0|0|用于餐厅包厢门及空间隔断装饰|不锈钢主题搭配金属装饰条|无品牌|1681*2674mm|', boxes: 1, gw: 530, nw: 460, vol: 1.25, manufacturer: '佛山市南海区筑界空间门窗厂', purchaseContractNo: 'CG2600039', supplement: '包厢隔断门', origin: '广东省广州市' },
      { name: '瓷砖', spec: '800*800*40', qty: 232, unit: '平方米', usd: 13, hsCode: '6907219000', declaration: '0|0|铺面砖|800*800|0.003|无品牌|深灰色', boxes: 250, gw: 18540, nw: 18500, vol: 23.04, manufacturer: null, purchaseContractNo: null, supplement: '370箱800砖，还有50箱长砖', origin: '佛山市禅城区' },
    ],
    files: [
      { source: '外销出口合同+发票+箱单+EXP260009 0703 威斯敏.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', description: 'WPS 出口工作簿（合同/发票/箱单）' },
    ],
  },
];

// 0.2 EXP260004 头字段修复（源：外销出口合同+发票+箱单+EXP260004 0427 圣荷西2115.xlsx）
const EXP260004_FIX = {
  contractNo: 'EXP260004',
  status: 'SHIPPED',
  signedAt: '2026-04-15',
  totalAmount: 42000,
  totalBoxes: 28,
  grossWeight: 7068,
  netWeight: 6158,
  volume: 44.5,
  containerLabel: '30-圣荷西2115',
  // 源合同只有 自助餐台1@6000 + 小型饭团机4@9000，圣荷西2115 店；删除店名写作「圣荷西」的重复行
  dedupeItems: [
    { name: '自助餐台', qty: 1, sellingPrice: 6000, storeName: '圣荷西' },
    { name: '小型饭团机', qty: 4, sellingPrice: 9000, storeName: '圣荷西' },
  ],
};

// 0.3 补建采购合同（源：招行对账单出现但库中缺失）
const NEW_PURCHASE_CONTRACTS = [
  { contractNo: 'CG2600035', supplierName: '六安创艺工艺品有限公司', totalAmount: 4394, taxRate: 13, note: '从招行 2026-05 对账单补录（CG2600035全款 4394 元，2026-05-15 支付）；合同明细待补充' },
  { contractNo: 'CG2600040', supplierName: '中山市寰亚照明电器厂（个体工商户）', totalAmount: 0, taxRate: 13, note: '从招行 2026-06 对账单补录（CG2600040定金 6060 元，2026-06-15 支付）；合同总额与明细待补充' },
];

// 0.4 银行流水付款登记（源：招行对公 CNY/USD 账户 2026-05/06 月对账单；已剔除被退回的转账、工资、税款、报销、办公费、网银费、结息、股东周转）
const BANK_PAYMENTS = [
  // ---- 2026-05（账单 TransactionBill20260601085324，人民币账户）----
  { key: 'BANKFLOW-20260506-5140039113', date: '2026-05-06', amount: 12585, contractNo: 'CG2600029', note: 'CG2600029定金｜广州市宝泰餐具有限公司（招行20260506 票据5140039113）' },
  { key: 'BANKFLOW-20260506-5140039114', date: '2026-05-06', amount: 1165, contractNo: 'CG2600030', note: '薄饼架全款｜阳江市江城区浩泰工贸有限公司（招行20260506 票据5140039114）' },
  { key: 'BANKFLOW-20260507-5140039115', date: '2026-05-07', amount: 2690.8, contractNo: 'CG2600026', note: 'CG2600026尾款｜广东东纳窗帘有限公司（招行20260507 票据5140039115）' },
  { key: 'BANKFLOW-20260508-5140039116', date: '2026-05-08', amount: 3600, contractNo: null, note: '密胺盘款｜上海宗介酒店设备用品有限公司（招行20260508 票据5140039116，未匹配到采购合同）' },
  { key: 'BANKFLOW-20260508-5140039117', date: '2026-05-08', amount: 26465, contractNo: 'CG2600029', note: 'CG2600029尾款｜广州市宝泰餐具有限公司（招行20260508 票据5140039117）' },
  { key: 'BANKFLOW-20260508-5140039118', date: '2026-05-08', amount: 7840, contractNo: 'CG2600017', note: 'CG2600017部分尾款｜深圳市秦川照明有限公司（招行20260508 票据5140039118）' },
  { key: 'BANKFLOW-20260508-5140039119', date: '2026-05-08', amount: 3618.6, contractNo: null, note: '收银台板｜泉州市新兴石材工艺有限公司（招行20260508 票据5140039119，未匹配到采购合同）' },
  { key: 'BANKFLOW-20260509-5140039120', date: '2026-05-09', amount: 1905, contractNo: 'CG2600028', note: 'CG2600028定金｜银川市兴庆区朋创意酒店用品店（招行20260509 票据5140039120）' },
  { key: 'BANKFLOW-20260513-5140039121', date: '2026-05-13', amount: 245, contractNo: 'CG2600033', note: '烧烤钢签货款｜河北科魁五金制品有限公司（招行20260513 票据5140039121）' },
  { key: 'BANKFLOW-20260513-5145337802', date: '2026-05-13', amount: 979.5, contractNo: 'CG2600032', note: 'CG2600032定金｜湖北省平驰潇栈商贸有限公司（招行20260513 票据5145337802）' },
  { key: 'BANKFLOW-20260513-5145337803', date: '2026-05-13', amount: 38000, contractNo: 'CG2600031', note: '切肉机款｜北京南常肉食机械有限公司（招行20260513 票据5145337803）' },
  { key: 'BANKFLOW-20260513-5145337804', date: '2026-05-13', amount: 3870, contractNo: 'CG2600034', note: 'CG2600034定金｜广州市拓盛餐饮设备有限公司（招行20260513 票据5145337804）' },
  { key: 'BANKFLOW-20260514-5145337805', date: '2026-05-14', amount: 2285.5, contractNo: 'CG2600032', note: 'CG2600032尾款｜湖北省平驰潇栈商贸有限公司（招行20260514 票据5145337805）' },
  { key: 'BANKFLOW-20260514-5145337806', date: '2026-05-14', amount: 4445, contractNo: 'CG2600028', note: 'CG2600028尾款｜银川市兴庆区朋创意酒店用品店（招行20260514 票据5145337806）' },
  { key: 'BANKFLOW-20260515-5145337810', date: '2026-05-15', amount: 4394, contractNo: 'CG2600035', note: 'CG2600035全款｜六安创艺工艺品有限公司（招行20260515 票据5145337810；前两笔转账被支付平台退回，仅登记最终成功一笔）' },
  { key: 'BANKFLOW-20260515-5145337808', date: '2026-05-15', amount: 3526.5, contractNo: 'CG2600037', note: 'CG2600037定金｜福建省安溪德荣家居用品有限公司（招行20260515 票据5145337808）' },
  { key: 'BANKFLOW-20260518-5145337811', date: '2026-05-18', amount: 2600, contractNo: 'CG2600027', note: 'CG2600027全款｜福建裕豪门业有限公司（招行20260518 票据5145337811）' },
  { key: 'BANKFLOW-20260518-5146824002', date: '2026-05-18', amount: 6101.7, contractNo: 'CG2600038', note: 'CG2600038定金｜中山市鼎仁照明科技有限公司（招行20260518 票据5146824002）' },
  { key: 'BANKFLOW-20260518-5146824003', date: '2026-05-18', amount: 5314.5, contractNo: 'CG2600036', note: 'CG2600036定金｜广州高邦装饰材料有限公司（招行20260518 票据5146824003）' },
  { key: 'BANKFLOW-20260519-5146824004', date: '2026-05-19', amount: 7840, contractNo: 'CG2600017', note: 'CG2600017尾款｜深圳市秦川照明有限公司（招行20260519 票据5146824004）' },
  // ---- 2026-06（账单 TransactionBill20260703082622，人民币账户）----
  { key: 'BANKFLOW-20260601-5203062314', date: '2026-06-01', amount: 10416, contractNo: 'CG2600039', note: 'CG2600039定金｜佛山市南海区筑界空间门窗厂（招行20260601 票据5203062314；此前两笔因收款账号异常被退回，仅登记最终成功一笔）' },
  { key: 'BANKFLOW-20260601-5203062313', date: '2026-06-01', amount: 2080, contractNo: null, note: '货运费｜广州市鹏利国际货运代理有限公司（招行20260601 票据5203062313）' },
  { key: 'BANKFLOW-20260612-5203062316', date: '2026-06-12', amount: 1450, contractNo: null, note: '熏蒸费｜东莞市瑞盈害虫防治有限公司（招行20260612 票据5203062316）' },
  { key: 'BANKFLOW-20260615-5203062317', date: '2026-06-15', amount: 6060, contractNo: 'CG2600040', note: 'CG2600040定金｜中山市寰亚照明电器厂（招行20260615 票据5203062317）' },
  { key: 'BANKFLOW-20260623-5203062319', date: '2026-06-23', amount: 58946, contractNo: 'CG2600014', note: 'CG2600014威斯敏款结｜云浮市锦德石业有限公司（招行20260623 票据5203062319）' },
  { key: 'BANKFLOW-20260630-5214812590', date: '2026-06-30', amount: 5394, contractNo: 'CG2600014', note: '补威斯敏款｜云浮市锦德石业有限公司（招行20260630 票据5214812590）' },
  { key: 'BANKFLOW-20260630-5214812591', date: '2026-06-30', amount: 3526.5, contractNo: 'CG2600037', note: 'CG2600037尾款｜福建省安溪德荣家居用品有限公司（招行20260630 票据5214812591）' },
  { key: 'BANKFLOW-20260630-5214812592', date: '2026-06-30', amount: 14237.3, contractNo: 'CG2600038', note: 'CG2600038尾款｜中山市鼎仁照明科技有限公司（招行20260630 票据5214812592）' },
  { key: 'BANKFLOW-20260630-5214812593', date: '2026-06-30', amount: 70000, contractNo: 'CG2500095', note: 'CG2500095尾款清｜上海雅称广告装潢设计有限公司（招行20260630 票据5214812593）' },
];

// 0.5 出口收款（源：招行美元账户对账单；沿用 INCOME 收款池惯例，待人工分配到合同）
const INCOME_RECEIPTS = [
  { key: 'BANKFLOW-20260520-USD-IN', date: '2026-05-20', amount: 54995, currency: 'USD', customerName: 'SP FOOD TRADING LLC', note: '年度:2026 | 用途:收入 | 招行美元账户 20260520 中心收汇（汇入汇款流程解付）' },
];

// ==================== 工具函数 ====================

/**
 * 职责：将日期字符串转为 UTC 零点 Date（与库中既有数据口径一致）
 * @param {string} value - YYYY-MM-DD
 * @returns {Date}
 */
const toDate = (value) => new Date(`${value}T00:00:00.000Z`);

/**
 * 职责：计算文件 sha1 前 12 位，用于上传文件命名去重
 * @param {string} filePath - 文件绝对路径
 * @returns {string}
 */
const sha1Prefix = (filePath) => crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex').slice(0, 12);

const summary = { products: [], contracts: [], payments: [], purchaseContracts: [], files: [], warnings: [] };

/**
 * 职责：按报关名 upsert 商品档案，补齐缺失的 HS 编码/申报要素/规格/单位
 * 思路：
 *   1. 精确匹配 customsName；命中则只回填空字段（不覆盖人工维护值）
 *   2. 未命中则新建
 * @param {object} item - 出口明细行
 * @returns {string} productId
 */
async function upsertProduct(item) {
  const existing = await prisma.product.findFirst({ where: { customsName: item.name } });
  if (existing) {
    const patch = {};
    if (!existing.hsCode && item.hsCode) patch.hsCode = item.hsCode;
    if (!existing.declaration && item.declaration) patch.declaration = item.declaration;
    if (!existing.specification && item.spec) patch.specification = item.spec;
    if (Object.keys(patch).length > 0) {
      summary.products.push(`回填 ${item.name}: ${Object.keys(patch).join('/')}`);
      if (APPLY) await prisma.product.update({ where: { id: existing.id }, data: patch });
    }
    return existing.id;
  }
  summary.products.push(`新建 ${item.name} (HS ${item.hsCode})`);
  if (!APPLY) return `dry-run-${item.name}`;
  const created = await prisma.product.create({
    data: {
      customsName: item.name,
      specification: item.spec,
      unit: item.unit,
      hsCode: item.hsCode,
      declaration: item.declaration,
    },
  });
  return created.id;
}

/**
 * 职责：导入单张出口合同（头 + 销售明细 + 装箱明细 + 附件）
 * 思路：
 *   0. 港口/门店前置校验
 *   1. upsert 合同头（保留已有 receivedAmount）
 *   2. 删除旧 items/packingItems 后按源数据重建（仅限本脚本管理的合同）
 *   3. 注册附件（拷贝到 uploads/sales-contracts + 建 SalesContractFile 行）
 * @param {object} spec - EXPORT_CONTRACTS 中的合同定义
 */
async function importExportContract(spec) {
  const port = await prisma.port.findUnique({ where: { name: spec.portName } });
  const store = await prisma.store.findUnique({ where: { name: spec.storeName } });
  if (!port || !store) {
    summary.warnings.push(`${spec.contractNo}: 港口(${spec.portName})或门店(${spec.storeName})不存在，跳过`);
    return;
  }

  const existing = await prisma.salesContract.findUnique({
    where: { contractNo: spec.contractNo },
    include: { _count: { select: { items: true, packingItems: true } } },
  });

  const headerData = {
    totalAmount: spec.totalAmount,
    exchangeRate: spec.exchangeRate,
    status: 'SHIPPED',
    signedAt: toDate(spec.signedAt),
    shippedAt: toDate(spec.shippedAt),
    portId: port.id,
    totalBoxes: spec.totalBoxes,
    grossWeight: spec.grossWeight,
    netWeight: spec.netWeight,
    volume: spec.volume,
    customsBroker: spec.customsBroker,
    containerLabel: spec.containerLabel,
    isFumigated: false,
    note: spec.note,
  };

  let contractId = existing?.id || null;
  if (existing) {
    summary.contracts.push(`更新 ${spec.contractNo}（原 items:${existing._count.items} packing:${existing._count.packingItems} → 重建 ${spec.items.length}+${spec.items.length}）`);
    if (APPLY) {
      await prisma.salesContract.update({ where: { id: existing.id }, data: headerData });
      await prisma.packingItem.deleteMany({ where: { salesContractId: existing.id } });
      await prisma.salesItem.deleteMany({ where: { salesContractId: existing.id } });
    }
  } else {
    summary.contracts.push(`新建 ${spec.contractNo}（${spec.items.length} 行明细，总额 $${spec.totalAmount}，${spec.storeName} / ${spec.portName}）`);
    if (APPLY) {
      const created = await prisma.salesContract.create({ data: { contractNo: spec.contractNo, ...headerData } });
      contractId = created.id;
    }
  }

  for (const item of spec.items) {
    const productId = await upsertProduct(item);
    if (!APPLY) continue;
    await prisma.salesItem.create({
      data: {
        salesContractId: contractId,
        productId,
        storeId: store.id,
        quantity: item.qty,
        unit: item.unit,
        costPrice: 0,
        sellingPrice: item.usd,
        specification: item.spec,
      },
    });
    await prisma.packingItem.create({
      data: {
        salesContractId: contractId,
        productId,
        storeId: store.id,
        quantity: item.qty,
        unit: item.unit,
        boxes: item.boxes,
        grossWeight: item.gw,
        netWeight: item.nw,
        volume: item.vol,
        unitPrice: item.usd,
        totalPrice: Number((item.usd * item.qty).toFixed(2)),
        supplement: item.supplement,
        specification: item.spec,
        manufacturer: item.manufacturer,
        purchaseContractNo: item.purchaseContractNo,
        note: `[WPS_SOURCE] ${spec.contractNo} 箱单；货源地 ${item.origin}`,
      },
    });
  }

  // 附件注册（幂等：同合同同文件名跳过）
  for (const file of spec.files) {
    const sourcePath = path.join(SOURCE_DIR, file.source);
    if (!fs.existsSync(sourcePath)) {
      summary.warnings.push(`${spec.contractNo}: 附件源文件缺失 ${file.source}`);
      continue;
    }
    if (APPLY) {
      const dup = await prisma.salesContractFile.findFirst({ where: { salesContractId: contractId, fileName: file.source } });
      if (dup) continue;
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      const ext = path.extname(file.source);
      const targetName = `WPS-${spec.contractNo}-${sha1Prefix(sourcePath)}${ext}`;
      fs.copyFileSync(sourcePath, path.join(UPLOAD_DIR, targetName));
      await prisma.salesContractFile.create({
        data: {
          salesContractId: contractId,
          fileName: file.source,
          filePath: `sales-contracts/${targetName}`,
          fileType: file.mime,
          mimeType: file.mime,
          fileSize: fs.statSync(sourcePath).size,
          description: file.description,
        },
      });
    }
    summary.files.push(`${spec.contractNo} ← ${file.source}`);
  }
}

/**
 * 职责：修复 EXP260004 头字段并清理重复销售行
 * 思路：
 *   1. 头字段以源工作簿为准（状态/总额/柜号/汇总指标）
 *   2. 仅删除「与保留行同名同价、门店写作圣荷西、且无库存引用」的重复行
 */
async function fixExp260004() {
  const contract = await prisma.salesContract.findUnique({
    where: { contractNo: EXP260004_FIX.contractNo },
    include: { items: { include: { product: true, store: true, inventories: true } } },
  });
  if (!contract) {
    summary.warnings.push('EXP260004 不存在，跳过修复');
    return;
  }

  summary.contracts.push(`修复 EXP260004 头字段（status ${contract.status}→SHIPPED，总额 ${contract.totalAmount}→42000，柜号 ${contract.containerLabel}→30-圣荷西2115）`);
  if (APPLY) {
    await prisma.salesContract.update({
      where: { id: contract.id },
      data: {
        status: EXP260004_FIX.status,
        signedAt: toDate(EXP260004_FIX.signedAt),
        totalAmount: EXP260004_FIX.totalAmount,
        totalBoxes: EXP260004_FIX.totalBoxes,
        grossWeight: EXP260004_FIX.grossWeight,
        netWeight: EXP260004_FIX.netWeight,
        volume: EXP260004_FIX.volume,
        containerLabel: EXP260004_FIX.containerLabel,
      },
    });
  }

  for (const dupe of EXP260004_FIX.dedupeItems) {
    const target = contract.items.find((item) => (
      item.product.customsName === dupe.name
      && item.quantity === dupe.qty
      && item.sellingPrice === dupe.sellingPrice
      && item.store?.name === dupe.storeName
    ));
    if (!target) continue;
    if (target.inventories.length > 0) {
      summary.warnings.push(`EXP260004 重复行 ${dupe.name}(店:${dupe.storeName}) 有库存引用，保留不删`);
      continue;
    }
    summary.contracts.push(`删除 EXP260004 重复销售行 ${dupe.name}（店名误写为 ${dupe.storeName}）`);
    if (APPLY) await prisma.salesItem.delete({ where: { id: target.id } });
  }
}

/**
 * 职责：补建银行流水中出现但库里缺失的采购合同
 */
async function createMissingPurchaseContracts() {
  for (const spec of NEW_PURCHASE_CONTRACTS) {
    const existing = await prisma.purchaseContract.findUnique({ where: { contractNo: spec.contractNo } });
    if (existing) continue;
    let supplier = await prisma.supplier.findFirst({ where: { name: spec.supplierName } });
    if (!supplier) {
      summary.purchaseContracts.push(`新建供应商 ${spec.supplierName}`);
      if (APPLY) {
        supplier = await prisma.supplier.create({ data: { name: spec.supplierName } });
      }
    }
    summary.purchaseContracts.push(`补建 ${spec.contractNo}（${spec.supplierName}，总额 ${spec.totalAmount}）`);
    if (APPLY) {
      await prisma.purchaseContract.create({
        data: {
          contractNo: spec.contractNo,
          supplierId: supplier.id,
          totalAmount: spec.totalAmount,
          taxRate: spec.taxRate,
          status: 'SIGNED',
          note: spec.note,
        },
      });
    }
  }
}

/**
 * 职责：登记银行流水付款（PAYABLE）与出口收款（INCOME），并重算受影响采购合同的 paidAmount / 状态
 * 思路：
 *   1. 按 idempotencyKey 去重写入
 *   2. 汇总受影响合同，重算 paidAmount
 *   3. DRAFT 且有付款的合同推进为 SIGNED（signedAt 取首笔付款日）
 */
async function registerPayments() {
  const affectedContractNos = new Set();

  for (const pay of BANK_PAYMENTS) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: pay.key } });
    if (existing) continue;

    let purchaseContractId = null;
    if (pay.contractNo) {
      const contract = await prisma.purchaseContract.findUnique({ where: { contractNo: pay.contractNo } });
      if (!contract) {
        summary.warnings.push(`付款 ${pay.key} 对应合同 ${pay.contractNo} 不存在，登记为未关联付款`);
      } else {
        purchaseContractId = contract.id;
        affectedContractNos.add(pay.contractNo);
      }
    }

    summary.payments.push(`付款 ${pay.date} ¥${pay.amount} → ${pay.contractNo || '未关联'}`);
    if (APPLY) {
      await prisma.payment.create({
        data: {
          idempotencyKey: pay.key,
          type: 'PAYABLE',
          purchaseContractId,
          amount: pay.amount,
          currency: 'CNY',
          paymentMethod: '银行转账',
          paymentDate: toDate(pay.date),
          note: pay.note,
        },
      });
    }
  }

  for (const receipt of INCOME_RECEIPTS) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: receipt.key } });
    if (existing) continue;
    summary.payments.push(`收款 ${receipt.date} $${receipt.amount}（${receipt.customerName}，入待分配池）`);
    if (APPLY) {
      await prisma.payment.create({
        data: {
          idempotencyKey: receipt.key,
          type: 'INCOME',
          amount: receipt.amount,
          currency: receipt.currency,
          customerName: receipt.customerName,
          paymentMethod: '银行转账',
          paymentDate: toDate(receipt.date),
          note: receipt.note,
        },
      });
    }
  }

  if (!APPLY) return;

  // 重算 paidAmount 并推进状态
  for (const contractNo of affectedContractNos) {
    const contract = await prisma.purchaseContract.findUnique({ where: { contractNo }, include: { payments: { orderBy: { paymentDate: 'asc' } } } });
    if (!contract) continue;
    const paid = contract.payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const patch = { paidAmount: Number(paid.toFixed(2)) };
    if (contract.status === 'DRAFT' && contract.payments.length > 0) {
      patch.status = 'SIGNED';
      patch.signedAt = contract.signedAt || contract.payments[0].paymentDate;
    }
    await prisma.purchaseContract.update({ where: { id: contract.id }, data: patch });
  }
}

/**
 * 职责：主流程编排
 */
async function main() {
  console.log(APPLY ? '=== 执行模式（写库） ===' : '=== 演练模式（dry-run，加 --apply 才写库） ===');

  // 1. 补建缺失采购合同（付款登记依赖）
  await createMissingPurchaseContracts();
  // 2. 出口合同导入
  for (const spec of EXPORT_CONTRACTS) {
    await importExportContract(spec);
  }
  // 3. EXP260004 修复
  await fixExp260004();
  // 4. 付款/收款登记
  await registerPayments();

  console.log('\n--- 商品 ---');
  summary.products.forEach((line) => console.log(' ', line));
  console.log('--- 出口合同 ---');
  summary.contracts.forEach((line) => console.log(' ', line));
  console.log('--- 采购合同 ---');
  summary.purchaseContracts.forEach((line) => console.log(' ', line));
  console.log(`--- 付款/收款（${summary.payments.length} 笔） ---`);
  summary.payments.forEach((line) => console.log(' ', line));
  console.log('--- 附件 ---');
  summary.files.forEach((line) => console.log(' ', line));
  if (summary.warnings.length) {
    console.log('--- 警告 ---');
    summary.warnings.forEach((line) => console.log(' !', line));
  }
  console.log('\n完成。');
}

main()
  .catch((error) => {
    console.error('导入失败:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
