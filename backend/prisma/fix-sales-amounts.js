/**
 * Input: 外销出口合同 Excel 文件 (合同sheet 中的 USD 总计行)
 * Output: 补全 SalesContract.totalAmount (USD)
 * Pos: 修复脚本，从 Excel 外销合同中提取 USD 总金额
 *
 * 运行: cd backend && node prisma/fix-sales-amounts.js
 */

const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

/**
 * 职责：递归查找指定目录下的 xlsx 文件
 */
function findXLSX(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) findXLSX(p, results);
    else if (entry.isFile() && p.endsWith('.xlsx')) results.push(p);
  }
  return results;
}

/**
 * 职责：从 Excel "合同" sheet 中提取 USD 总金额
 * 思路：
 *   0. 找到含 "合 同" 的 sheet
 *   1. 找包含 "总计" 或 "TOTAL" 的行
 *   2. 取该行第 6 列 (index 5) 的数值
 */
function extractUSDTotal(filePath) {
  try {
    const wb = XLSX.readFile(filePath);
    // 0. 找合同 sheet
    const contractSheet = wb.SheetNames.find((n) =>
      n.replace(/\s/g, '').includes('合同'),
    ) || wb.SheetNames[0];
    const ws = wb.Sheets[contractSheet];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // 1. 找总计行
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      const first = String(row[0] || '').toLowerCase();
      const second = String(row[1] || '').toLowerCase();
      if (first.includes('总计') || first.includes('total') ||
          second.includes('总计') || second.includes('total')) {
        const amount = parseFloat(row[5]);
        if (!isNaN(amount) && amount > 0) return amount;
      }
    }

    // 2. 备选：累加所有数值行
    let sum = 0;
    for (let i = 8; i < data.length; i++) {
      const val = parseFloat(data[i][5]);
      if (!isNaN(val) && val > 0) sum += val;
    }
    return sum > 0 ? sum : null;
  } catch {
    return null;
  }
}

/**
 * 职责：从文件名中提取 EXP 合同编号
 */
function extractEXPNo(filename) {
  const m = filename.match(/EXP\d{5,}/);
  return m ? m[0] : null;
}

async function main() {
  console.log('=== 从外销合同 Excel 提取 USD 金额 ===\n');

  // 0. 扫描文件
  const dirs = [
    '/Users/helena/Downloads/捷淞汇总',
    '/Users/helena/Downloads',
  ];
  const allFiles = [];
  for (const d of dirs) allFiles.push(...findXLSX(d));

  // 1. 提取 EXP 文件（去重，优先归档版）
  const expFiles = new Map();
  for (const filePath of allFiles) {
    const filename = path.basename(filePath);
    if (!filename.includes('外销出口')) continue;
    const expNo = extractEXPNo(filename);
    if (!expNo) continue;
    const isArchived = filename.includes('归档');
    if (!expFiles.has(expNo) || (isArchived && !expFiles.get(expNo).isArchived)) {
      expFiles.set(expNo, { filePath, filename, isArchived });
    }
  }

  console.log(`找到 ${expFiles.size} 个外销合同 Excel`);

  // 2. 只处理 totalAmount = 0 的合同
  const zeroContracts = await prisma.salesContract.findMany({
    where: { totalAmount: 0, contractNo: { not: { startsWith: 'PENDING' } } },
    select: { id: true, contractNo: true },
  });

  let updated = 0;
  for (const contract of zeroContracts) {
    const fileInfo = expFiles.get(contract.contractNo);
    if (!fileInfo) {
      console.log(`  [无文件] ${contract.contractNo}`);
      continue;
    }

    const amount = extractUSDTotal(fileInfo.filePath);
    if (amount && amount > 0) {
      await prisma.salesContract.update({
        where: { id: contract.id },
        data: { totalAmount: Math.round(amount * 100) / 100 },
      });
      console.log(`  ✅ ${contract.contractNo} → $${amount.toFixed(2)} (from ${fileInfo.filename})`);
      updated++;
    } else {
      console.log(`  [无金额] ${contract.contractNo} (${fileInfo.filename})`);
    }
  }

  console.log(`\n更新 ${updated}/${zeroContracts.length} 个合同`);

  // 3. 统计
  const remaining = await prisma.salesContract.count({ where: { totalAmount: 0 } });
  console.log(`仍无金额的合同: ${remaining}`);

  await prisma.$disconnect();
}

main();
