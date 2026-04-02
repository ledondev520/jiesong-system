/**
 * Input: 合同明细、美元交易.xlsx "概况" sheet (WPS 云文档缓存)
 * Output: 创建 Payment 记录（收入 + 支出，含 2024/2025/2026 年）
 * Pos: 数据导入脚本，从财务 Excel 导入完整收付款流水
 *
 * 运行: cd backend && node prisma/import-payments.js
 *
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { PrismaClient } = require('@prisma/client');
const XLSX = require('xlsx');

const prisma = new PrismaClient();
const FILE = process.env.FILE || '/Users/helena/Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/212320004/团队文档/捷淞/合同明细、美元交易.xlsx';
const QUIET = process.env.QUIET === '1';
const DEFAULT_RECEIVABLE_CUSTOMER_NAME = 'Sp food trading LLC';

/**
 * 职责：解析 "M/D/YY" 格式日期
 * @param {string} str - 日期字符串如 "3/18/24"
 * @returns {Date|null}
 */
function parseDate(str) {
  if (!str && str !== 0) return null;
  if (str instanceof Date) {
    return str;
  }
  if (typeof str === 'number' && Number.isFinite(str)) {
    const utcDays = Math.floor(str - 25569);
    const utcValue = utcDays * 86400;
    return new Date(utcValue * 1000);
  }
  const s = String(str).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const numeric = Number(s);
    if (Number.isFinite(numeric)) {
      const utcDays = Math.floor(numeric - 25569);
      const utcValue = utcDays * 86400;
      return new Date(utcValue * 1000);
    }
  }
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  const yearPart = parseInt(parts[2], 10);
  const year = yearPart < 100 ? 2000 + yearPart : yearPart;
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

/**
 * 职责：解析带逗号/空格的金额字符串
 * @param {string|number} str - 如 " 4,994.00 " 或 " -42,684.20 "
 * @returns {number}
 */
function parseAmount(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const cleaned = String(str).replace(/[,，\s$￥]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : val;
}

/**
 * 职责：从合同号字段提取 EXP 编号（兼容 EXP2400001 和 EXP250011 格式）
 * @param {string} note - 合同号字段
 * @returns {string|null}
 */
function extractEXPNo(note) {
  const normalized = String(note || '').toUpperCase();
  const m = normalized.match(/EXP\d{6,}/);
  if (m) return m[0];
  const m2 = normalized.match(/EXP\d{5,}/);
  return m2 ? m2[0] : null;
}

function buildPaymentNote({ contractRef, store, usage, year }) {
  const normalizedRef = String(contractRef || '').trim();
  const expNo = extractEXPNo(normalizedRef);
  const parts = [];

  if (expNo) {
    parts.push(`合同号:${expNo}`);
  } else if (normalizedRef) {
    parts.push(`原始单号:${normalizedRef}`);
  } else if (year) {
    parts.push(`年度:${String(year).trim()}`);
  }

  if (store) {
    parts.push(`门店:${String(store).trim()}`);
  }

  if (usage) {
    parts.push(`用途:${String(usage).trim()}`);
  }

  return parts.join(' | ');
}

async function main() {
  console.log('=== 导入收付款记录（完整版）===\n');

  // 0. 清除旧数据
  const oldCount = await prisma.payment.count();
  if (oldCount > 0) {
    await prisma.payment.deleteMany();
    console.log(`已清除旧 Payment 记录: ${oldCount} 条\n`);
  }

  // 1. 读取 Excel "概况" sheet
  const wb = XLSX.readFile(FILE);
  const ws = wb.Sheets['概况'];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });

  // 2. 预加载出口合同（用于关联）
  const salesContracts = await prisma.salesContract.findMany({
    select: { id: true, contractNo: true },
  });
  const scMap = new Map(salesContracts.map((c) => [c.contractNo, c.id]));

  let created = 0;
  let incomeTotal = 0;
  let expenseTotal = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const year = String(row[0] || '').trim();
    const dateStr = String(row[1] || '').trim();
    const contractRef = String(row[2] || '').trim();
    const store = String(row[3] || '').trim();
    const usage = String(row[4] || '').trim();
    const amountUSD = parseAmount(row[5]);

    // 2.1 跳过空行和汇总行
    if (!dateStr || amountUSD === 0) continue;
    if (!year || year === '总计') continue;

    const paymentDate = parseDate(dateStr);
    if (!paymentDate) continue;

    // 2.2 判断收入/支出
    const isIncome = usage === '收入' || amountUSD > 0;
    const type = isIncome ? 'INCOME' : 'EXPENSE';
    const absAmount = Math.round(Math.abs(amountUSD) * 100) / 100;

    if (isIncome) incomeTotal += absAmount;
    else expenseTotal += absAmount;

    // 2.3 尝试关联出口合同
    let salesContractId = null;
    const expNo = extractEXPNo(contractRef);
    if (expNo) {
      salesContractId = scMap.get(expNo) || null;
    }

    // 2.4 构建备注
    const note = buildPaymentNote({
      contractRef,
      store,
      usage,
      year,
    });

    await prisma.payment.create({
      data: {
        type,
        salesContractId,
        customerName: isIncome ? DEFAULT_RECEIVABLE_CUSTOMER_NAME : null,
        amount: absAmount,
        currency: 'USD',
        paymentMethod: '电汇',
        paymentDate,
        note,
      },
    });
    created++;

    if (!QUIET) {
      const icon = type === 'INCOME' ? '📥' : '📤';
      const linked = salesContractId ? '✓' : ' ';
      console.log(`  ${icon} ${year} ${dateStr.padEnd(10)} ${note.padEnd(30)} $${absAmount.toFixed(2).padStart(12)} [${linked}]`);
    }
  }

  console.log(`\n=== 导入完成 ===`);
  console.log(`创建: ${created} 条`);
  console.log(`收入: $${incomeTotal.toFixed(2)}`);
  console.log(`支出: $${expenseTotal.toFixed(2)}`);
  console.log(`余额: $${(incomeTotal - expenseTotal).toFixed(2)}`);

  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
}

module.exports = {
  parseDate,
  parseAmount,
  extractEXPNo,
  buildPaymentNote,
  main,
};
