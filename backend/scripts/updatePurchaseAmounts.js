/**
 * Input: 出货汇总CSV
 * Output: 更新采购合同金额
 * Pos: 修复脚本，补充采购金额数据
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 解析金额
function parseAmount(value) {
  if (!value || value === '') return null;
  // 移除引号、逗号、空格
  const cleaned = String(value)
    .replace(/"/g, '')
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

async function main() {
  const csvPath = path.join(__dirname, '../../出货汇总(1).csv');
  
  if (!fs.existsSync(csvPath)) {
    console.log('CSV文件不存在:', csvPath);
    return;
  }
  
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const parsed = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  
  // 汇总每个合同的金额
  const contractAmounts = new Map();
  
  for (const row of parsed.data) {
    const contractNo = (row['购销合同号'] || '').trim();
    const amount = parseAmount(row['采购金额']);
    const isPaid = row['是否付款'] === '1' || row['是否付款'] === '是';
    
    if (contractNo && amount && amount > 0) {
      if (!contractAmounts.has(contractNo)) {
        contractAmounts.set(contractNo, { total: 0, paid: 0 });
      }
      const current = contractAmounts.get(contractNo);
      current.total += amount;
      if (isPaid) {
        current.paid += amount;
      }
    }
  }
  
  console.log('找到', contractAmounts.size, '个有金额的合同');
  
  // 更新数据库
  let updated = 0;
  for (const [contractNo, amounts] of contractAmounts) {
    try {
      const result = await prisma.purchaseContract.updateMany({
        where: { contractNo },
        data: {
          totalAmount: amounts.total,
          paidAmount: amounts.paid,
        },
      });
      if (result.count > 0) {
        console.log('  更新', contractNo, ': 总额', amounts.total, '已付', amounts.paid);
        updated++;
      }
    } catch (e) {
      console.error('  更新失败', contractNo, ':', e.message);
    }
  }
  
  console.log('\n总计更新', updated, '个合同');
  
  // 验证
  const total = await prisma.purchaseContract.aggregate({
    _sum: { totalAmount: true, paidAmount: true },
  });
  console.log('\n数据库总金额:', total._sum.totalAmount);
  console.log('数据库已付:', total._sum.paidAmount);
  
  await prisma.$disconnect();
}

main().catch(console.error);
