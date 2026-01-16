/**
 * Input: CSV文件、Prisma客户端
 * Output: 导入结果统计
 * Pos: 数据导入服务，处理CSV历史数据导入
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const prisma = require('../utils/prisma');

/**
 * 职责：解析CSV文件内容
 * 思路：按行分割，处理中文表头
 * @param {string} content - CSV文件内容
 * @returns {Array} 解析后的数据数组
 */
const parseCSV = (content) => {
  const lines = content.split('\n').filter(line => line.trim());
  if (lines.length === 0) return [];
  
  // 解析表头
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // 解析数据行
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index]?.trim() || '';
      });
      data.push(row);
    }
  }
  
  return data;
};

/**
 * 职责：解析CSV单行（处理逗号在引号内的情况）
 * @param {string} line - CSV行
 * @returns {Array} 字段数组
 */
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.replace(/"/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.replace(/"/g, ''));
  
  return result;
};

/**
 * 职责：导入CSV数据到数据库
 * 思路：
 * 1. 解析CSV文件
 * 2. 遍历数据行，创建相关记录
 * 3. 处理异常数据并标记
 * 4. 返回导入结果统计
 * @param {string} filePath - CSV文件路径
 * @param {string} userId - 导入用户ID
 * @returns {Object} 导入结果
 */
const importCSVData = async (filePath, userId) => {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parseCSV(content);
  
  const result = {
    totalRows: data.length,
    successRows: 0,
    failedRows: 0,
    errors: [],
  };
  
  // 创建导入记录
  const importRecord = await prisma.importRecord.create({
    data: {
      fileName: filePath.split('/').pop(),
      totalRows: data.length,
      successRows: 0,
      failedRows: 0,
      status: 'PROCESSING',
      importedBy: userId,
    },
  });
  
  // 缓存已创建的实体，避免重复创建
  const cache = {
    suppliers: new Map(),
    stores: new Map(),
    products: new Map(),
    ports: new Map(),
    containers: new Map(),
  };
  
  // 预加载港口数据
  const ports = await prisma.port.findMany();
  ports.forEach(p => cache.ports.set(p.name, p));
  cache.ports.set('洛杉矶', ports.find(p => p.code === 'LA'));
  cache.ports.set('Oakland', ports.find(p => p.code === 'OAK'));
  cache.ports.set('密歇根', ports.find(p => p.code === 'MI'));
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    try {
      await processRow(row, cache);
      result.successRows++;
    } catch (error) {
      result.failedRows++;
      result.errors.push({
        row: i + 2, // 1-based，加上表头
        error: error.message,
        data: row,
      });
    }
  }
  
  // 更新导入记录
  await prisma.importRecord.update({
    where: { id: importRecord.id },
    data: {
      successRows: result.successRows,
      failedRows: result.failedRows,
      status: result.failedRows > 0 ? 'COMPLETED' : 'COMPLETED',
      errorLog: result.errors.length > 0 ? JSON.stringify(result.errors) : null,
    },
  });
  
  return result;
};

/**
 * 职责：处理单行CSV数据
 * 思路：根据CSV字段映射创建各实体
 * @param {Object} row - CSV数据行
 * @param {Object} cache - 实体缓存
 */
const processRow = async (row, cache) => {
  // 1. 处理供应商
  const supplierName = row['厂家'] || row['供应商'];
  let supplier = null;
  if (supplierName) {
    supplier = cache.suppliers.get(supplierName);
    if (!supplier) {
      supplier = await prisma.supplier.upsert({
        where: { name: supplierName },
        update: {},
        create: { name: supplierName },
      }).catch(() => null);
      if (supplier) cache.suppliers.set(supplierName, supplier);
    }
  }
  
  // 2. 处理门店和港口
  const storeName = row['门店'];
  const portName = row['港口'];
  let store = null;
  if (storeName && portName) {
    store = cache.stores.get(storeName);
    if (!store) {
      let port = cache.ports.get(portName);
      if (!port) {
        // 根据门店名推断港口
        port = cache.ports.get('洛杉矶'); // 默认洛杉矶
      }
      if (port) {
        store = await prisma.store.upsert({
          where: { name: storeName },
          update: {},
          create: { name: storeName, portId: port.id },
        }).catch(() => null);
        if (store) cache.stores.set(storeName, store);
      }
    }
  }
  
  // 3. 处理商品
  const customsName = row['报关名'];
  let product = null;
  if (customsName) {
    product = cache.products.get(customsName);
    if (!product) {
      product = await prisma.product.upsert({
        where: { customsName },
        update: {
          description: row['商品补充信息'] || undefined,
          specification: row['规格'] || undefined,
          unit: row['单位'] || undefined,
        },
        create: {
          customsName,
          description: row['商品补充信息'] || null,
          specification: row['规格'] || null,
          unit: row['单位'] || null,
        },
      }).catch(() => null);
      if (product) cache.products.set(customsName, product);
    }
  }
  
  // 4. 处理货柜
  const containerNo = row['柜子编号'];
  let container = null;
  if (containerNo) {
    container = cache.containers.get(containerNo);
    if (!container) {
      const port = cache.ports.get(portName) || cache.ports.get('洛杉矶');
      container = await prisma.container.upsert({
        where: { containerNo },
        update: {
          shippedAt: row['出货日期'] ? new Date(row['出货日期']) : undefined,
          customsBroker: row['报关公司'] || undefined,
          isFumigated: row['是否熏蒸'] === '是' ? true : false,
          hasTaxRefund: row['是否报出口退税'] === '是' ? true : false,
        },
        create: {
          containerNo,
          portId: port?.id,
          shippedAt: row['出货日期'] ? new Date(row['出货日期']) : null,
          customsBroker: row['报关公司'] || null,
          isFumigated: row['是否熏蒸'] === '是',
          hasTaxRefund: row['是否报出口退税'] === '是',
          status: 'SHIPPED',
        },
      }).catch(() => null);
      if (container) cache.containers.set(containerNo, container);
    }
  }
  
  // 5. 处理装箱明细
  if (container && product) {
    const quantity = parseFloat(row['报关数量']) || 0;
    const boxes = parseInt(row['箱数']) || 0;
    const grossWeight = parseFloat(row['毛重']) || 0;
    const netWeight = parseFloat(row['净重']) || 0;
    const volume = parseFloat(row['体积']) || 0;
    
    if (quantity > 0 || boxes > 0) {
      await prisma.containerItem.create({
        data: {
          containerId: container.id,
          productId: product.id,
          storeId: store?.id,
          quantity,
          unit: row['单位'] || null,
          boxes,
          grossWeight,
          netWeight,
          volume,
          note: row['备注'] || null,
        },
      }).catch(() => null);
    }
  }
};

/**
 * 职责：获取导入记录列表
 * @param {number} page - 页码
 * @param {number} pageSize - 每页数量
 * @returns {Object} 导入记录列表
 */
const getImportRecords = async (page = 1, pageSize = 20) => {
  const skip = (page - 1) * pageSize;
  
  const [records, total] = await Promise.all([
    prisma.importRecord.findMany({
      skip,
      take: pageSize,
      orderBy: { importedAt: 'desc' },
    }),
    prisma.importRecord.count(),
  ]);
  
  return { records, total };
};

module.exports = {
  parseCSV,
  importCSVData,
  getImportRecords,
};
