/**
 * 导入出货汇总 CSV → SalesContract + PackingItem + Product + Supplier + Store
 *
 * Input:  /Users/helena/Cursor/jiesong_system/出货汇总0315_补充.csv
 * Output: 数据库中完整的出货记录（SalesContract / PackingItem 体系）
 *
 * 规则：
 *  - 每行 = 一个 PackingItem
 *  - 按合同号（col16）分组生成 SalesContract（一合同号一条）
 *  - 无合同号 + 有门店 → 生成临时草稿合同 PENDING-{门店名}
 *  - 无合同号 + 无门店/无商品 → 跳过
 *  - 多门店（含"和"/"、"）→ 拆成多个 PackingItem，各指向一个门店
 *  - 港口映射到现有 Port 表（不存在则 null）
 *  - 是否熏蒸列实际已被当备注用，跳过不导入
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// ─── 路径 ──────────────────────────────────────────────
const CSV_PATH = path.resolve(__dirname, '../../出货汇总0315_补充.csv');

// ─── 港口名 → ID 映射（运行时填充）───────────────────────
let PORT_MAP = {};

// ─── 解析 CSV 函数 ─────────────────────────────────────
/**
 * 解析 CSV 行（处理引号内逗号）
 */
function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * 将 "2025/8/15" 或 "2025-08-15" 转 Date
 */
