/**
 * Input: CSV数据、Prisma客户端
 * Output: 数据对比结果、增量导入结果
 * Pos: 数据导入服务，处理CSV解析、对比、增量导入
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const Papa = require('papaparse');
const prisma = require('../utils/prisma');

// ==================== 配置映射 ====================

const PORT_MAP = {
  '洛杉矶': { name: '洛杉矶', code: 'LA' },
  'Oakland': { name: 'Oakland', code: 'OAK' },
  '密歇根': { name: '密歇根', code: 'MI' },
  'Oakland和洛杉矶': { name: 'Oakland', code: 'OAK' },
};

const SUPPLIER_ALIASES = {
  '黎总': '佛山陶瓷有限公司',
  '叶总': '叶总餐饮设备',
  '郭总': '郭总金属制品',
  '阿宗': '振宗石材',
  '振宗': '振宗石材',
  '刘总': '刘总家具',
  '卡座刘总': '刘总家具',
  '淘宝': '淘宝在线采购',
  '淘宝定制': '淘宝在线采购',
  '何总布菲传奇': '布菲传奇设备',
  '涂经理': '涂经理机械公司',
  '南常': '南常厨房设备',
  '徐州玻璃瓶': '徐州玻璃瓶厂',
  '深圳陈小姐': '深圳照明公司',
  '深圳杨总': '深圳电子公司',
  '泉州林总': '泉州工艺品厂',
  '泉州定制': '泉州定制厂',
  '新兴石材': '新兴石材厂',
  '王总定制': '王总餐具厂',
  '王总': '王总餐具厂',
  '台德': '台德餐具公司',
  '廊坊秀儿商贸': '廊坊秀儿商贸有限公司',
  '宜拓': '宜拓设备',
  '亚克力': '亚克力定制厂',
  '广东厂家': '广东生产厂',
  '山东厂家': '山东生产厂',
  '山东运输玻璃门': '山东生产厂',
  '新厂家窗帘': '新厂家窗帘',
  '新厂家': '新厂家',
  '佛山': '佛山金属制品',
  '蔡': '蔡氏金属',
  '上海定制': '上海定制厂',
  '厦门': '厦门石材公司',
  '广州的': '广州设备厂',
  '大汉焊接': '大汉焊接设备',
  '雾化壁炉': '雾化壁炉厂',
  '炜艺': '炜艺屏风厂',
  '酒架定制': '酒架定制厂',
  '定制提盘': '定制提盘厂',
  '玮杰': '玮杰家具',
  '物流': '物流公司',
  'zeqin': 'zeqin供应商',
  '阿珍贵州': '阿珍贵州食品',
  '重庆新': '重庆新食品',
  '君耀-淘宝': '淘宝君耀店铺',
  '外运输': '外部运输',
  '厂家定制': '厂家定制',
  '水晶屏风厂家': '水晶屏风厂',
  '泉州石材': '泉州石材厂',
  '淘宝店家': '淘宝在线采购',
  '阿里巴巴': '阿里巴巴采购',
  '新派': '新派包装',
  '舅妈联系': '舅妈联系供应商',
  '深圳（舅妈联系': '舅妈联系供应商',
  '亚克力定制': '亚克力定制厂',
  '传送带': '传送带设备厂',
  '新': '新供应商',
};

// ==================== 辅助函数 ====================

function parseAmount(value) {
  if (!value || value === '') return null;
  const cleaned = String(value).replace(/"/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseQuantity(value) {
  if (!value || value === '') return null;
  const cleaned = String(value)
    .replace(/（/g, '').replace(/）/g, '')
    .replace(/=/g, '').replace(/\s/g, '').trim();
  const match = cleaned.match(/^[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function standardizeUnit(unit) {
  if (!unit) return null;
  return unit.replace(/（/g, '').replace(/）/g, '').trim() || null;
}

function standardizeContainerNo(no, date, portCode) {
  if (!no) return null;
  if (/^\d{2}-\d{3}-[A-Z]+$/.test(no)) return no;
  const dateObj = parseDate(date);
  const year = dateObj ? dateObj.getFullYear().toString().slice(-2) : '25';
  const match = no.match(/(\d+)/);
  const seq = match ? match[1].padStart(3, '0') : '001';
  return `${year}-${seq}-${portCode || 'LA'}`;
}

function getPortInfo(portName) {
  if (!portName) return null;
  const trimmed = portName.trim();
  return PORT_MAP[trimmed] || { name: trimmed, code: trimmed.substring(0, 3).toUpperCase() };
}

function extractStatus(note, shippedAt) {
  if (!note) return shippedAt ? 'SHIPPED' : 'PENDING';
  if (note.includes('生产中')) return 'PRODUCING';
  if (note.includes('运输中')) return 'SHIPPING';
  if (note.includes('包装中')) return 'PACKING';
  if (shippedAt) return 'SHIPPED';
  return 'PENDING';
}

function isIrrelevant(row) {
  const note = row['备注'] || '';
  const broker = row['报关公司'] || '';
  return note.includes('不相关') || broker === '不报关' || broker === '埋单';
}

/**
 * 职责：生成记录的唯一标识（用于去重）
 */
