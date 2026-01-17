/**
 * Input: 出货汇总CSV文件
 * Output: 清洗后的数据导入SQLite数据库
 * Pos: 数据导入脚本，一次性历史数据迁移工具
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const Papa = require('papaparse');

const prisma = new PrismaClient();

// ==================== 配置 ====================

// 港口映射
const PORT_MAP = {
  '洛杉矶': { name: '洛杉矶', code: 'LA' },
  'Oakland': { name: 'Oakland', code: 'OAK' },
  '密歇根': { name: '密歇根', code: 'MI' },
};

// 报关公司枚举
const CUSTOMS_BROKERS = ['捷淞', '埋单', '其他厂家报关', '不报关', '合并报关'];

// 供应商昵称映射（基于文档）
const SUPPLIER_ALIASES = {
  '黎总': '佛山陶瓷有限公司',
  '叶总': '叶总餐饮设备',
  '郭总': '郭总金属制品',
  '阿宗': '振宗石材',
  '刘总': '刘总家具',
  '淘宝': '淘宝在线采购',
  '何总布菲传奇': '布菲传奇设备',
  '涂经理': '涂经理机械公司',
  '南常': '南常厨房设备',
  '徐州玻璃瓶': '徐州玻璃瓶厂',
  '深圳陈小姐': '深圳照明公司',
  '深圳杨总': '深圳电子公司',
  '泉州林总': '泉州工艺品厂',
  '新兴石材': '新兴石材厂',
  '王总定制': '王总餐具厂',
  '王总': '王总餐具厂',
  '台德': '台德餐具公司',
  '廊坊秀儿商贸': '廊坊秀儿商贸有限公司',
  '传送带': '传送带设备厂',
  '君耀-淘宝': '淘宝君耀店铺',
  '广东厂家': '广东生产厂',
  '山东厂家': '山东生产厂',
  '炜艺': '炜艺屏风厂',
  '水晶屏风厂家': '水晶屏风厂',
  '雾化壁炉': '雾化壁炉厂',
  '定制提盘': '定制提盘厂',
  '玮杰': '玮杰家具',
  '大汉焊接': '大汉焊接设备',
  '佛山': '佛山金属制品',
  '亚克力定制': '亚克力定制厂',
  '泉州定制': '泉州定制厂',
  '上海定制': '上海定制厂',
  '新厂家窗帘': '新厂家窗帘',
  '外运输': '外部运输',
  '物流': '物流公司',
  'zeqin': 'zeqin供应商',
  '酒架定制': '酒架定制厂',
  '舅妈联系': '舅妈联系供应商',
  '新派': '新派包装',
  '阿珍贵州': '阿珍贵州食品',
  '重庆新': '重庆新食品',
  '厦门': '厦门石材公司',
  '蔡': '蔡氏金属',
  '黎总-马赛克': '佛山陶瓷有限公司',
};

// ==================== 辅助函数 ====================

/**
 * 职责：解析金额字段（去除逗号、空格、引号）
 */