function parseDate(str) {
  if (!str) return null;
  const s = str.trim();
  if (!s) return null;
  const normalized = s.replace(/\//g, '-');
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * 解析数字（空或非数字返回 null）
 */
function parseFloat2(str) {
  if (!str) return null;
  const n = parseFloat(str.trim().replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

function parseInt2(str) {
  if (!str) return null;
  const n = parseInt(str.trim().replace(/,/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * 拆分多门店名（如 "圣荷西2115和625" → ["圣荷西2115", "圣荷西625"]）
 * 处理：和、与、&、、（顿号）、+
 */
function splitStoreNames(raw) {
  if (!raw) return [];
  const s = raw.trim();
  if (!s) return [];

  // 先用分隔符切
  const parts = s.split(/[和与&、+,，]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return [s];

  // 如果后一段是纯数字（如 "625"），尝试拼接上一段的前缀
  const result = [];
  let prevFull = '';
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (/^\d+$/.test(p) && prevFull) {
      // 纯数字后缀：取上一个名字的非数字前缀拼接
      const prefix = prevFull.replace(/\d+$/, '');
      result.push(prefix + p);
    } else {
      result.push(p);
      prevFull = p;
    }
  }
  return result;
}

// ─── 门店→默认港口映射 ───────────────────────────────
// 根据历史出货数据统计，每个门店最常见的目的港
const STORE_PORT_MAP = {
  '禧瑞都': '洛杉矶',
  '安纳汉姆': '洛杉矶',
  'Burbank': '洛杉矶',
  'Westminster': '洛杉矶',
  '威斯敏': '洛杉矶',
  '圣荷西2115': 'Oakland',
  '圣荷西': 'Oakland',
  '圣荷西625': 'Oakland',
  '米尔皮塔': 'Oakland',
  '红木城': 'Oakland',
  '圣马特店': 'Oakland',
  'Sunnyvale': 'Oakland',
  '密歇根': '密歇根',
};

// ─── 缓存避免重复创建 ────────────────────────────────
const productCache = {};   // customsName → Product
const supplierCache = {};  // name → Supplier
const storeCache = {};     // name → Store
const contractCache = {};  // contractNo → SalesContract

// ─── 辅助：获取或创建 ────────────────────────────────
async function upsertProduct(customsName, supplement, hsCode, declaration) {
  const key = customsName;
  if (productCache[key]) return productCache[key];

  let p = await prisma.product.findFirst({ where: { customsName } });
  if (!p) {
    p = await prisma.product.create({
      data: {
        customsName,
        description: supplement || null,
        hsCode: hsCode || null,
        declaration: declaration || null,
      },
    });
  }
  productCache[key] = p;
  return p;
}

async function upsertSupplier(name) {
  if (!name) return null;
  const key = name;
  if (supplierCache[key]) return supplierCache[key];

  let s = await prisma.supplier.findFirst({ where: { name } });
  if (!s) {
    s = await prisma.supplier.create({ data: { name } });
  }
  supplierCache[key] = s;
  return s;
}

async function upsertStore(name, fallbackPortName) {
  if (!name) return null;
  const key = name;
  if (storeCache[key]) return storeCache[key];

  let s = await prisma.store.findFirst({ where: { name } });
  if (!s) {
    // 查找港口：优先用静态映射，其次用行内港口
    const portName = STORE_PORT_MAP[name] || fallbackPortName || '洛杉矶';
    const portId = PORT_MAP[portName] || PORT_MAP['洛杉矶'];
    s = await prisma.store.create({
      data: { name, portId },
    });
  }
  storeCache[key] = s;
  return s;
}

async function upsertContract({
  contractNo,
  portName,
  shippedAt,
  customsBroker,
  containerLabel,
  isPaid,
}) {
  const key = contractNo;
  if (contractCache[key]) return contractCache[key];

  const portId = PORT_MAP[portName] || null;
  const isPending = contractNo.startsWith('PENDING-');

  let c = await prisma.salesContract.findUnique({ where: { contractNo } });
  if (!c) {
    c = await prisma.salesContract.create({
      data: {
        contractNo,
        exchangeRate: 7.2, // 默认汇率，可后续修改
        status: isPending ? 'DRAFT' : 'SHIPPED',
        portId,
        shippedAt: shippedAt || null,
        customsBroker: customsBroker || null,
        containerLabel: containerLabel || null,
      },
    });
  }
  contractCache[key] = c;
  return c;
}

// ─── 主逻辑 ──────────────────────────────────────────
async function main() {
  // 0. 加载港口映射
  const ports = await prisma.port.findMany();
  for (const p of ports) {
    PORT_MAP[p.name] = p.id;
  }
  console.log('港口映射:', PORT_MAP);

  // 1. 读取 CSV
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim());
  const header = parseCSVLine(lines[0]);
  console.log(`读取 CSV：${lines.length - 1} 行数据`);

  // 列索引（0-based）
  const COL = {
    seq:            0,   // 序号
    customsName:    1,   // 报关名
    supplement:     2,   // 商品补充信息
    store:          3,   // 门店
    port:           4,   // 港口
    quantity:       5,   // 报关数量
    unit:           6,   // 单位
    manufacturer:   7,   // 厂家
    specification:  8,   // 规格
    boxes:          9,   // 箱数
    grossWeight:    10,  // 毛重
    netWeight:      11,  // 净重
    volume:         12,  // 体积
    containerLabel: 13,  // 柜子编号
    shippedAt:      14,  // 出货日期
    contractNo:     15,  // 合同号
    customsBroker:  16,  // 报关公司
    isPaid:         17,  // 是否付款
    purchaseContractNo: 18, // 购销合同号
    supplierName:   19,  // 供应商名称
    purchaseCost:   20,  // 采购金额
    invoiceNo:      21,  // 发票号码
    note:           22,  // 备注
    // col 23 = 是否熏蒸（已被当备注用，跳过）
    // col 24 = 是否报出口退税
    hsCode:         25,  // HS编码
    declaration:    26,  // 申报要素
    unitPrice:      27,  // 美元单价
    hsMatchConf:    28,  // 匹配置信度
    hsMatchMethod:  29,  // 匹配方式
  };

  let imported = 0;
  let skipped = 0;
  const skipLog = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const seq = cols[COL.seq] || `row-${i + 1}`;
    const customsName = cols[COL.customsName];
    const storeRaw    = cols[COL.store];
    let contractNoRaw = cols[COL.contractNo];

    // 1.1 跳过：无商品名
    if (!customsName || customsName.trim() === '') {
      skipLog.push(`行${i + 1}: 无商品名，跳过`);
      skipped++;
      continue;
    }

    // 1.2 无合同号处理
    if (!contractNoRaw || contractNoRaw.trim() === '') {
      if (!storeRaw || storeRaw.trim() === '') {
        skipLog.push(`行${i + 1} [${customsName}]: 无合同号且无门店，跳过`);
        skipped++;
        continue;
      }
      // 有门店 → 生成草稿合同
      const firstStore = splitStoreNames(storeRaw)[0] || storeRaw;
      contractNoRaw = `PENDING-${firstStore.trim()}`;
    }

    const contractNo = contractNoRaw.trim();

    // 1.3 解析各字段
    const supplement      = cols[COL.supplement] || null;
    const portName        = cols[COL.port] || '';
    const quantity        = parseFloat2(cols[COL.quantity]) ?? 0;
    const unit            = cols[COL.unit] || null;
    const manufacturer    = cols[COL.manufacturer] || null;
    const specification   = cols[COL.specification] || null;
    const boxes           = parseInt2(cols[COL.boxes]);
    const grossWeight     = parseFloat2(cols[COL.grossWeight]);
    const netWeight       = parseFloat2(cols[COL.netWeight]);
    const volume          = parseFloat2(cols[COL.volume]);
    const containerLabel  = cols[COL.containerLabel] || null;
    const shippedAt       = parseDate(cols[COL.shippedAt]);
    const customsBroker   = cols[COL.customsBroker] || null;
    const purchaseContractNo = cols[COL.purchaseContractNo] || null;
    const supplierName    = cols[COL.supplierName] || null;
    const purchaseCost    = parseFloat2(cols[COL.purchaseCost]);
    const invoiceNo       = cols[COL.invoiceNo] || null;
    const note            = cols[COL.note] || null;
    const hsCode          = cols[COL.hsCode] || null;
    const declaration     = cols[COL.declaration] || null;
    const unitPrice       = parseFloat2(cols[COL.unitPrice]);
    const hsMatchConf     = parseFloat2(cols[COL.hsMatchConf]);
    const hsMatchMethod   = cols[COL.hsMatchMethod] || null;

    // 港口名处理（多港口取第一个）
    const portNameClean = portName.split(/和|与|&/)[0].trim();

    // 1.4 解析门店列表
    const storeNames = splitStoreNames(storeRaw);

    // 1.5 Upsert 基础实体
    const product  = await upsertProduct(customsName.trim(), supplement, hsCode, declaration);
    const supplier = await upsertSupplier(supplierName ? supplierName.trim() : null);
    const contract = await upsertContract({
      contractNo,
      portName: portNameClean,
      shippedAt,
      customsBroker,
      containerLabel,
    });

    // 1.6 为每个门店创建一条 PackingItem
    const targetStores = storeNames.length > 0 ? storeNames : [null];
    for (const sName of targetStores) {
      const store = sName ? await upsertStore(sName.trim(), portNameClean) : null;

      await prisma.packingItem.create({
        data: {
          salesContractId:    contract.id,
          productId:          product.id,
          storeId:            store?.id || null,
          quantity,
          unit,
          boxes,
          grossWeight,
          netWeight,
          volume,
          unitPrice,
          totalPrice:         unitPrice != null ? unitPrice * quantity : null,
          supplement,
          specification,
          manufacturer,
          invoiceNo,
          purchaseContractNo,
          purchaseCost,
          hsMatchConfidence:  hsMatchConf,
          hsMatchMethod,
          note,
        },
      });
    }

    imported++;
    if (imported % 50 === 0) {
      process.stdout.write(`\r  已处理 ${imported} 行...`);
    }
  }

  console.log(`\n\n=== 导入完成 ===`);
  console.log(`导入：${imported} 行`);
  console.log(`跳过：${skipped} 行`);
  if (skipLog.length) {
    console.log('\n跳过明细：');
    skipLog.forEach((l) => console.log(' ', l));
  }

  // 汇总
  console.log('\n=== 数据库统计 ===');
  console.log('SalesContract:', await prisma.salesContract.count());
  console.log('PackingItem:', await prisma.packingItem.count());
  console.log('Product:', await prisma.product.count());
  console.log('Supplier:', await prisma.supplier.count());
  console.log('Store:', await prisma.store.count());

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
