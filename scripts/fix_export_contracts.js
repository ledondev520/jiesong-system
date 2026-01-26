/**
 * Input: docs/出口合同汇总.csv（含美元金额）
 * Output: 修复 SalesContract 的美元金额 + 创建 PackingItem 装箱明细
 * Pos: 数据修复脚本
 * 
 * 2026-01-26 修正：
 *   - 箱数(boxes)不再使用数量(quantity)作为默认值
 *   - 如果CSV中没有箱数字段，boxes 置为 null 而非推导值
 *   - 合同的 totalBoxes 也可能为 null（当无有效箱数数据时）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

const CSV_FILE = path.join(__dirname, '../docs/出口合同汇总.csv');

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

/**
 * 职责：解析尺寸字符串（如 "2654*1160*1100"）
 * @returns {length, width, height} 单位 mm
 */
function parseSpec(spec) {
  if (!spec) return { length: 0, width: 0, height: 0 };
  const match = spec.match(/(\d+)\s*[*xX×]\s*(\d+)\s*[*xX×]\s*(\d+)/);
  if (match) {
    return {
      length: parseFloat(match[1]),
      width: parseFloat(match[2]),
      height: parseFloat(match[3]),
    };
  }
  return { length: 0, width: 0, height: 0 };
}

async function main() {
  console.log('=== 修复出口合同数据 ===\n');
  
  // 1. 解析 CSV
  console.log('1. 解析 CSV...');
  const records = parseCSV(CSV_FILE);
  console.log(`   找到 ${records.length} 条记录\n`);
  
  // 2. 按合同号分组
  console.log('2. 分析合同数据...');
  const contractMap = new Map();
  
  for (const r of records) {
    const contractNo = r['出口合同号'];
    const productName = r['商品名称'];
    
    if (!contractNo || !productName) continue;
    
    if (!contractMap.has(contractNo)) {
      contractMap.set(contractNo, {
        storeName: r['发货店铺'] || '',
        items: [],
        totalAmountUSD: 0,
        totalBoxes: 0,
        grossWeight: 0,
        volume: 0,
      });
    }
    
    const sellingPriceUSD = parseFloat(r['售出总价USD']) || 0;
    const grossWeight = parseFloat(r['毛重']) || 0;
    const volume = parseFloat(r['体积']) || 0;
    const quantity = parseFloat(r['数量']) || 0;
    const spec = parseSpec(r['规格']);
    
    // 按商品去重（同商品可能有多行）
    const existingItem = contractMap.get(contractNo).items.find(i => i.productName === productName && i.spec === r['规格']);
    if (existingItem) {
      existingItem.sellingPriceUSD += sellingPriceUSD;
      existingItem.grossWeight += grossWeight;
      existingItem.volume += volume;
      existingItem.quantity += quantity;
    } else {
      // 注意：箱数(boxes)需要单独获取，不能用数量代替
      // 如果CSV中没有箱数字段，则置空而非使用默认值
      const boxesRaw = r['箱数'];
      const boxes = boxesRaw ? parseFloat(boxesRaw) : null;
      
      contractMap.get(contractNo).items.push({
        productName,
        spec: r['规格'] || '',
        quantity,
        unit: '',
        boxes, // 没有数据时为null，不使用数量作为默认值
        grossWeight,
        volume,
        sellingPriceUSD,
        ...spec, // length, width, height
      });
    }
    
    // 累加合同汇总
    contractMap.get(contractNo).totalAmountUSD += sellingPriceUSD;
    contractMap.get(contractNo).grossWeight += grossWeight;
    contractMap.get(contractNo).volume += volume;
  }
  
  console.log(`   找到 ${contractMap.size} 个出口合同\n`);
  
  // 3. 获取商品和店铺映射
  console.log('3. 准备基础数据...');
  const productMap = new Map();
  const products = await prisma.product.findMany();
  for (const p of products) {
    productMap.set(p.customsName, p.id);
  }
  
  const storeMap = new Map();
  const stores = await prisma.store.findMany();
  for (const s of stores) {
    storeMap.set(s.name, s.id);
  }
  const defaultStoreId = stores[0]?.id;
  
  console.log(`   商品: ${products.length}, 店铺: ${stores.length}\n`);
  
  // 4. 更新合同和创建装箱明细
  console.log('4. 更新合同数据...');
  let contractUpdated = 0;
  let packingCreated = 0;
  
  for (const [contractNo, data] of contractMap) {
    // 查找合同
    const contract = await prisma.salesContract.findFirst({
      where: { contractNo },
    });
    
    if (!contract) {
      console.log(`   - ${contractNo}: 未找到`);
      continue;
    }
    
    // 计算总箱数（只统计有箱数数据的项目）
    const itemsWithBoxes = data.items.filter(item => item.boxes !== null && item.boxes !== undefined);
    const totalBoxes = itemsWithBoxes.length > 0 
      ? itemsWithBoxes.reduce((sum, item) => sum + item.boxes, 0) 
      : null; // 如果没有任何箱数数据，总箱数也置空
    
    // 更新合同金额和货柜信息
    await prisma.salesContract.update({
      where: { id: contract.id },
      data: {
        totalAmount: data.totalAmountUSD,
        totalBoxes: totalBoxes, // 可能为null
        grossWeight: data.grossWeight,
        volume: data.volume,
      },
    });
    contractUpdated++;
    
    // 删除旧的装箱明细
    await prisma.packingItem.deleteMany({
      where: { salesContractId: contract.id },
    });
    
    // 创建新的装箱明细
    const storeId = storeMap.get(data.storeName) || defaultStoreId;
    
    for (const item of data.items) {
      const productId = productMap.get(item.productName);
      if (!productId) {
        console.log(`     ! 未找到商品: ${item.productName}`);
        continue;
      }
      
      await prisma.packingItem.create({
        data: {
          salesContractId: contract.id,
          productId,
          storeId,
          quantity: item.quantity || 1,
          boxes: item.boxes, // 如果没有箱数数据则为null，不使用默认值
          grossWeight: item.grossWeight || 0,
          netWeight: item.grossWeight * 0.9 || 0, // 估算净重
          volume: item.volume || 0,
          length: item.length || null,
          width: item.width || null,
          height: item.height || null,
        },
      });
      packingCreated++;
    }
    
    console.log(`   + ${contractNo}: $${data.totalAmountUSD.toLocaleString()} USD, ${data.items.length} 商品, ${totalBoxes} 箱`);
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`更新合同: ${contractUpdated}`);
  console.log(`创建装箱明细: ${packingCreated}`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