function parseAmount(value) {
  if (!value || value === '') return null;
  const cleaned = String(value)
    .replace(/"/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * 职责：解析数量字段（处理异常字符）
 */
function parseQuantity(value) {
  if (!value || value === '') return null;
  // 去除中文括号等异常字符
  const cleaned = String(value)
    .replace(/（/g, '')
    .replace(/）/g, '')
    .replace(/=/g, '')
    .replace(/\s/g, '')
    .trim();
  
  // 处理特殊格式如 "27.36（报75平）"
  const match = cleaned.match(/^[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

/**
 * 职责：解析日期字段
 */
function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  try {
    // 处理 "2024/5/30" 格式
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/**
 * 职责：标准化单位
 */
function standardizeUnit(unit) {
  if (!unit) return null;
  return unit
    .replace(/（/g, '')
    .replace(/）/g, '')
    .trim() || null;
}

/**
 * 职责：标准化货柜编号
 */
function standardizeContainerNo(no, date, portCode) {
  if (!no) return null;
  
  // 如果已经是标准格式，直接返回
  if (/^\d{2}-\d{3}-[A-Z]+$/.test(no)) {
    return no;
  }
  
  // 提取年份
  const dateObj = parseDate(date);
  const year = dateObj ? dateObj.getFullYear().toString().slice(-2) : '25';
  
  // 提取序号
  const match = no.match(/(\d+)/);
  const seq = match ? match[1].padStart(3, '0') : '001';
  
  return `${year}-${seq}-${portCode || 'LA'}`;
}

/**
 * 职责：获取港口信息
 */
function getPortInfo(portName) {
  if (!portName) return null;
  return PORT_MAP[portName.trim()] || null;
}

/**
 * 职责：判断记录是否为"不相关"
 */
function isIrrelevant(row) {
  const note = row['备注'] || '';
  const broker = row['报关公司'] || '';
  return note.includes('不相关') || broker === '不报关' || broker === '埋单';
}

/**
 * 职责：从备注提取状态
 */
function extractStatus(note, shippedAt) {
  if (!note) {
    return shippedAt ? 'SHIPPED' : 'PENDING';
  }
  
  if (note.includes('生产中')) return 'PRODUCING';
  if (note.includes('运输中')) return 'SHIPPING';
  if (note.includes('包装中')) return 'PACKING';
  if (shippedAt) return 'SHIPPED';
  return 'PENDING';
}

// ==================== 数据收集器 ====================

const dataCollector = {
  ports: new Map(),        // code -> portData
  suppliers: new Map(),    // name -> supplierData
  products: new Map(),     // customsName -> productData
  stores: new Map(),       // name -> storeData
  containers: new Map(),   // containerNo -> containerData
  salesContracts: new Map(), // contractNo -> salesData
  purchaseContracts: new Map(), // contractNo -> purchaseData
  containerItems: [],      // 装箱明细列表
  errors: [],              // 错误列表
  warnings: [],            // 警告列表
};

/**
 * 职责：清洗并收集单行数据
 */
function processRow(row, rowIndex) {
  const rowNumber = rowIndex + 2; // Excel行号
  const errors = [];
  const warnings = [];
  
  // 跳过空行
  if (!row['报关名'] && !row['门店']) {
    return { skip: true };
  }
  
  // 1. 验证必填字段
  const customsName = (row['报关名'] || '').trim();
  if (!customsName) {
    errors.push({ code: 'E001', field: 'customsName', message: '报关名缺失' });
  }
  
  const storeName = (row['门店'] || '').trim();
  if (!storeName) {
    errors.push({ code: 'E002', field: 'storeName', message: '门店缺失' });
  }
  
  const portName = (row['港口'] || '').trim();
  const portInfo = getPortInfo(portName);
  if (!portInfo) {
    errors.push({ code: 'E003', field: 'portName', message: `港口无效: ${portName}` });
  }
  
  const salesContractNo = (row['合同号'] || '').trim();
  // 合同号可以为空（某些记录）
  
  const containerNoRaw = (row['柜子编号'] || '').trim();
  // 货柜编号可以为空（某些记录）
  
  // 如果有严重错误，记录并跳过
  if (errors.length > 0) {
    dataCollector.errors.push({ rowNumber, errors, rawData: row });
    return { skip: true };
  }
  
  // 2. 收集港口
  if (portInfo && !dataCollector.ports.has(portInfo.code)) {
    dataCollector.ports.set(portInfo.code, portInfo);
  }
  
  // 3. 收集供应商
  const supplierAlias = (row['厂家'] || '').trim();
  if (supplierAlias) {
    const supplierName = SUPPLIER_ALIASES[supplierAlias] || supplierAlias;
    if (!dataCollector.suppliers.has(supplierName)) {
      dataCollector.suppliers.set(supplierName, {
        name: supplierName,
        shortName: supplierAlias,
        aliases: [supplierAlias],
      });
    } else {
      // 添加别名
      const existing = dataCollector.suppliers.get(supplierName);
      if (!existing.aliases.includes(supplierAlias)) {
        existing.aliases.push(supplierAlias);
      }
    }
  }
  
  // 4. 收集商品
  if (!dataCollector.products.has(customsName)) {
    dataCollector.products.set(customsName, {
      customsName,
      description: (row['商品补充信息'] || '').trim() || null,
      specification: (row['规格'] || '').trim() || null,
      unit: standardizeUnit(row['单位']),
    });
  }
  
  // 5. 收集门店
  if (!dataCollector.stores.has(storeName)) {
    dataCollector.stores.set(storeName, {
      name: storeName,
      portCode: portInfo?.code,
    });
  }
  
  // 6. 收集货柜
  const shippedAt = parseDate(row['出货日期']);
  const containerNo = containerNoRaw ? standardizeContainerNo(containerNoRaw, row['出货日期'], portInfo?.code) : null;
  
  if (containerNo && !dataCollector.containers.has(containerNo)) {
    dataCollector.containers.set(containerNo, {
      containerNo,
      containerNoRaw,
      portCode: portInfo?.code,
      status: shippedAt ? 'SHIPPED' : 'PENDING',
      shippedAt,
      customsBroker: (row['报关公司'] || '').trim() || null,
      isFumigated: row['是否熏蒸'] === '是',
      hasTaxRefund: row['是否报出口退税'] === '是',
      salesContractNo,
      totalBoxes: 0,
      grossWeight: 0,
      netWeight: 0,
      volume: 0,
    });
  }
  
  // 更新货柜汇总数据
  if (containerNo) {
    const container = dataCollector.containers.get(containerNo);
    container.totalBoxes += parseInt(row['箱数']) || 0;
    container.grossWeight += parseAmount(row['毛重']) || 0;
    container.netWeight += parseAmount(row['净重']) || 0;
    container.volume += parseAmount(row['体积']) || 0;
  }
  
  // 7. 收集销售合同
  if (salesContractNo && !dataCollector.salesContracts.has(salesContractNo)) {
    dataCollector.salesContracts.set(salesContractNo, {
      contractNo: salesContractNo,
      signedAt: shippedAt,
      status: shippedAt ? 'COMPLETED' : 'DRAFT',
      totalAmount: 0,
      receivedAmount: 0,
      exchangeRate: 7.0,
    });
  }
  
  // 8. 收集采购合同
  const purchaseContractNo = (row['购销合同号'] || '').trim();
  const purchaseAmount = parseAmount(row['采购金额']);
  
  if (purchaseContractNo && !dataCollector.purchaseContracts.has(purchaseContractNo)) {
    dataCollector.purchaseContracts.set(purchaseContractNo, {
      contractNo: purchaseContractNo,
      supplierAlias,
      totalAmount: purchaseAmount || 0,
      paidAmount: row['是否付款'] === '1' || row['是否付款'] === '是' ? purchaseAmount || 0 : 0,
      invoiceNo: (row['发票号码'] || '').trim() || null,
      signedAt: shippedAt,
      status: 'COMPLETED',
    });
  } else if (purchaseContractNo && purchaseAmount) {
    // 累加金额
    const existing = dataCollector.purchaseContracts.get(purchaseContractNo);
    existing.totalAmount += purchaseAmount;
    if (row['是否付款'] === '1' || row['是否付款'] === '是') {
      existing.paidAmount += purchaseAmount;
    }
  }
  
  // 9. 收集装箱明细
  const itemData = {
    containerNo,
    customsName,
    storeName,
    salesContractNo,
    purchaseContractNo,
    quantity: parseQuantity(row['报关数量']),
    unit: standardizeUnit(row['单位']),
    boxes: parseInt(row['箱数']) || null,
    grossWeight: parseAmount(row['毛重']),
    netWeight: parseAmount(row['净重']),
    volume: parseAmount(row['体积']),
    note: (row['备注'] || '').trim() || null,
    isIrrelevant: isIrrelevant(row),
    status: extractStatus(row['备注'], shippedAt),
    shippedAt,
    purchaseAmount,
    supplierAlias,
  };
  
  dataCollector.containerItems.push(itemData);
  
  // 10. 记录警告
  if (!itemData.quantity) {
    warnings.push({ code: 'W001', field: 'quantity', message: '数量未填' });
  }
  if (!supplierAlias) {
    warnings.push({ code: 'W004', field: 'supplierName', message: '供应商未知' });
  }
  if (itemData.isIrrelevant) {
    warnings.push({ code: 'I001', field: 'note', message: '不相关记录' });
  }
  
  if (warnings.length > 0) {
    dataCollector.warnings.push({ rowNumber, warnings, data: itemData });
  }
  
  return { skip: false };
}

// ==================== 数据库写入 ====================

/**
 * 职责：创建港口数据
 */
async function createPorts() {
  console.log('\n📍 创建港口...');
  const created = [];
  
  for (const [code, port] of dataCollector.ports) {
    const existing = await prisma.port.findUnique({ where: { code } });
    if (!existing) {
      const record = await prisma.port.create({
        data: {
          name: port.name,
          code: port.code,
          isActive: true,
        },
      });
      created.push(record);
    }
  }
  
  console.log(`   ✅ 创建 ${created.length} 个港口`);
  return created;
}

/**
 * 职责：创建供应商数据
 */
async function createSuppliers() {
  console.log('\n👥 创建供应商...');
  const created = [];
  const supplierIdMap = new Map(); // name -> id
  
  for (const [name, supplier] of dataCollector.suppliers) {
    let record = await prisma.supplier.findFirst({ where: { name } });
    
    if (!record) {
      record = await prisma.supplier.create({
        data: {
          name: supplier.name,
          shortName: supplier.shortName,
          isActive: true,
        },
      });
      created.push(record);
    }
    
    supplierIdMap.set(name, record.id);
    
    // 创建别名
    for (const alias of supplier.aliases) {
      if (alias !== name) {
        const existingAlias = await prisma.supplierAlias.findUnique({ where: { alias } });
        if (!existingAlias) {
          await prisma.supplierAlias.create({
            data: {
              alias,
              supplierId: record.id,
            },
          });
        }
      }
    }
  }
  
  console.log(`   ✅ 创建 ${created.length} 个供应商`);
  return supplierIdMap;
}

/**
 * 职责：创建商品数据
 */
async function createProducts() {
  console.log('\n📦 创建商品...');
  const created = [];
  const productIdMap = new Map(); // customsName -> id
  
  for (const [customsName, product] of dataCollector.products) {
    let record = await prisma.product.findFirst({ where: { customsName } });
    
    if (!record) {
      record = await prisma.product.create({
        data: {
          customsName: product.customsName,
          description: product.description,
          specification: product.specification,
          unit: product.unit,
          isActive: true,
        },
      });
      created.push(record);
    }
    
    productIdMap.set(customsName, record.id);
  }
  
  console.log(`   ✅ 创建 ${created.length} 个商品`);
  return productIdMap;
}

/**
 * 职责：创建门店数据
 */
async function createStores() {
  console.log('\n🏪 创建门店...');
  const created = [];
  const storeIdMap = new Map(); // name -> id
  
  for (const [name, store] of dataCollector.stores) {
    let record = await prisma.store.findFirst({ where: { name } });
    
    if (!record) {
      const port = await prisma.port.findUnique({ where: { code: store.portCode } });
      if (port) {
        record = await prisma.store.create({
          data: {
            name: store.name,
            portId: port.id,
            isActive: true,
          },
        });
        created.push(record);
      }
    }
    
    if (record) {
      storeIdMap.set(name, record.id);
    }
  }
  
  console.log(`   ✅ 创建 ${created.length} 个门店`);
  return storeIdMap;
}

/**
 * 职责：创建货柜数据
 */
async function createContainers() {
  console.log('\n🚢 创建货柜...');
  const created = [];
  const containerIdMap = new Map(); // containerNo -> id
  
  for (const [containerNo, container] of dataCollector.containers) {
    if (!containerNo) continue;
    
    let record = await prisma.container.findUnique({ where: { containerNo } });
    
    if (!record) {
      const port = await prisma.port.findUnique({ where: { code: container.portCode } });
      if (port) {
        record = await prisma.container.create({
          data: {
            containerNo: container.containerNo,
            portId: port.id,
            status: container.status,
            totalBoxes: Math.round(container.totalBoxes),
            grossWeight: container.grossWeight,
            netWeight: container.netWeight,
            volume: container.volume,
            shippedAt: container.shippedAt,
            customsBroker: container.customsBroker,
            isFumigated: container.isFumigated,
            hasTaxRefund: container.hasTaxRefund,
            note: container.containerNoRaw !== container.containerNo ? `原编号: ${container.containerNoRaw}` : null,
          },
        });
        created.push(record);
      }
    }
    
    if (record) {
      containerIdMap.set(containerNo, record.id);
    }
  }
  
  console.log(`   ✅ 创建 ${created.length} 个货柜`);
  return containerIdMap;
}

/**
 * 职责：创建销售合同数据
 */
async function createSalesContracts() {
  console.log('\n📄 创建销售合同...');
  const created = [];
  const salesContractIdMap = new Map(); // contractNo -> id
  
  for (const [contractNo, contract] of dataCollector.salesContracts) {
    if (!contractNo) continue;
    
    let record = await prisma.salesContract.findUnique({ where: { contractNo } });
    
    if (!record) {
      record = await prisma.salesContract.create({
        data: {
          contractNo: contract.contractNo,
          totalAmount: contract.totalAmount,
          receivedAmount: contract.receivedAmount,
          exchangeRate: contract.exchangeRate,
          status: contract.status,
          signedAt: contract.signedAt,
        },
      });
      created.push(record);
    }
    
    salesContractIdMap.set(contractNo, record.id);
  }
  
  console.log(`   ✅ 创建 ${created.length} 个销售合同`);
  return salesContractIdMap;
}

/**
 * 职责：创建采购合同数据
 */
async function createPurchaseContracts(supplierIdMap) {
  console.log('\n📋 创建采购合同...');
  const created = [];
  const purchaseContractIdMap = new Map(); // contractNo -> id
  
  for (const [contractNo, contract] of dataCollector.purchaseContracts) {
    if (!contractNo) continue;
    
    let record = await prisma.purchaseContract.findUnique({ where: { contractNo } });
    
    if (!record) {
      // 查找供应商
      const supplierName = SUPPLIER_ALIASES[contract.supplierAlias] || contract.supplierAlias;
      const supplierId = supplierIdMap.get(supplierName);
      
      if (supplierId) {
        record = await prisma.purchaseContract.create({
          data: {
            contractNo: contract.contractNo,
            supplierId,
            totalAmount: contract.totalAmount,
            paidAmount: contract.paidAmount,
            status: contract.status,
            signedAt: contract.signedAt,
            invoiceNo: contract.invoiceNo,
          },
        });
        created.push(record);
      }
    }
    
    if (record) {
      purchaseContractIdMap.set(contractNo, record.id);
    }
  }
  
  console.log(`   ✅ 创建 ${created.length} 个采购合同`);
  return purchaseContractIdMap;
}

/**
 * 职责：创建装箱明细和库存记录
 */
async function createContainerItemsAndInventory(
  productIdMap,
  storeIdMap,
  containerIdMap,
  salesContractIdMap
) {
  console.log('\n📥 创建装箱明细和库存...');
  let itemsCreated = 0;
  let inventoryCreated = 0;
  
  for (const item of dataCollector.containerItems) {
    const productId = productIdMap.get(item.customsName);
    const containerId = item.containerNo ? containerIdMap.get(item.containerNo) : null;
    const storeId = storeIdMap.get(item.storeName);
    const salesContractId = item.salesContractNo ? salesContractIdMap.get(item.salesContractNo) : null;
    
    if (!productId) continue;
    
    // 创建装箱明细
    if (containerId) {
      await prisma.containerItem.create({
        data: {
          containerId,
          productId,
          storeId: storeId || undefined,
          quantity: item.quantity || 0,
          unit: item.unit,
          boxes: item.boxes,
          grossWeight: item.grossWeight,
          netWeight: item.netWeight,
          volume: item.volume,
          note: item.note,
        },
      });
      itemsCreated++;
    }
    
    // 创建库存记录
    if (item.quantity && item.quantity > 0) {
      await prisma.inventory.create({
        data: {
          productId,
          containerId: containerId || undefined,
          quantity: item.quantity,
          unit: item.unit,
          status: item.status,
          outboundAt: item.shippedAt,
          note: item.isIrrelevant ? '不相关记录 - ' + (item.note || '') : item.note,
        },
      });
      inventoryCreated++;
    }
  }
  
  console.log(`   ✅ 创建 ${itemsCreated} 条装箱明细`);
  console.log(`   ✅ 创建 ${inventoryCreated} 条库存记录`);
}

/**
 * 职责：记录导入日志
 */
async function createImportRecord(fileName, totalRows, successRows, failedRows) {
  await prisma.importRecord.create({
    data: {
      fileName,
      totalRows,
      successRows,
      failedRows,
      status: 'COMPLETED',
      errorLog: dataCollector.errors.length > 0 ? JSON.stringify(dataCollector.errors) : null,
      importedBy: 'system',
    },
  });
}

// ==================== 主函数 ====================

async function main() {
  console.log('========================================');
  console.log('   捷淞进销存系统 - 数据导入工具');
  console.log('========================================');
  
  // 1. 读取CSV文件
  const csvPath = path.join(__dirname, '../../出货汇总(1).csv');
  console.log(`\n📂 读取文件: ${csvPath}`);
  
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV文件不存在!');
    process.exit(1);
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  // 2. 解析CSV
  console.log('\n📊 解析CSV数据...');
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
  });
  
  console.log(`   总行数: ${parsed.data.length}`);
  
  // 3. 清洗数据
  console.log('\n🧹 清洗数据...');
  let processedCount = 0;
  let skippedCount = 0;
  
  for (let i = 0; i < parsed.data.length; i++) {
    const result = processRow(parsed.data[i], i);
    if (result.skip) {
      skippedCount++;
    } else {
      processedCount++;
    }
  }
  
  console.log(`   处理: ${processedCount} 行`);
  console.log(`   跳过: ${skippedCount} 行`);
  console.log(`   错误: ${dataCollector.errors.length} 行`);
  console.log(`   警告: ${dataCollector.warnings.length} 行`);
  
  // 4. 显示统计
  console.log('\n📈 数据统计:');
  console.log(`   港口: ${dataCollector.ports.size}`);
  console.log(`   供应商: ${dataCollector.suppliers.size}`);
  console.log(`   商品: ${dataCollector.products.size}`);
  console.log(`   门店: ${dataCollector.stores.size}`);
  console.log(`   货柜: ${dataCollector.containers.size}`);
  console.log(`   销售合同: ${dataCollector.salesContracts.size}`);
  console.log(`   采购合同: ${dataCollector.purchaseContracts.size}`);
  console.log(`   装箱明细: ${dataCollector.containerItems.length}`);
  
  // 5. 写入数据库
  console.log('\n💾 开始写入数据库...');
  
  try {
    await createPorts();
    const supplierIdMap = await createSuppliers();
    const productIdMap = await createProducts();
    const storeIdMap = await createStores();
    const containerIdMap = await createContainers();
    const salesContractIdMap = await createSalesContracts();
    const purchaseContractIdMap = await createPurchaseContracts(supplierIdMap);
    await createContainerItemsAndInventory(
      productIdMap,
      storeIdMap,
      containerIdMap,
      salesContractIdMap
    );
    
    // 6. 记录导入日志
    await createImportRecord(
      '出货汇总(1).csv',
      parsed.data.length,
      processedCount,
      skippedCount + dataCollector.errors.length
    );
    
    console.log('\n========================================');
    console.log('   ✅ 数据导入完成！');
    console.log('========================================');
    
    // 7. 输出错误报告
    if (dataCollector.errors.length > 0) {
      console.log('\n⚠️ 错误记录:');
      dataCollector.errors.slice(0, 10).forEach(err => {
        console.log(`   行 ${err.rowNumber}: ${err.errors.map(e => e.message).join(', ')}`);
      });
      if (dataCollector.errors.length > 10) {
        console.log(`   ... 还有 ${dataCollector.errors.length - 10} 条错误`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ 导入失败:', error.message);
    throw error;
  }
}

// 执行
main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
