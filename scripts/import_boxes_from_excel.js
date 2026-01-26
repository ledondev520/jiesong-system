/**
 * Input: 捷淞汇总文件夹中的Excel文件（箱单工作表）
 * Output: 更新 PackingItem 表的箱数数据
 * Pos: 数据导入脚本，从原始Excel获取真实箱数
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { execSync } = require('child_process');
const path = require('path');

const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

// Excel文件目录
const EXCEL_DIR = '/Users/helena/Downloads/捷淞汇总';

/**
 * 职责：使用Python读取Excel的箱单工作表
 * @param {string} filePath - Excel文件路径
 * @returns {Array} 箱数数据数组 [{productName, boxes, quantity, grossWeight}]
 */
function readPackingList(filePath) {
  const pythonScript = `
import pandas as pd
import json
import sys

file_path = """${filePath}"""

try:
    xl = pd.ExcelFile(file_path)
    
    # 查找箱单工作表（可能有空格）
    packing_sheet = None
    for sheet in xl.sheet_names:
        if '箱' in sheet:
            packing_sheet = sheet
            break
    
    if not packing_sheet:
        print(json.dumps({"error": "未找到箱单工作表", "sheets": xl.sheet_names}))
        sys.exit(0)
    
    # 读取数据，跳过前7行（表头在第8行，索引7）
    df = pd.read_excel(file_path, sheet_name=packing_sheet, header=7)
    
    # 清理列名（去除空格和换行）
    df.columns = [str(c).strip().replace('\\n', '') for c in df.columns]
    
    # 找到相关列
    name_col = None
    boxes_col = None
    quantity_col = None
    weight_col = None
    
    for col in df.columns:
        if '货物名称' in col or 'Name' in col:
            name_col = col
        elif '数量（箱）' in col or '箱' in col:
            boxes_col = col
        elif col == '数量':
            quantity_col = col
        elif '毛重' in col:
            weight_col = col
    
    result = []
    for idx, row in df.iterrows():
        name = row.get(name_col, '') if name_col else ''
        if pd.isna(name) or not str(name).strip() or '总计' in str(name) or 'TOTAL' in str(name).upper():
            continue
        
        boxes = row.get(boxes_col) if boxes_col else None
        quantity = row.get(quantity_col) if quantity_col else None
        weight = row.get(weight_col) if weight_col else None
        
        # 转换为数值
        def to_num(v):
            if pd.isna(v):
                return None
            try:
                return float(v)
            except:
                return None
        
        result.append({
            "productName": str(name).strip(),
            "boxes": to_num(boxes),
            "quantity": to_num(quantity),
            "grossWeight": to_num(weight)
        })
    
    print(json.dumps(result, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;

  try {
    const output = execSync(`python3 -c '${pythonScript.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(output.trim());
  } catch (e) {
    console.error(`  读取文件失败: ${e.message}`);
    return { error: e.message };
  }
}

/**
 * 职责：找到所有EXP25开头的Excel文件
 */
function findExcelFiles() {
  const output = execSync(
    `find "${EXCEL_DIR}" -name "*EXP25*.xlsx" -type f`,
    { encoding: 'utf-8' }
  );
  return output.trim().split('\n').filter(f => f);
}

/**
 * 职责：从文件名提取合同号
 */
function extractContractNo(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/EXP25\d+/);
  return match ? match[0] : null;
}

async function main() {
  console.log('=== 从Excel导入箱数数据 ===\n');
  
  // 1. 获取商品映射（名称 -> ID）
  console.log('1. 加载商品数据...');
  const products = await prisma.product.findMany();
  const productMap = new Map();
  for (const p of products) {
    productMap.set(p.customsName, p.id);
    // 也用简化名称匹配
    const simpleName = p.customsName.replace(/\s+/g, '');
    if (simpleName !== p.customsName) {
      productMap.set(simpleName, p.id);
    }
  }
  console.log(`   商品: ${products.length} 个\n`);
  
  // 2. 查找所有Excel文件
  console.log('2. 查找Excel文件...');
  const files = findExcelFiles();
  console.log(`   找到 ${files.length} 个文件\n`);
  
  // 3. 处理每个文件
  console.log('3. 处理文件...');
  let totalUpdated = 0;
  
  for (const filePath of files) {
    const contractNo = extractContractNo(filePath);
    if (!contractNo) {
      console.log(`   跳过: ${path.basename(filePath)} (无法提取合同号)`);
      continue;
    }
    
    console.log(`\n   处理: ${contractNo}`);
    
    // 查找合同
    const contract = await prisma.salesContract.findFirst({
      where: { contractNo },
      include: { packingItems: { include: { product: true } } },
    });
    
    if (!contract) {
      console.log(`     - 数据库中未找到合同`);
      continue;
    }
    
    // 读取Excel数据
    const excelData = readPackingList(filePath);
    if (excelData.error) {
      console.log(`     - 错误: ${excelData.error}`);
      continue;
    }
    
    console.log(`     - Excel中有 ${excelData.length} 条商品数据`);
    
    // 匹配并更新箱数
    for (const item of contract.packingItems) {
      const productName = item.product?.customsName;
      if (!productName) continue;
      
      // 在Excel数据中查找匹配的商品
      const excelItem = excelData.find(e => {
        const eName = e.productName.replace(/\s+/g, '');
        const dbName = productName.replace(/\s+/g, '');
        return eName === dbName || eName.includes(dbName) || dbName.includes(eName);
      });
      
      if (excelItem && excelItem.boxes !== null) {
        // 更新箱数
        await prisma.packingItem.update({
          where: { id: item.id },
          data: { boxes: Math.round(excelItem.boxes) },
        });
        console.log(`     + ${productName}: boxes = ${Math.round(excelItem.boxes)}`);
        totalUpdated++;
      }
    }
    
    // 重新计算合同总箱数
    const stats = await prisma.packingItem.aggregate({
      where: { salesContractId: contract.id, boxes: { not: null } },
      _sum: { boxes: true },
    });
    
    if (stats._sum.boxes) {
      await prisma.salesContract.update({
        where: { id: contract.id },
        data: { totalBoxes: stats._sum.boxes },
      });
      console.log(`     = 合同总箱数: ${stats._sum.boxes}`);
    }
  }
  
  console.log('\n=== 完成 ===');
  console.log(`更新箱数: ${totalUpdated} 条`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
