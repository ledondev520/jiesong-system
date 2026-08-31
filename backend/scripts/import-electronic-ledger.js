#!/usr/bin/env node
/**
 * Input: 财务软件导出的电子账簿 ZIP，可选 --confirm
 * Output: 月报、按月拆分的明细账和可追溯科目余额；默认只读预检
 * Pos: 跨月电子账簿导入 Adapter；不复制原文件，不输出文件名、金额或账户信息
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');
const prisma = require('../src/utils/prisma');
const financialStatementsService = require('../src/services/financialStatementsService');

const money = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const text = (value) => String(value ?? '').trim();
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const periodKey = (date) => date.toISOString().slice(0, 7);
const monthEnd = (key) => {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month, 0);
};

function readSheet(buffer, sheetName, skipRows) {
  const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: true });
  const actualName = workbook.SheetNames.find((name) => name.trim() === sheetName);
  if (!actualName) throw new Error(`电子账簿缺少必要工作表：${sheetName}`);
  return XLSX.utils.sheet_to_json(workbook.Sheets[actualName], {
    header: 1,
    defval: null,
    blankrows: true,
    raw: true,
  }).slice(skipRows);
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(`${value.toISOString().slice(0, 10)}T00:00:00.000Z`);
  }
  const normalized = text(value);
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(normalized)) return null;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function extractCompanyAndRange(rows) {
  const header = rows.slice(0, 4).flat().map(text).filter(Boolean).join(' ');
  const company = header.match(/(?:核算单位|编制单位|企业名称)[：:]\s*([^\s]+)/)?.[1] || null;
  const range = header.match(/(20\d{2})年(\d{1,2})月?\s*-\s*(20\d{2})年(\d{1,2})月?/);
  return {
    company,
    startPeriod: range ? `${range[1]}-${String(range[2]).padStart(2, '0')}` : null,
    endPeriod: range ? `${range[3]}-${String(range[4]).padStart(2, '0')}` : null,
  };
}

function parseRangeLedger(buffer) {
  const allRows = readSheet(buffer, '明细账', 0);
  const metadata = extractCompanyAndRange(allRows);
  const entries = allRows.slice(3).flatMap((row, index) => {
    const accountCode = text(row[0]);
    const accountName = text(row[1]);
    const summary = text(row[4]);
    const entryDate = parseDate(row[2]);
    if (!accountCode || !accountName || !summary || !entryDate) return [];
    const rowType = summary === '期初余额'
      ? 'OPENING'
      : summary === '本期合计'
        ? 'PERIOD_TOTAL'
        : summary === '本年累计'
          ? 'YTD_TOTAL'
          : 'ENTRY';
    return [{
      sourceRow: index + 4,
      rowType,
      accountCode,
      accountName,
      entryDate,
      voucherNumber: text(row[3]) || null,
      summary,
      debit: money(row[5]),
      credit: money(row[6]),
      direction: text(row[7]) || null,
      balance: money(row[8]),
    }];
  });
  return { ...metadata, entries };
}

function parseRangeTrialBalance(buffer) {
  const allRows = readSheet(buffer, '科目余额表', 0);
  const metadata = extractCompanyAndRange(allRows);
  const entries = allRows.slice(4).flatMap((row, index) => {
    const accountCode = text(row[0]) || null;
    const accountName = text(row[1]);
    if (!accountCode && !accountName) return [];
    return [{
      sourceRow: index + 5,
      rowType: accountCode ? 'ACCOUNT' : (accountName.includes('总计') ? 'TOTAL' : 'SUBTOTAL'),
      accountCode,
      accountName,
      openingDebit: money(row[2]),
      openingCredit: money(row[3]),
      periodDebit: money(row[4]),
      periodCredit: money(row[5]),
      yearDebit: money(row[6]),
      yearCredit: money(row[7]),
      endingDebit: money(row[8]),
      endingCredit: money(row[9]),
    }];
  });
  return { ...metadata, entries };
}

function monthKeys(startPeriod, endPeriod) {
  const [startYear, startMonth] = startPeriod.split('-').map(Number);
  const [endYear, endMonth] = endPeriod.split('-').map(Number);
  const keys = [];
  for (let year = startYear, month = startMonth; year < endYear || (year === endYear && month <= endMonth);) {
    keys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month === 13) {
      year += 1;
      month = 1;
    }
  }
  return keys;
}

const splitBalance = (direction, balance) => direction === '贷'
  ? { debit: 0, credit: Number(balance || 0) }
  : { debit: Number(balance || 0), credit: 0 };

function deriveMonthlyData(ledger) {
  const keys = monthKeys(ledger.startPeriod, ledger.endPeriod);
  const ledgerByPeriod = Object.fromEntries(keys.map((key) => [key, []]));
  for (const entry of ledger.entries) {
    const key = periodKey(entry.entryDate);
    if (!ledgerByPeriod[key]) throw new Error('明细账出现查询期间外的日期');
    ledgerByPeriod[key].push(entry);
  }

  const balancesByPeriod = {};
  const previousEnding = new Map();
  for (const key of keys) {
    const byAccount = new Map();
    for (const entry of ledgerByPeriod[key]) {
      const current = byAccount.get(entry.accountCode) || { accountName: entry.accountName };
      current.accountName = entry.accountName;
      if (entry.rowType === 'OPENING') current.opening = entry;
      if (entry.rowType === 'PERIOD_TOTAL') current.period = entry;
      if (entry.rowType === 'YTD_TOTAL') current.ytd = entry;
      byAccount.set(entry.accountCode, current);
    }
    const balances = [...byAccount.entries()].map(([accountCode, rows]) => {
      if (!rows.period || !rows.ytd) throw new Error(`账期 ${key} 的科目汇总行不完整`);
      const openingSource = rows.opening || previousEnding.get(accountCode);
      const opening = splitBalance(openingSource?.direction, openingSource?.balance);
      const ending = splitBalance(rows.ytd.direction, rows.ytd.balance);
      previousEnding.set(accountCode, rows.ytd);
      return {
        sourceRow: rows.ytd.sourceRow,
        rowType: 'ACCOUNT',
        accountCode,
        accountName: rows.accountName,
        openingDebit: opening.debit,
        openingCredit: opening.credit,
        periodDebit: Number(rows.period.debit || 0),
        periodCredit: Number(rows.period.credit || 0),
        yearDebit: Number(rows.ytd.debit || 0),
        yearCredit: Number(rows.ytd.credit || 0),
        endingDebit: ending.debit,
        endingCredit: ending.credit,
      };
    });
    balancesByPeriod[key] = balances.sort((left, right) => left.sourceRow - right.sourceRow);
  }
  return { keys, ledgerByPeriod, balancesByPeriod };
}

function validateRangeSources(ledger, trialBalance, monthly) {
  if (!ledger.startPeriod || !ledger.endPeriod || !trialBalance.startPeriod || !trialBalance.endPeriod) {
    throw new Error('未识别到跨月电子账簿的起止账期');
  }
  if (ledger.startPeriod !== trialBalance.startPeriod || ledger.endPeriod !== trialBalance.endPeriod) {
    throw new Error('科目余额与明细账的查询期间不一致');
  }
  if (!ledger.company || ledger.company !== trialBalance.company) throw new Error('科目余额与明细账的企业名称不一致');
  if (ledger.entries.length === 0) throw new Error('明细账没有可导入行');

  const trialAccounts = new Map(trialBalance.entries.filter((entry) => entry.accountCode).map((entry) => [entry.accountCode, entry]));
  const totals = new Map();
  for (const key of monthly.keys) {
    for (const balance of monthly.balancesByPeriod[key]) {
      const current = totals.get(balance.accountCode) || {
        openingDebit: balance.openingDebit,
        openingCredit: balance.openingCredit,
        periodDebit: 0,
        periodCredit: 0,
      };
      current.periodDebit += balance.periodDebit;
      current.periodCredit += balance.periodCredit;
      current.endingDebit = balance.endingDebit;
      current.endingCredit = balance.endingCredit;
      totals.set(balance.accountCode, current);
    }
  }
  if (trialAccounts.size !== totals.size) throw new Error('科目余额与明细账的科目数量不一致');
  const fields = ['openingDebit', 'openingCredit', 'periodDebit', 'periodCredit', 'endingDebit', 'endingCredit'];
  for (const [accountCode, expected] of trialAccounts) {
    const actual = totals.get(accountCode);
    if (!actual || fields.some((field) => Math.abs(Number(actual[field] || 0) - Number(expected[field] || 0)) > 0.01)) {
      throw new Error('科目余额与明细账汇总无法勾稽');
    }
  }
  return { accountCount: trialAccounts.size };
}

function archiveWorkbooks(zipPath) {
  const archive = new AdmZip(zipPath);
  const workbooks = archive.getEntries().filter((entry) => !entry.isDirectory && /\.xls(x)?$/i.test(entry.entryName)).map((entry) => {
    const buffer = entry.getData();
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true, cellDates: true });
    const sheets = new Set(workbook.SheetNames.map((name) => name.trim()));
    const kind = sheets.has('明细账')
      ? 'ledger'
      : sheets.has('科目余额表')
        ? 'trialBalance'
        : sheets.has('资产负债表') && sheets.has('利润表')
          ? 'statement'
          : null;
    return { buffer, kind, size: buffer.length, sha256: hash(buffer), extension: entry.entryName.toLowerCase().endsWith('.xls') ? 'xls' : 'xlsx' };
  }).filter((item) => item.kind);
  if (workbooks.filter((item) => item.kind === 'ledger').length !== 1) throw new Error('电子账簿必须且只能包含一份明细账');
  if (workbooks.filter((item) => item.kind === 'trialBalance').length !== 1) throw new Error('电子账簿必须且只能包含一份科目余额');
  return workbooks;
}

function statementPeriod(buffer) {
  const rows = readSheet(buffer, '利润表', 0).slice(0, 4).flat().map(text);
  const match = rows.join(' ').match(/(20\d{2})-(0[1-9]|1[0-2])(?:-\d{2})?/);
  if (!match) throw new Error('会计报表未识别到账期');
  return `${match[1]}-${match[2]}`;
}

async function prepareImport(zipPath, prismaClient = prisma) {
  const workbooks = archiveWorkbooks(zipPath);
  const ledgerSource = workbooks.find((item) => item.kind === 'ledger');
  const trialSource = workbooks.find((item) => item.kind === 'trialBalance');
  const ledger = parseRangeLedger(ledgerSource.buffer);
  const trialBalance = parseRangeTrialBalance(trialSource.buffer);
  const monthly = deriveMonthlyData(ledger);
  const reconciliation = validateRangeSources(ledger, trialBalance, monthly);

  const statementSources = workbooks.filter((item) => item.kind === 'statement');
  const statements = [];
  for (const source of statementSources) {
    const key = statementPeriod(source.buffer);
    const [year, month] = key.split('-').map(Number);
    const preview = await financialStatementsService.previewFromBuffer(source.buffer, year, month, `${year}年${month}账期`, prismaClient);
    if (!preview.ready) throw new Error(`账期 ${key} 的会计报表校验未通过：${preview.blockers.join('；')}`);
    statements.push({ key, source, preview });
  }
  const statementKeys = new Set(statements.map((item) => item.key));
  if (statementKeys.size !== statements.length) throw new Error('电子账簿包含重复账期的会计报表');
  if (statements.some((item) => !monthly.keys.includes(item.key))) throw new Error('会计报表账期超出明细账查询期间');
  if (statements.length && ledger.company !== '上海捷淞国际物流有限公司') throw new Error('电子账簿企业名称不正确');

  const existing = await prismaClient.financialPeriod.findMany({
    where: { OR: monthly.keys.map((key) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) })) },
    include: { dataSources: true, balanceSheet: { select: { id: true } }, incomeStatement: { select: { id: true } } },
  });
  return { workbooks, ledgerSource, trialSource, ledger, trialBalance, monthly, reconciliation, statements, existing };
}

function sourceMetadata(source, type, fileName, rowCount, sheetName) {
  return { type, fileName, fileSize: source.size, sha256: source.sha256, sheetName, rowCount };
}

async function persistPrepared(prepared, prismaClient = prisma) {
  const existingByKey = new Map(prepared.existing.map((period) => [`${period.year}-${String(period.month).padStart(2, '0')}`, period]));
  const statementByKey = new Map(prepared.statements.map((item) => [item.key, item]));
  let createdPeriods = 0;
  let importedStatements = 0;
  let importedLedgerPeriods = 0;
  let skippedUnchanged = 0;

  await prismaClient.$transaction(async (tx) => {
    for (const key of prepared.monthly.keys) {
      const [year, month] = key.split('-').map(Number);
      const existed = existingByKey.get(key);
      const period = await tx.financialPeriod.upsert({
        where: { year_month: { year, month } },
        create: { year, month, periodLabel: `${year}年${month}账期`, reportDate: monthEnd(key) },
        update: {},
      });
      if (!existed) createdPeriods += 1;

      const statement = statementByKey.get(key);
      const statementSource = existed?.dataSources.find((source) => source.type === 'STATEMENT');
      if (statement && statementSource?.sha256 !== statement.source.sha256) {
        await tx.balanceSheetEntry.upsert({
          where: { periodId: period.id },
          create: { periodId: period.id, ...statement.preview.balanceSheet },
          update: statement.preview.balanceSheet,
        });
        await tx.incomeStatementEntry.upsert({
          where: { periodId: period.id },
          create: { periodId: period.id, ...statement.preview.incomeStatement },
          update: statement.preview.incomeStatement,
        });
        const metadata = sourceMetadata(statement.source, 'STATEMENT', `电子账簿_${key}_会计报表.xlsx`, 2, '资产负债表/利润表');
        await tx.financialDataSource.upsert({
          where: { periodId_type: { periodId: period.id, type: 'STATEMENT' } },
          create: { periodId: period.id, ...metadata },
          update: metadata,
        });
        importedStatements += 1;
      } else if (statement) skippedUnchanged += 1;

      const ledgerRows = prepared.monthly.ledgerByPeriod[key];
      const balanceRows = key === prepared.trialBalance.endPeriod
        ? prepared.trialBalance.entries
        : prepared.monthly.balancesByPeriod[key];
      const ledgerSource = existed?.dataSources.find((source) => source.type === 'GENERAL_LEDGER');
      const balanceSource = existed?.dataSources.find((source) => source.type === 'TRIAL_BALANCE');
      const unchanged = ledgerSource?.sha256 === prepared.ledgerSource.sha256
        && balanceSource?.sha256 === prepared.trialSource.sha256
        && ledgerSource.rowCount === ledgerRows.length
        && balanceSource.rowCount === balanceRows.length;
      if (unchanged) {
        skippedUnchanged += 1;
        continue;
      }

      await tx.generalLedgerEntry.deleteMany({ where: { periodId: period.id } });
      await tx.generalLedgerEntry.createMany({ data: ledgerRows.map((entry) => ({ periodId: period.id, ...entry })) });
      await tx.accountBalanceEntry.deleteMany({ where: { periodId: period.id } });
      await tx.accountBalanceEntry.createMany({ data: balanceRows.map((entry) => ({ periodId: period.id, ...entry })) });
      const ledgerMetadata = sourceMetadata(prepared.ledgerSource, 'GENERAL_LEDGER', `电子账簿_${prepared.ledger.startPeriod}_${prepared.ledger.endPeriod}_明细账.xlsx`, ledgerRows.length, '明细账');
      const balanceMetadata = sourceMetadata(prepared.trialSource, 'TRIAL_BALANCE', `电子账簿_${prepared.trialBalance.startPeriod}_${prepared.trialBalance.endPeriod}_科目余额.${prepared.trialSource.extension}`, balanceRows.length, key === prepared.trialBalance.endPeriod ? '科目余额表' : '明细账派生科目余额');
      await tx.financialDataSource.upsert({
        where: { periodId_type: { periodId: period.id, type: 'GENERAL_LEDGER' } },
        create: { periodId: period.id, ...ledgerMetadata },
        update: ledgerMetadata,
      });
      await tx.financialDataSource.upsert({
        where: { periodId_type: { periodId: period.id, type: 'TRIAL_BALANCE' } },
        create: { periodId: period.id, ...balanceMetadata },
        update: balanceMetadata,
      });
      importedLedgerPeriods += 1;
    }
  }, { timeout: 120000 });

  return { createdPeriods, importedStatements, importedLedgerPeriods, skippedUnchanged };
}

function summarize(prepared, mode) {
  const existingKeys = new Set(prepared.existing.map((period) => `${period.year}-${String(period.month).padStart(2, '0')}`));
  return {
    mode,
    recognizedWorkbooks: prepared.workbooks.length,
    statementPeriods: prepared.statements.length,
    ledgerPeriods: prepared.monthly.keys.length,
    ledgerRows: prepared.ledger.entries.length,
    accountBalanceRows: Object.values(prepared.monthly.balancesByPeriod).reduce((sum, rows) => sum + rows.length, 0),
    reconciledAccounts: prepared.reconciliation.accountCount,
    periodsToCreate: prepared.monthly.keys.filter((key) => !existingKeys.has(key)).length,
    existingPeriodsKept: prepared.monthly.keys.filter((key) => existingKeys.has(key)).length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const zipPath = args.find((arg) => !arg.startsWith('--'));
  const confirm = args.includes('--confirm');
  if (!zipPath) throw new Error('用法: node scripts/import-electronic-ledger.js <电子账簿.zip> [--confirm]');
  if (!fs.statSync(zipPath).isFile()) throw new Error('输入路径不是文件');
  const prepared = await prepareImport(zipPath);
  console.log(JSON.stringify(summarize(prepared, confirm ? 'confirm' : 'dry-run'), null, 2));
  if (confirm) console.log(JSON.stringify(await persistPrepared(prepared), null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`[electronic-ledger-import] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}

module.exports = {
  parseRangeLedger,
  parseRangeTrialBalance,
  deriveMonthlyData,
  validateRangeSources,
  prepareImport,
  persistPrepared,
  summarize,
};
