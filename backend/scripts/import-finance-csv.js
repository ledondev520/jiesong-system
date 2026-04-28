#!/usr/bin/env node
/**
 * Input: 银行流水CSV (捷淞-流水.csv)、发票CSV (捷淞全量发票.csv / 捷淞全量发票_去重.csv)
 * Output: FinanceDataBatch + BankTransaction / InvoiceRecord 写入 SQLite
 * Pos: 一次性数据导入脚本，可重复执行（每次创建新批次）
 *
 * 用法: node scripts/import-finance-csv.js [--bank <path>] [--invoice <path>]
 * 示例: node scripts/import-finance-csv.js --bank ../docs/捷淞-流水.csv --invoice ../docs/捷淞全量发票_去重.csv
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const COMPANY = '上海捷淞国际物流有限公司';

function safeFloat(val, fallback = 0) {
  const n = parseFloat(val);
  return isNaN(n) ? fallback : n;
}

/**
 * 职责：用 PapaParse 解析 CSV 文件为对象数组
 * 思路：PapaParse 正确处理引号、多行值和内嵌逗号
 */
function parseCSV(filePath) {
  let raw = fs.readFileSync(filePath, 'utf-8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const result = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return result.data;
}

// ────── 银行流水导入 ──────

/**
 * 职责：导入银行流水 CSV 到数据库
 * 思路：1. 创建批次 2. 逐行转换 3. 批量插入
 */
async function importBankFlow(csvPath) {
  console.log(`\n📥 导入银行流水: ${csvPath}`);
  const rows = parseCSV(csvPath);
  console.log(`  读取 ${rows.length} 行`);

  // 0. 确定数据时间范围
  const dates = rows
    .map(r => (r['交易时间'] || '').slice(0, 10))
    .filter(d => d.length === 10)
    .sort();

  const batch = await prisma.financeDataBatch.create({
    data: {
      type: 'BANK_FLOW',
      fileName: path.basename(csvPath),
      recordCount: rows.length,
      dataStartDate: dates[0] || null,
      dataEndDate: dates[dates.length - 1] || null,
      note: `银行流水导入 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`,
    },
  });
  console.log(`  批次ID: ${batch.id}`);

  // 1. 转换并批量插入
  const records = rows.filter(r => (r['交易金额'] || '').trim()).map(r => {
    const amt = safeFloat(r['交易金额']);
    const payer = (r['付方名称'] || '').trim();
    const payee = (r['收方名称'] || '').trim();
    const direction = amt < 0 ? 'OUT' : 'IN';
    const counterpart = direction === 'OUT' ? payee : payer;

    return {
      batchId: batch.id,
      txnTime: (r['交易时间'] || '').trim(),
      txnDate: (r['交易时间'] || '').slice(0, 10),
      amount: amt,
      payer: payer || null,
      payee: payee || null,
      summary: (r['摘要'] || '').trim() || null,
      txnType: (r['交易类型'] || '').trim() || null,
      txnId: (r['交易流水号'] || '').trim() || null,
      balance: r['余额'] ? safeFloat(r['余额'], null) : null,
      counterpart: counterpart || null,
      direction,
    };
  });

  const result = await prisma.bankTransaction.createMany({ data: records });
  console.log(`  ✅ 写入 ${result.count} 条银行流水`);
  return batch;
}

// ────── 发票导入 ──────

/**
 * 职责：导入发票 CSV 到数据库
 * 思路：1. 创建批次 2. 2025-04-15 去重 3. 批量插入
 */
async function importInvoices(csvPath) {
  console.log(`\n📥 导入发票: ${csvPath}`);
  const rows = parseCSV(csvPath);
  console.log(`  读取 ${rows.length} 行`);

  // 0. 2025-04-15 导出重复去重
  const seen0415 = new Set();
  let dupCount = 0;
  const dedupRows = [];
  for (const r of rows) {
    const dateStr = (r['开票日期'] || '').trim();
    if (dateStr.startsWith('2025-04-15')) {
      const keyParts = Object.keys(r)
        .filter(k => k !== '序号')
        .sort()
        .map(k => (r[k] || '').trim());
      const key = keyParts.join('|');
      if (seen0415.has(key)) { dupCount++; continue; }
      seen0415.add(key);
    }
    dedupRows.push(r);
  }
  if (dupCount) console.log(`  去重: 排除 ${dupCount} 条 2025-04-15 导出重复`);

  const dates = dedupRows
    .map(r => (r['开票日期'] || '').slice(0, 10))
    .filter(d => d.length === 10)
    .sort();

  const batch = await prisma.financeDataBatch.create({
    data: {
      type: 'INVOICE',
      fileName: path.basename(csvPath),
      recordCount: dedupRows.length,
      dataStartDate: dates[0] || null,
      dataEndDate: dates[dates.length - 1] || null,
      note: `发票数据导入 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}（已去除${dupCount}条重复）`,
    },
  });
  console.log(`  批次ID: ${batch.id}`);

  const records = dedupRows.filter(r => {
    const t = (r['价税合计'] || '').trim();
    return t && !isNaN(parseFloat(t));
  }).map(r => {
    let invNo = (r['数电发票号码'] || '').trim();
    if (!invNo || invNo === '--') invNo = (r['发票号码'] || '').trim();
    if (invNo === '--') invNo = null;

    return {
      batchId: batch.id,
      invNo: invNo || null,
      invCode: (r['发票代码'] || '').trim() || null,
      seller: (r['销方名称'] || '').trim(),
      sellerTaxId: (r['销方识别号'] || '').trim() || null,
      buyer: (r['购买方名称'] || '').trim() || null,
      buyerTaxId: (r['购方识别号'] || '').trim() || null,
      invDate: (r['开票日期'] || '').slice(0, 10),
      invDateFull: (r['开票日期'] || '').trim() || null,
      itemName: (r['货物或应税劳务名称'] || '').trim() || null,
      spec: (r['规格型号'] || '').trim() || null,
      unit: (r['单位'] || '').trim() || null,
      qty: r['数量'] ? safeFloat(r['数量'], null) : null,
      unitPrice: r['单价'] ? safeFloat(r['单价'], null) : null,
      amount: safeFloat(r['金额']),
      taxRate: (r['税率'] || '').trim() || null,
      tax: safeFloat(r['税额']),
      total: safeFloat(r['价税合计']),
      invoiceType: (r['发票票种'] || '').trim() || null,
      status: (r['发票状态'] || '').trim(),
      isPositive: (r['是否正数发票'] || '').trim(),
      riskLevel: (r['发票风险等级'] || '').trim() || null,
      issuer: (r['开票人'] || '').trim() || null,
      remark: (r['备注'] || '').trim() || null,
      taxClassCode: (r['税收分类编码'] || '').trim() || null,
    };
  });

  // SQLite 单次 INSERT 有变量数限制，分批插入
  const CHUNK = 100;
  let inserted = 0;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const res = await prisma.invoiceRecord.createMany({ data: chunk });
    inserted += res.count;
  }
  console.log(`  ✅ 写入 ${inserted} 条发票记录`);
  return batch;
}

// ────── CLI 入口 ──────

async function main() {
  const args = process.argv.slice(2);
  let bankPath = null;
  let invoicePath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--bank' && args[i + 1]) bankPath = args[++i];
    if (args[i] === '--invoice' && args[i + 1]) invoicePath = args[++i];
  }

  if (!bankPath && !invoicePath) {
    bankPath = path.resolve(__dirname, '../../docs/捷淞-流水.csv');
    invoicePath = path.resolve(__dirname, '../../docs/捷淞全量发票_去重.csv');
    if (!fs.existsSync(invoicePath)) {
      invoicePath = path.resolve(__dirname, '../../docs/捷淞全量发票.csv');
    }
    console.log('未指定路径，使用默认:');
    console.log(`  银行流水: ${bankPath}`);
    console.log(`  发票: ${invoicePath}`);
  }

  if (bankPath) await importBankFlow(bankPath);
  if (invoicePath) await importInvoices(invoicePath);

  console.log('\n🎉 导入完成！');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error('❌ 导入失败:', e);
  process.exit(1);
});