function generateRecordKey(row) {
  const customsName = (row['报关名'] || '').trim();
  const storeName = (row['门店'] || '').trim();
  const containerNo = (row['柜子编号'] || '').trim();
  const contractNo = (row['合同号'] || '').trim();
  const quantity = parseQuantity(row['报关数量']);
  return `${customsName}|${storeName}|${containerNo}|${contractNo}|${quantity}`;
}

// ==================== 核心服务函数 ====================

/**
 * 职责：解析CSV内容
 * @param {string} csvContent - CSV文件内容
 * @returns {Object} 解析结果
 */
const parseCSV = (csvContent) => {
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  
  return {
    data: parsed.data,
    errors: parsed.errors,
    meta: parsed.meta,
  };
};

/**
 * 职责：分析CSV数据，找出缺失序号
 * @param {Array} rows - CSV数据行
 * @returns {Object} 分析结果
 */
const analyzeData = (rows) => {
  const seqs = rows.map(r => parseInt(r['序号'])).filter(n => !isNaN(n)).sort((a, b) => a - b);
  const minSeq = seqs[0] || 1;
  const maxSeq = seqs[seqs.length - 1] || 1;
  
  const missingSeqs = [];
  for (let i = minSeq; i <= maxSeq; i++) {
    if (!seqs.includes(i)) {
      missingSeqs.push(i);
    }
  }
  
  return {
    totalRows: rows.length,
    seqRange: { min: minSeq, max: maxSeq },
    missingSeqs,
    uniqueSeqs: [...new Set(seqs)].length,
  };
};

/**
 * 职责：与数据库现有数据对比，找出新增记录
 * @param {Array} rows - CSV数据行
 * @returns {Object} 对比结果
 */
const compareWithDatabase = async (rows) => {
  // 获取数据库中现有的装箱明细
  const existingItems = await prisma.packingItem.findMany({
    include: {
      product: true,
      salesContract: true,
    },
  });
  
  // 分类记录
  const newRecords = [];
  const existingRecords = [];
  const invalidRecords = [];
  
  for (const row of rows) {
    const customsName = (row['报关名'] || '').trim();
    const containerNo = (row['柜子编号'] || '').trim();
    
    // 验证必填字段
    if (!customsName) {
      invalidRecords.push({
        seq: row['序号'],
        reason: '报关名为空',
        data: row,
      });
      continue;
    }
    
    // 检查是否已存在
    // 简单判断：如果商品名+货柜编号+数量组合已存在，认为是重复
    const isDuplicate = existingItems.some(item => {
      if (item.product?.customsName !== customsName) return false;
      if (!containerNo) return false;
      
      const itemContainerNo = item.salesContract?.contractNo;
      const rowContainerNoStd = standardizeContainerNo(
        containerNo,
        row['出货日期'],
        getPortInfo(row['港口'])?.code
      );
      
      if (itemContainerNo !== rowContainerNoStd && 
          !itemContainerNo?.includes(containerNo.replace(/[^\d]/g, ''))) {
        return false;
      }
      
      const rowQty = parseQuantity(row['报关数量']);
      return Math.abs((item.quantity || 0) - (rowQty || 0)) < 0.01;
    });
    
    if (isDuplicate) {
      existingRecords.push({
        seq: row['序号'],
        customsName,
        containerNo,
        data: row,
      });
    } else {
      newRecords.push({
        seq: row['序号'],
        customsName,
        storeName: (row['门店'] || '').trim(),
        containerNo,
        quantity: parseQuantity(row['报关数量']),
        data: row,
      });
    }
  }
  
  return {
    newRecords,
    existingRecords,
    invalidRecords,
    summary: {
      total: rows.length,
      new: newRecords.length,
      existing: existingRecords.length,
      invalid: invalidRecords.length,
    },
  };
};

/**
 * 职责：导入新增记录到数据库
 * @param {Array} records - 要导入的记录
 * @returns {Object} 导入结果
 */
