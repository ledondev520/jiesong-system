/**
 * Input: 出货汇总0315.csv (合同号 + 出货日期)
 * Output: 补全 SalesContract.signedAt
 * Pos: 修复脚本，从 CSV 出货日期推断合同签订日期
 *
 * 运行: cd backend && node prisma/fix-sales-signed-dates.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const prisma = new PrismaClient();
const CSV_PATH = path.resolve(__dirname, '../../出货汇总0315.csv');

async function main() {
  console.log('=== 修复 SalesContract.signedAt ===\n');

  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() });

  // 0. 按合同号收集最早出货日期
  const dateMap = new Map();
  for (const row of data) {
    const contractNo = (row['合同号'] || '').trim();
    const dateStr = (row['出货日期'] || '').trim();
    if (!contractNo || !contractNo.startsWith('EXP') || !dateStr) continue;

    const parsed = new Date(dateStr.replace(/\//g, '-'));
    if (isNaN(parsed.getTime())) continue;

    const existing = dateMap.get(contractNo);
    if (!existing || parsed < existing) {
      dateMap.set(contractNo, parsed);
    }
  }

  console.log(`CSV 中找到 ${dateMap.size} 个 EXP 合同的出货日期`);

  // 1. 对没有 CSV 日期的合同，按合同号推断
  const contracts = await prisma.salesContract.findMany({
    where: { signedAt: null },
    select: { id: true, contractNo: true },
  });

  let updated = 0;
  for (const c of contracts) {
    let signedAt = dateMap.get(c.contractNo);

    if (!signedAt) {
      // 1.1 从合同编号推断大致年月
      const match = c.contractNo.match(/^EXP(\d{2})(\d{2,5})/);
      if (match) {
        const year = 2000 + parseInt(match[1], 10);
        const seq = parseInt(match[2], 10);
        // 按序号近似分布到月份（每年约30个合同）
        const month = Math.min(11, Math.floor((seq - 1) / 3));
        signedAt = new Date(year, month, 15);
      }
    }

    if (!signedAt && c.contractNo.startsWith('PENDING')) {
      signedAt = new Date(2026, 2, 1);
    }

    if (signedAt) {
      await prisma.salesContract.update({
        where: { id: c.id },
        data: { signedAt },
      });
      updated++;
      console.log(`  ${c.contractNo} → ${signedAt.toISOString().slice(0, 10)}`);
    }
  }

  console.log(`\n更新 ${updated}/${contracts.length} 个合同`);

  // 2. 验证
  const sixAgo = new Date();
  sixAgo.setMonth(sixAgo.getMonth() - 6);
  const recent = await prisma.salesContract.count({
    where: { signedAt: { not: null, gte: sixAgo } },
  });
  console.log(`最近6个月的合同数: ${recent}`);

  await prisma.$disconnect();
}

main();
