/**
 * Input: docs/申报要素.csv
 * Output: 更新 Product 表的 hsCode 和 declaration 字段
 * Pos: 数据导入脚本
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

const CSV_FILE = path.join(__dirname, '../docs/申报要素.csv');

/**
 * 职责：解析 CSV 文件
 */
function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.replace(/^\uFEFF/, '').trim());
  
  const records = [];
  for (let i = 1; i < lines.length; i++) {
    // 处理可能包含逗号的字段
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
  console.log('=== 导入商品申报要素 ===\n');
  
  // 1. 解析 CSV
  console.log('1. 解析 CSV...');
  const records = parseCSV(CSV_FILE);
  console.log(`   找到 ${records.length} 条记录\n`);
  
  // 2. 更新商品数据
  console.log('2. 更新商品数据...');
  let updatedCount = 0;
  let notFoundCount = 0;
  
  for (const r of records) {
    const productName = r['商品名称'];
    const hsCode = r['HS编码'];
    const declaration = r['申报要素'];
    
    if (!productName) continue;
    
    // 根据商品名称查找商品
    const product = await prisma.product.findFirst({
      where: { customsName: productName },
    });
    
    if (product) {
      // 更新商品
      await prisma.product.update({
        where: { id: product.id },
        data: {
          hsCode: hsCode || null,
          declaration: declaration || null,
        },
      });
      updatedCount++;
      console.log(`   + ${productName}: ${hsCode}`);
    } else {
      notFoundCount++;
      console.log(`   - ${productName}: 未找到匹配商品`);
    }
  }
  
  console.log(`\n=== 完成 ===`);
  console.log(`更新: ${updatedCount} 条`);
  console.log(`未匹配: ${notFoundCount} 条`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