const importRecords = async (records) => {
  const results = {
    success: [],
    failed: [],
    created: {
      suppliers: 0,
      products: 0,
      stores: 0,
      containers: 0,
      salesContracts: 0,
      salesItems: 0,
      purchaseContracts: 0,
      containerItems: 0,
      inventories: 0,
    },
  };
  
  for (const record of records) {
    try {
      const row = record.data;
      const customsName = (row['报关名'] || '').trim();
      const storeName = (row['门店'] || '').trim();
      const portName = (row['港口'] || '').trim();
      const supplierAlias = (row['厂家'] || '').trim();
      
      if (!customsName) {
        results.failed.push({ seq: record.seq, reason: '报关名为空' });
        continue;
      }
      
      // 1. 获取或创建港口
      const portInfo = getPortInfo(portName);
      let port = null;
      if (portInfo) {
        port = await prisma.port.findUnique({ where: { code: portInfo.code } });
        if (!port) {
          port = await prisma.port.create({
            data: { name: portInfo.name, code: portInfo.code, isActive: true },
          });
        }
      }
      
      // 2. 获取或创建供应商
      let supplier = null;
      if (supplierAlias) {
        const supplierName = SUPPLIER_ALIASES[supplierAlias] || supplierAlias;
        supplier = await prisma.supplier.findFirst({ where: { name: supplierName } });
        if (!supplier) {
          supplier = await prisma.supplier.create({
            data: { name: supplierName, shortName: supplierAlias, isActive: true },
          });
          results.created.suppliers++;
        }
      }
      
      // 3. 获取或创建商品
      let product = await prisma.product.findFirst({ where: { customsName } });
      if (!product) {
        product = await prisma.product.create({
          data: {
            customsName,
            description: (row['商品补充信息'] || '').trim() || null,
            specification: (row['规格'] || '').trim() || null,
            unit: standardizeUnit(row['单位']),
            isActive: true,
          },
        });
        results.created.products++;
      }
      
      // 4. 获取或创建门店
      let store = null;
      if (storeName && port) {
        store = await prisma.store.findFirst({ where: { name: storeName } });
        if (!store) {
          store = await prisma.store.create({
            data: { name: storeName, portId: port.id, isActive: true },
          });
          results.created.stores++;
        }
      }
      
      // 5. 处理货柜
      const shippedAt = parseDate(row['出货日期']);
      const containerNoRaw = (row['柜子编号'] || '').trim();
      const containerNo = containerNoRaw ? 
        standardizeContainerNo(containerNoRaw, row['出货日期'], portInfo?.code) : null;
      
      let container = null;
      if (containerNo && port) {
        container = await prisma.salesContract.findUnique({ where: { contractNo: containerNo } });
        if (!container) {
          container = await prisma.salesContract.create({
            data: {
              contractNo: containerNo,
              portId: port.id,
              status: shippedAt ? 'SHIPPED' : 'DRAFT',
              shippedAt,
              exchangeRate: 7.0,
              customsBroker: (row['报关公司'] || '').trim() || null,
              isFumigated: row['是否熏蒸'] === '是',
              note: containerNoRaw !== containerNo ? `原编号: ${containerNoRaw}` : null,
            },
          });
          results.created.containers++;
        }
      }
      
      // 6. 处理销售合同及明细
      const salesContractNo = (row['合同号'] || '').trim();
      let salesContract = null;
      if (salesContractNo) {
        salesContract = await prisma.salesContract.findUnique({ 
          where: { contractNo: salesContractNo } 
        });
        if (!salesContract) {
          salesContract = await prisma.salesContract.create({
            data: {
              contractNo: salesContractNo,
              totalAmount: 0,
              receivedAmount: 0,
              exchangeRate: 7.0,
              status: shippedAt ? 'COMPLETED' : 'DRAFT',
              signedAt: shippedAt,
            },
          });
          results.created.salesContracts++;
        }
        
        // 6.1 创建销售合同明细（SalesItem）
        const quantity = parseQuantity(row['报关数量']) || 0;
        const costPrice = parseAmount(row['采购金额']) || 0;
        const sellingPrice = parseAmount(row['出口金额']) || parseAmount(row['售价']) || 0;
        
        if (product && store && quantity > 0) {
          // 检查是否已存在相同的明细（避免重复导入）
          const existingItem = await prisma.salesItem.findFirst({
            where: {
              salesContractId: salesContract.id,
              productId: product.id,
              storeId: store.id,
            },
          });
          
          if (!existingItem) {
            await prisma.salesItem.create({
              data: {
                salesContractId: salesContract.id,
                productId: product.id,
                storeId: store.id,
                quantity,
                unit: standardizeUnit(row['单位']),
                costPrice,
                sellingPrice,
                specification: (row['规格'] || row['商品规格'] || '').trim() || null,
                note: `序号${row['序号']}: ${(row['备注'] || '').trim()}`,
              },
            });
            results.created.salesItems = (results.created.salesItems || 0) + 1;
            
            // 更新销售合同总金额
            await prisma.salesContract.update({
              where: { id: salesContract.id },
              data: {
                totalAmount: { increment: sellingPrice * quantity },
              },
            });
          }
        }
      }
      
      // 7. 处理采购合同
      const purchaseContractNo = (row['购销合同号'] || '').trim();
      const purchaseAmount = parseAmount(row['采购金额']);
      if (purchaseContractNo && supplier) {
        let purchaseContract = await prisma.purchaseContract.findUnique({ 
          where: { contractNo: purchaseContractNo } 
        });
        if (!purchaseContract) {
          await prisma.purchaseContract.create({
            data: {
              contractNo: purchaseContractNo,
              supplierId: supplier.id,
              totalAmount: purchaseAmount || 0,
              paidAmount: (row['是否付款'] === '1' || row['是否付款'] === '是') ? 
                (purchaseAmount || 0) : 0,
              invoiceNo: (row['发票号码'] || '').trim() || null,
              signedAt: shippedAt,
              status: 'COMPLETED',
            },
          });
          results.created.purchaseContracts++;
        }
      }
      
      // 8. 创建装箱明细
      if (container) {
        await prisma.packingItem.create({
          data: {
            salesContractId: container.id,
            productId: product.id,
            storeId: store?.id,
            quantity: parseQuantity(row['报关数量']) || 0,
            unit: standardizeUnit(row['单位']),
            boxes: parseInt(row['箱数']) || null,
            grossWeight: parseAmount(row['毛重']),
            netWeight: parseAmount(row['净重']),
            volume: parseAmount(row['体积']),
            note: `序号${row['序号']}: ${(row['备注'] || '').trim()}`,
          },
        });
        results.created.containerItems++;
      }
      
      // 9. 创建库存记录
      const quantity = parseQuantity(row['报关数量']);
      if (quantity && quantity > 0) {
        await prisma.inventory.create({
          data: {
            productId: product.id,
            salesContractId: container?.id,
            quantity,
            unit: standardizeUnit(row['单位']),
            status: extractStatus(row['备注'], shippedAt),
            outboundAt: shippedAt,
            note: isIrrelevant(row) ? 
              `不相关记录 - 序号${row['序号']}: ${(row['备注'] || '').trim()}` : 
              `序号${row['序号']}: ${(row['备注'] || '').trim()}`,
          },
        });
        results.created.inventories++;
      }
      
      results.success.push({
        seq: row['序号'],
        customsName,
        storeName,
      });
      
    } catch (error) {
      results.failed.push({
        seq: record.seq,
        reason: error.message,
      });
    }
  }
  
  // 记录导入日志
  await prisma.importRecord.create({
    data: {
      fileName: 'web_upload',
      totalRows: records.length,
      successRows: results.success.length,
      failedRows: results.failed.length,
      status: 'COMPLETED',
      errorLog: results.failed.length > 0 ? JSON.stringify(results.failed) : null,
      importedBy: 'user',
    },
  });
  
  return results;
};

/**
 * 职责：获取导入历史记录
 * @returns {Array} 导入记录列表
 */
const getImportHistory = async () => {
  return prisma.importRecord.findMany({
    orderBy: { importedAt: 'desc' },
    take: 20,
  });
};

/**
 * 职责：获取数据库统计信息
 * @returns {Object} 统计信息
 */
const getDatabaseStats = async () => {
  const [
    suppliers,
    products,
    stores,
    salesContracts,
    packingItemsCount,
    salesItems,
    purchaseContracts,
    inventories,
  ] = await Promise.all([
    prisma.supplier.count(),
    prisma.product.count(),
    prisma.store.count(),
    prisma.salesContract.count(),
    prisma.packingItem.count(),
    prisma.salesItem.count(),
    prisma.purchaseContract.count(),
    prisma.inventory.count(),
  ]);
  
  return {
    suppliers,
    products,
    stores,
    containers: salesContracts,
    containerItems: packingItemsCount,
    salesContracts,
    salesItems,
    purchaseContracts,
    inventories,
  };
};

module.exports = {
  parseCSV,
  analyzeData,
  compareWithDatabase,
  importRecords,
  getImportHistory,
  getDatabaseStats,
};
