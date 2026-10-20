/**
 * Input: 捷淞汇总文件夹中的Excel文件（发票工作表）
 * Output: 更新 PackingItem 表的单价和总价数据
 * Pos: 数据导入脚本，从原始Excel获取历史单价
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { execSync } = require('child_process');
const path = require('path');

const backendPath = path.join(__dirname, '../backend');
process.chdir(backendPath);
const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const prisma = new PrismaClient();

const EXCEL_DIR = '/Users/helena/Downloads/捷淞汇总';

/**
 * 职责：使用Python读取Excel的发票工作表，提取单价数据
 */
function readInvoiceData(filePath) {
  const pythonScript = `
import pandas as pd
import json
import sys

file_path = """${filePath}"""

try:
    xl = pd.ExcelFile(file_path)
    
    # 查找发票工作表
    invoice_sheet = None
    for sheet in xl.sheet_names:
        if '发' in sheet or '票' in sheet:
            invoice_sheet = sheet
            break
    
    if not invoice_sheet:
        print(json.dumps({"error": "未找到发票工作表"}))
        sys.exit(0)
    
    # 读取数据，跳过前7行（表头在第8行）
    df = pd.read_excel(file_path, sheet_name=invoice_sheet, header=7)
    df.columns = [str(c).strip().replace('\\n', '') for c in df.columns]
    
    # 找到相关列
    name_col = None
    price_col = None
    total_col = None
    qty_col = None
    
    for col in df.columns:
        if '货物名称' in col or 'Name' in col:
            name_col = col
        elif '单价' in col:
            price_col = col
        elif '总价' in col:
            total_col = col
        elif '数量' in col:
            qty_col = col
    
    result = []
    for idx, row in df.iterrows():
        name = row.get(name_col, '') if name_col else ''
        if pd.isna(name) or not str(name).strip() or '总计' in str(name) or 'TOTAL' in str(name).upper():
            continue
        
        def to_num(v):
            if pd.isna(v):
                return None
            try:
                return float(v)
            except:
                return None
        
        result.append({
            "productName": str(name).strip(),
            "unitPrice": to_num(row.get(price_col)) if price_col else None,
            "totalPrice": to_num(row.get(total_col)) if total_col else None,
            "quantity": to_num(row.get(qty_col)) if qty_col else None,
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

function findExcelFiles() {
  const output = execSync(
    `find "${EXCEL_DIR}" -name "*EXP25*.xlsx" -type f`,
    { encoding: 'utf-8' }
  );
  return output.trim().split('\n').filter(f => f);
}

function extractContractNo(filePath) {
  const filename = path.basename(filePath);
  const match = filename.match(/EXP25\d+/);
  return match ? match[0] : null;
}

async function main() {
  console.log('=== 从Excel导入单价数据 ===\n');
  
  // 1. 获取商品映射
  console.log('1. 加载商品数据...');
  const products = await prisma.product.findMany();
  const productMap = new Map();
  for (const p of products) {
    productMap.set(p.customsName, p.id);
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
    if (!contractNo) continue;
    
    console.log(`\n   处理: ${contractNo}`);
    
    const contract = await prisma.salesContract.findFirst({
      where: { contractNo },
      include: { packingItems: { include: { product: true } } },
    });
    
    if (!contract) {
      console.log(`     - 数据库中未找到合同`);
      continue;
    }
    
    const excelData = readInvoiceData(filePath);
    if (excelData.error) {
      console.log(`     - 错误: ${excelData.error}`);
      continue;
    }
    
    console.log(`     - Excel中有 ${excelData.length} 条发票数据`);
    
    // 匹配并更新单价
    for (const item of contract.packingItems) {
      const productName = item.product?.customsName;
      if (!productName) continue;
      
      const excelItem = excelData.find(e => {
        const eName = e.productName.replace(/\s+/g, '');
        const dbName = productName.replace(/\s+/g, '');
        return eName === dbName || eName.includes(dbName) || dbName.includes(eName);
      });
      
      if (excelItem && excelItem.unitPrice !== null) {
        const totalPrice = excelItem.unitPrice * item.quantity;
        
        await prisma.packingItem.update({
          where: { id: item.id },
          data: { 
            unitPrice: excelItem.unitPrice,
            totalPrice,
          },
        });
        console.log(`     + ${productName}: $${excelItem.unitPrice} × ${item.quantity} = $${totalPrice.toFixed(2)}`);
        totalUpdated++;
      }
    }
    
    // 重新计算装箱货值；正式合同金额已锁定时不得覆盖合同表头
    const stats = await prisma.packingItem.aggregate({
      where: { salesContractId: contract.id },
      _sum: { totalPrice: true },
    });
    
    if (stats._sum.totalPrice && contract.amountSource !== 'FORMAL_DOCUMENT') {
      await prisma.salesContract.update({
        where: { id: contract.id },
        data: { totalAmount: stats._sum.totalPrice },
      });
      console.log('     = 装箱货值与派生合同金额已更新');
    } else if (stats._sum.totalPrice) {
      console.log('     = 装箱货值已更新；正式合同金额保持不变');
    }
  }
  
  console.log('\n=== 完成 ===');
  console.log(`更新单价: ${totalUpdated} 条`);
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
