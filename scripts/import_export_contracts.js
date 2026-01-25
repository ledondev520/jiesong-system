/**
 * Input: docs/出口合同完整明细.csv
 * Output: 更新 SalesContract, SalesItem 和 Product 表
 * Pos: 出口合同数据导入脚本
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

// 切换到 backend 目录以加载 Prisma
const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

const CSV_FILE = path.join(__dirname, '../docs/出口合同完整明细.csv');

/**
 * 职责：解析 CSV 文件
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^\uFEFF/, '').trim());
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const values = [];
    let current = '';
    let inQuotes = false;
    for (const char of lines[i]) {
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    const record = {};
    headers.forEach((h, idx) => {
      record[h] = values[idx] || '';
    });
    records.push(record);
  }
  return records;
}

async function main() {
  console.log('=== 导入出口合同数据 ===\n');
  
  // 1. 解析 CSV
  console.log('1. 解析 CSV...');
  const records = parseCSV(CSV_FILE);
  console.log(`   找到 ${records.length} 条记录\n`);
  
  // 2. 按合同号分组
  console.log('2. 分析合同数据...');
  const contractMap = new Map(); // contractNo -> { storeName, items[], totalAmount }
  const productNames = new Set();
  
  for (const r of records) {
    const contractNo = r['合同号'];
    const productName = r['商品名称'];
    
    if (!contractNo || !productName) continue;
    
    productNames.add(productName);
    
    if (!contractMap.has(contractNo)) {
      contractMap.set(contractNo, {
        storeName: r['发货店铺'] || '',
        items: [],
        totalAmount: 0,
      });
    }
    
    const purchaseAmount = parseFloat(r['采购金额RMB']) || 0;
    
    contractMap.get(contractNo).items.push({
      productName,
      hsCode: r['HS编码'] || '',
      specification: r['规格'] || '',
      boxes: parseFloat(r['箱数']) || 0,
      grossWeight: parseFloat(r['毛重kg']) || 0,
      netWeight: parseFloat(r['净重kg']) || 0,
      volume: parseFloat(r['体积cbm']) || 0,
      quantity: parseFloat(r['数量']) || 0,
      unit: r['单位'] || '',
      purchaseAmount,
    });
    
    // 累加采购金额作为合同总金额
    contractMap.get(contractNo).totalAmount += purchaseAmount;
  }
  
  console.log(`   找到 ${contractMap.size} 个出口合同`);
  console.log(`   涉及 ${productNames.size} 个商品\n`);
  
  // 3. 更新商品表（添加 HS 编码）
  console.log('3. 更新商品 HS 编码...');
  let productUpdated = 0;
  const productIdMap = new Map(); // productName -> id
  
  for (const [contractNo, data] of contractMap) {
    for (const item of data.items) {
      if (!productIdMap.has(item.productName)) {
        // 查找或创建商品
        let product = await prisma.product.findFirst({
          where: { customsName: item.productName },
        });
        
        if (product) {
          // 更新 HS 编码（如果有）
          if (item.hsCode && !product.hsCode) {
            await prisma.product.update({
              where: { id: product.id },
              data: { hsCode: item.hsCode },
            });
            productUpdated++;
          }
          productIdMap.set(item.productName, product.id);
        } else {
          // 创建新商品
          product = await prisma.product.create({
            data: {
              customsName: item.productName,
              hsCode: item.hsCode || null,
              unit: item.unit || null,
              isActive: true,
            },
          });
          productIdMap.set(item.productName, product.id);
          productUpdated++;
        }
      }
    }
  }
  console.log(`   更新/创建 ${productUpdated} 个商品\n`);
  
  // 4. 获取或创建默认店铺
  console.log('4. 准备店铺数据...');
  const storeMap = new Map(); // storeName -> id
  
  // 获取或创建默认港口
  let defaultPort = await prisma.port.findFirst();
  if (!defaultPort) {
    defaultPort = await prisma.port.create({
      data: { name: '洛杉矶', code: 'LAX', country: 'USA' },
    });
  }
  
  // 获取现有店铺
  const existingStores = await prisma.store.findMany();
  for (const store of existingStores) {
    storeMap.set(store.name, store.id);
  }
  
  // 为缺失的店铺创建记录
  for (const [contractNo, data] of contractMap) {
    if (data.storeName && !storeMap.has(data.storeName)) {
      const store = await prisma.store.create({
        data: {
          name: data.storeName,
          portId: defaultPort.id,
          isActive: true,
        },
      });
      storeMap.set(data.storeName, store.id);
    }
  }
  
  // 确保有默认店铺
  let defaultStoreId = storeMap.values().next().value;
  if (!defaultStoreId) {
    const defaultStore = await prisma.store.create({
      data: { name: '默认店铺', portId: defaultPort.id, isActive: true },
    });
    defaultStoreId = defaultStore.id;
  }
  
  console.log(`   找到/创建 ${storeMap.size} 个店铺\n`);
  
  // 5. 更新出口合同
  console.log('5. 更新出口合同...');
  let contractUpdated = 0;
  let itemsCreated = 0;
  
  for (const [contractNo, data] of contractMap) {
    // 查找现有合同
    let contract = await prisma.salesContract.findFirst({
      where: { contractNo: contractNo },
    });
    
    if (contract) {
      // 更新合同总金额
      await prisma.salesContract.update({
        where: { id: contract.id },
        data: {
          totalAmount: data.totalAmount || contract.totalAmount,
        },
      });
      contractUpdated++;
      
      // 获取店铺 ID
      const storeId = storeMap.get(data.storeName) || defaultStoreId;
      
      // 检查并创建销售明细
      for (const item of data.items) {
        const productId = productIdMap.get(item.productName);
        if (!productId) continue;
        
        // 检查是否已存在
        const existing = await prisma.salesItem.findFirst({
          where: {
            salesContractId: contract.id,
            productId,
          },
        });
        
        if (!existing) {
          await prisma.salesItem.create({
            data: {
              salesContractId: contract.id,
              productId,
              storeId,
              quantity: item.quantity || 1,
              unit: item.unit || '个',
              costPrice: item.purchaseAmount || 0, // 采购成本
              sellingPrice: 0, // 销售价格待补充
            },
          });
          itemsCreated++;
        }
      }
      
      console.log(`   + ${contractNo}: ${data.items.length} 个商品, 总金额 ¥${data.totalAmount.toLocaleString()}`);
    } else {
      console.log(`   - ${contractNo}: 未找到对应的出口合同`);
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`更新出口合同: ${contractUpdated} 个`);
  console.log(`创建销售明细: ${itemsCreated} 条`);
  console.log(`更新商品: ${productUpdated} 个`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
