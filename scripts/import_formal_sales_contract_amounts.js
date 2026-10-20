/**
 * Input: 受限 JSON 中的 EXP 合同号与正式美元合同金额
 * Output: dry-run 差异计数；--apply 时锁定正式合同金额来源并写入 SQLite
 * Pos: 正式出口合同金额导入 Module；不在日志、Git 或普通附件中保留合同金额
 *
 * JSON: { "contracts": [{ "contractNo": "EXP...", "totalAmount": 1.23 }] }
 * Usage: node scripts/import_formal_sales_contract_amounts.js --input <restricted.json> [--expected-count 45] [--apply]
 *
 * Note: 我被更新时，必须同步更新本头注释 + scripts/README.md。
 */

const fs = require('fs');
const path = require('path');
const prisma = require('../backend/src/utils/prisma');
const { SALES_AMOUNT_SOURCE } = require('../backend/src/services/salesContractAmount');

const parseArgs = (argv) => {
  const options = { apply: false, input: '', expectedCount: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--input') options.input = argv[index += 1] || '';
    else if (arg === '--expected-count') options.expectedCount = Number(argv[index += 1]);
    else throw new Error(`未知参数：${arg}`);
  }
  if (!options.input) throw new Error('必须传入 --input <restricted.json>');
  if (options.expectedCount !== null && (!Number.isInteger(options.expectedCount) || options.expectedCount <= 0)) {
    throw new Error('--expected-count 必须为正整数');
  }
  return options;
};

const normalizeRows = (payload, expectedCount) => {
  const rows = Array.isArray(payload?.contracts) ? payload.contracts : [];
  if (expectedCount !== null && rows.length !== expectedCount) {
    throw new Error(`正式合同数量不符：期望 ${expectedCount}，实际 ${rows.length}`);
  }

  const seen = new Set();
  return rows.map((row) => {
    const contractNo = String(row?.contractNo || '').trim().toUpperCase();
    const totalAmount = Number(row?.totalAmount);
    if (!/^EXP\d+$/.test(contractNo)) throw new Error('存在非法 EXP 合同号');
    if (seen.has(contractNo)) throw new Error('正式合同清单存在重复合同号');
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('存在非法正式合同金额');
    seen.add(contractNo);
    return { contractNo, totalAmount: Number(totalAmount.toFixed(2)) };
  });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(options.input);
  const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const rows = normalizeRows(payload, options.expectedCount);
  const existing = await prisma.salesContract.findMany({
    where: { contractNo: { in: rows.map((row) => row.contractNo) } },
    select: { id: true, contractNo: true, totalAmount: true, amountSource: true },
  });
  if (existing.length !== rows.length) throw new Error('数据库合同覆盖不完整，拒绝写入');

  const existingByNo = new Map(existing.map((row) => [row.contractNo, row]));
  const changes = rows.filter((row) => {
    const current = existingByNo.get(row.contractNo);
    return Math.abs(Number(current.totalAmount || 0) - row.totalAmount) > 0.005
      || current.amountSource !== SALES_AMOUNT_SOURCE.FORMAL_DOCUMENT;
  });

  if (options.apply && changes.length > 0) {
    const verifiedAt = new Date();
    await prisma.$transaction(changes.map((row) => prisma.salesContract.update({
      where: { id: existingByNo.get(row.contractNo).id },
      data: {
        totalAmount: row.totalAmount,
        amountSource: SALES_AMOUNT_SOURCE.FORMAL_DOCUMENT,
        amountVerifiedAt: verifiedAt,
      },
    })));
  }

  process.stdout.write(`${JSON.stringify({
    mode: options.apply ? 'apply' : 'dry-run',
    inputCount: rows.length,
    databaseMatchCount: existing.length,
    changedCount: changes.length,
    unchangedCount: rows.length - changes.length,
  })}\n`);
};

main()
  .catch((error) => {
    process.stderr.write(`正式合同金额导入失败：${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
