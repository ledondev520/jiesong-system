/**
 * Input: Excel 会计报表文件路径 / Prisma 数据库
 * Output: 财务报表数据（资产负债表、利润表）的 CRUD、批量导入、趋势分析、预警
 * Pos: 财务报表业务服务层，负责 Excel 解析、幂等写入、智能预警计算
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');

// 会计报表所在根目录
const STATEMENTS_FOLDER =
  '/Users/helena/Documents/上海捷淞国际物流有限公司20260213100830';

// ==================== Excel 解析工具 ====================

/**
 * 职责：从资产负债表 sheet 中按行次提取关键字段
 * 思路：
 *   1. 遍历所有数据行，找到包含"行次"数字的行
 *   2. 资产侧：列索引 0(科目)、1(行次)、2(期末余额)、3(年初余额)
 *   3. 负债侧：列索引 4(科目)、5(行次)、6(期末余额)、7(年初余额)
 * @param {import('exceljs').Worksheet} ws - 资产负债表 worksheet
 * @returns {{ [lineNo: string]: { end: number|null, begin: number|null } }}
 */
function parseBalanceSheet(ws) {
  // 按行次 -> { end: 期末余额, begin: 年初余额 }
  const map = {};

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return; // 跳过标题行

    // 资产侧：列2=行次, 列3=期末, 列4=年初
    const lineNoLeft = row.getCell(2).value;
    if (lineNoLeft && !isNaN(Number(lineNoLeft))) {
      const key = String(Number(lineNoLeft));
      map[key] = {
        end: toNum(row.getCell(3).value),
        begin: toNum(row.getCell(4).value),
      };
    }

    // 负债及所有者权益侧：列6=行次, 列7=期末, 列8=年初
    const lineNoRight = row.getCell(6).value;
    if (lineNoRight && !isNaN(Number(lineNoRight))) {
      const key = String(Number(lineNoRight));
      // 如果左侧已经记录了相同行次（不太可能），右侧覆盖
      map[key] = {
        end: toNum(row.getCell(7).value),
        begin: toNum(row.getCell(8).value),
      };
    }
  });

  return map;
}

/**
 * 职责：从利润表 sheet 中按行次提取关键字段
 * 思路：
 *   1. 列索引 1(行次)、2(本年累计)、3(本月金额)
 * @param {import('exceljs').Worksheet} ws - 利润表 worksheet
 * @returns {{ [lineNo: string]: { ytd: number|null, month: number|null } }}
 */
function parseIncomeStatement(ws) {
  const map = {};

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;

    const lineNo = row.getCell(2).value;
    if (lineNo && !isNaN(Number(lineNo))) {
      const key = String(Number(lineNo));
      map[key] = {
        ytd: toNum(row.getCell(3).value),
        month: toNum(row.getCell(4).value),
      };
    }
  });

  return map;
}

/**
 * 职责：安全地将各类 ExcelJS 单元格值转成 number 或 null
 * @param {*} val
 * @returns {number|null}
 */
function toNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

/**
 * 职责：从文件夹名称中提取年份和月份
 * 思路：匹配 "2025年6账期" 格式
 * @param {string} folderName
 * @returns {{ year: number, month: number } | null}
 */
function extractPeriodFromFolder(folderName) {
  const match = folderName.match(/(\d{4})年(\d{1,2})账期/);
  if (!match) return null;
  return { year: parseInt(match[1]), month: parseInt(match[2]) };
}

/**
 * 职责：根据年月计算期末日期（该月最后一天）
 * @param {number} year
 * @param {number} month
 * @returns {Date}
 */
function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0); // Day 0 of next month = last day of current
}

// ==================== 导入核心逻辑 ====================

/**
 * 职责：扫描会计报表根目录，解析所有月份 Excel，幂等写入数据库
 * 思路：
 *   1. 遍历子目录，提取年月信息
 *   2. 找到对应的 Excel 文件
 *   3. 用 ExcelJS 读取三个 sheet
 *   4. upsert FinancialPeriod -> BalanceSheetEntry -> IncomeStatementEntry
 * @returns {{ imported: number, skipped: number, errors: string[] }}
 */
async function importFromFolder() {
  const results = { imported: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(STATEMENTS_FOLDER)) {
    throw new Error(`会计报表目录不存在: ${STATEMENTS_FOLDER}`);
  }

  const entries = fs.readdirSync(STATEMENTS_FOLDER, { withFileTypes: true });
  const periodFolders = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /\d{4}年\d{1,2}账期/.test(name))
    .sort();

  for (const folderName of periodFolders) {
    try {
      const period = extractPeriodFromFolder(folderName);
      if (!period) {
        results.skipped++;
        continue;
      }

      const folderPath = path.join(STATEMENTS_FOLDER, folderName);
      const files = fs.readdirSync(folderPath).filter((f) => f.endsWith('.xlsx'));
      if (files.length === 0) {
        results.skipped++;
        continue;
      }

      const xlsxPath = path.join(folderPath, files[0]);
      await importSingleFile(xlsxPath, period.year, period.month, folderName);
      results.imported++;
    } catch (err) {
      results.errors.push(`${folderName}: ${err.message}`);
    }
  }

  return results;
}

/**
 * 职责：解析单个 Excel 文件并写入数据库
 * @param {string} filePath - Excel 文件绝对路径
 * @param {number} year
 * @param {number} month
 * @param {string} periodLabel - 显示标签，如 "2025年1账期"
 */
async function importSingleFile(filePath, year, month, periodLabel) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const bsSheet = workbook.getWorksheet('资产负债表');
  const isSheet = workbook.getWorksheet('利润表');

  if (!bsSheet || !isSheet) {
    throw new Error('缺少必要的 sheet（资产负债表 或 利润表）');
  }

  const bsMap = parseBalanceSheet(bsSheet);
  const isMap = parseIncomeStatement(isSheet);

  const reportDate = getLastDayOfMonth(year, month);

  // 1. Upsert FinancialPeriod
  const fp = await prisma.financialPeriod.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      periodLabel,
      reportDate,
    },
    update: {
      periodLabel,
      reportDate,
      updatedAt: new Date(),
    },
  });

  // 2. Upsert BalanceSheetEntry
  const bsData = {
    periodId: fp.id,
    cashAndEquivalents:          bsMap['1']?.end ?? null,
    shortTermInvestments:        bsMap['2']?.end ?? null,
    accountsReceivable:          bsMap['4']?.end ?? null,
    prepaidExpenses:             bsMap['5']?.end ?? null,
    otherReceivables:            bsMap['8']?.end ?? null,
    inventory:                   bsMap['9']?.end ?? null,
    totalCurrentAssets:          bsMap['15']?.end ?? null,
    totalNonCurrentAssets:       bsMap['29']?.end ?? null,
    totalAssets:                 bsMap['30']?.end ?? null,
    accountsPayable:             bsMap['33']?.end ?? null,
    advancedReceipts:            bsMap['34']?.end ?? null,
    staffWagesPayable:           bsMap['35']?.end ?? null,
    taxesPayable:                bsMap['36']?.end ?? null,
    otherPayables:               bsMap['39']?.end ?? null,
    totalCurrentLiabilities:     bsMap['41']?.end ?? null,
    totalNonCurrentLiabilities:  bsMap['46']?.end ?? null,
    totalLiabilities:            bsMap['47']?.end ?? null,
    paidInCapital:               bsMap['48']?.end ?? null,
    capitalReserve:              bsMap['49']?.end ?? null,
    surplusReserve:              bsMap['50']?.end ?? null,
    retainedEarnings:            bsMap['51']?.end ?? null,
    totalEquity:                 bsMap['52']?.end ?? null,
  };

  await prisma.balanceSheetEntry.upsert({
    where: { periodId: fp.id },
    create: bsData,
    update: { ...bsData },
  });

  // 3. Upsert IncomeStatementEntry
  const isData = {
    periodId: fp.id,
    // 本月金额
    revenueMonth:               isMap['1']?.month ?? null,
    costOfSalesMonth:           isMap['2']?.month ?? null,
    taxesMonth:                 isMap['3']?.month ?? null,
    sellingExpensesMonth:       isMap['11']?.month ?? null,
    adminExpensesMonth:         isMap['14']?.month ?? null,
    financialExpensesMonth:     isMap['18']?.month ?? null,
    investmentIncomeMonth:      isMap['20']?.month ?? null,
    operatingProfitMonth:       isMap['21']?.month ?? null,
    nonOperatingIncomeMonth:    isMap['22']?.month ?? null,
    nonOperatingExpensesMonth:  isMap['24']?.month ?? null,
    totalProfitMonth:           isMap['30']?.month ?? null,
    incomeTaxMonth:             isMap['31']?.month ?? null,
    netProfitMonth:             isMap['32']?.month ?? null,
    // 本年累计
    revenueYTD:                 isMap['1']?.ytd ?? null,
    costOfSalesYTD:             isMap['2']?.ytd ?? null,
    taxesYTD:                   isMap['3']?.ytd ?? null,
    sellingExpensesYTD:         isMap['11']?.ytd ?? null,
    adminExpensesYTD:           isMap['14']?.ytd ?? null,
    financialExpensesYTD:       isMap['18']?.ytd ?? null,
    investmentIncomeYTD:        isMap['20']?.ytd ?? null,
    operatingProfitYTD:         isMap['21']?.ytd ?? null,
    nonOperatingIncomeYTD:      isMap['22']?.ytd ?? null,
    nonOperatingExpensesYTD:    isMap['24']?.ytd ?? null,
    totalProfitYTD:             isMap['30']?.ytd ?? null,
    incomeTaxYTD:               isMap['31']?.ytd ?? null,
    netProfitYTD:               isMap['32']?.ytd ?? null,
  };

  await prisma.incomeStatementEntry.upsert({
    where: { periodId: fp.id },
    create: isData,
    update: { ...isData },
  });
}

// ==================== 查询逻辑 ====================

/**
 * 职责：获取所有账期列表，含基础指标摘要
 * @returns {Array}
 */
async function listPeriods() {
  const periods = await prisma.financialPeriod.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    include: {
      balanceSheet: {
        select: { totalAssets: true, totalLiabilities: true, totalEquity: true, cashAndEquivalents: true },
      },
      incomeStatement: {
        select: { revenueMonth: true, netProfitMonth: true, revenueYTD: true, netProfitYTD: true },
      },
    },
  });
  return periods;
}

/**
 * 职责：获取指定年月的完整财务数据
 * @param {number} year
 * @param {number} month
 * @returns {object|null}
 */
async function getPeriodDetail(year, month) {
  return prisma.financialPeriod.findUnique({
    where: { year_month: { year, month } },
    include: { balanceSheet: true, incomeStatement: true },
  });
}

// ==================== 预警逻辑 ====================

/**
 * 职责：根据最新账期数据计算财务预警
 * 思路：
 *   1. 取最新一个月的完整数据
 *   2. 取前一个月数据（用于环比比较）
 *   3. 判断各项指标是否触发预警条件
 * @param {object} latest - 最新账期完整数据（含 balanceSheet、incomeStatement）
 * @param {object|null} previous - 上一账期数据
 * @returns {Array<{ level: 'danger'|'warning'|'info', code: string, message: string, detail: string }>}
 */
function computeAlerts(latest, previous) {
  const alerts = [];
  if (!latest) return alerts;

  const bs = latest.balanceSheet;
  const is = latest.incomeStatement;
  const label = latest.periodLabel;

  // 1. 净资产为负
  if (bs && bs.totalEquity !== null && bs.totalEquity < 0) {
    alerts.push({
      level: 'danger',
      code: 'NEGATIVE_EQUITY',
      message: `${label} 所有者权益为负`,
      detail: `所有者权益合计：¥${bs.totalEquity.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，公司净资产已资不抵债，需立即关注`,
    });
  }

  // 2. 月度净亏损
  if (is && is.netProfitMonth !== null && is.netProfitMonth < 0) {
    alerts.push({
      level: 'warning',
      code: 'MONTHLY_NET_LOSS',
      message: `${label} 本月净亏损`,
      detail: `本月净利润：¥${is.netProfitMonth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    });
  }

  // 3. 货币资金不足 (< 50,000)
  if (bs && bs.cashAndEquivalents !== null && bs.cashAndEquivalents < 50000) {
    alerts.push({
      level: 'warning',
      code: 'LOW_CASH',
      message: `${label} 货币资金不足`,
      detail: `货币资金余额：¥${bs.cashAndEquivalents.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，低于预警线 ¥50,000`,
    });
  }

  // 4. 资产负债率 > 70%
  if (bs && bs.totalAssets && bs.totalLiabilities !== null) {
    const debtRatio = bs.totalLiabilities / bs.totalAssets;
    if (debtRatio > 0.7) {
      alerts.push({
        level: 'warning',
        code: 'HIGH_DEBT_RATIO',
        message: `${label} 资产负债率偏高`,
        detail: `资产负债率：${(debtRatio * 100).toFixed(1)}%（警戒线 70%），负债合计 ¥${bs.totalLiabilities.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      });
    }
  }

  // 5. 管理费用占比 > 30%
  if (is && is.revenueMonth && is.adminExpensesMonth !== null) {
    const adminRatio = is.adminExpensesMonth / is.revenueMonth;
    if (adminRatio > 0.3) {
      alerts.push({
        level: 'warning',
        code: 'HIGH_ADMIN_EXPENSE',
        message: `${label} 管理费用占营收比例偏高`,
        detail: `管理费用占比：${(adminRatio * 100).toFixed(1)}%（警戒线 30%），本月管理费用 ¥${is.adminExpensesMonth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
      });
    }
  }

  // 6. 营收环比下滑 > 20%（需要前一期数据）
  if (
    previous &&
    is &&
    is.revenueMonth !== null &&
    previous.incomeStatement &&
    previous.incomeStatement.revenueMonth !== null &&
    previous.incomeStatement.revenueMonth > 0
  ) {
    const change =
      (is.revenueMonth - previous.incomeStatement.revenueMonth) /
      previous.incomeStatement.revenueMonth;
    if (change < -0.2) {
      alerts.push({
        level: 'warning',
        code: 'REVENUE_DECLINE',
        message: `${label} 营业收入环比大幅下滑`,
        detail: `本月营收 ¥${is.revenueMonth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，环比下降 ${(Math.abs(change) * 100).toFixed(1)}%`,
      });
    }
  }

  // 7. 连续2月净亏损
  if (
    previous &&
    is &&
    is.netProfitMonth !== null &&
    is.netProfitMonth < 0 &&
    previous.incomeStatement &&
    previous.incomeStatement.netProfitMonth !== null &&
    previous.incomeStatement.netProfitMonth < 0
  ) {
    // 避免和第2条重复，替换为 danger 级别
    const existing = alerts.findIndex((a) => a.code === 'MONTHLY_NET_LOSS');
    const dangerAlert = {
      level: 'danger',
      code: 'CONSECUTIVE_LOSS',
      message: `${latest.periodLabel} 已连续2个月亏损`,
      detail: `${previous.periodLabel} 净利润 ¥${previous.incomeStatement.netProfitMonth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}，${label} 净利润 ¥${is.netProfitMonth.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`,
    };
    if (existing >= 0) {
      alerts[existing] = dangerAlert;
    } else {
      alerts.push(dangerAlert);
    }
  }

  return alerts;
}

/**
 * 职责：获取趋势分析数据和预警列表
 * 思路：
 *   1. 取所有账期（含两张表数据）
 *   2. 构建12个月趋势数组
 *   3. 对最新期做预警计算
 * @returns {{ trends: Array, alerts: Array, latestPeriod: object|null }}
 */
async function getAnalytics() {
  const periods = await prisma.financialPeriod.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
    include: { balanceSheet: true, incomeStatement: true },
  });

  // 构建趋势数组（用于图表）
  const trends = periods.map((p) => ({
    label: `${p.year}年${p.month}月`,
    month: p.month,
    year: p.year,
    // 利润表本月数据
    revenue: p.incomeStatement?.revenueMonth ?? 0,
    costOfSales: p.incomeStatement?.costOfSalesMonth ?? 0,
    adminExpenses: p.incomeStatement?.adminExpensesMonth ?? 0,
    financialExpenses: p.incomeStatement?.financialExpensesMonth ?? 0,
    sellingExpenses: p.incomeStatement?.sellingExpensesMonth ?? 0,
    operatingProfit: p.incomeStatement?.operatingProfitMonth ?? 0,
    netProfit: p.incomeStatement?.netProfitMonth ?? 0,
    // 资产负债表
    totalAssets: p.balanceSheet?.totalAssets ?? 0,
    totalLiabilities: p.balanceSheet?.totalLiabilities ?? 0,
    totalEquity: p.balanceSheet?.totalEquity ?? 0,
    cash: p.balanceSheet?.cashAndEquivalents ?? 0,
    debtRatio:
      p.balanceSheet?.totalAssets && p.balanceSheet?.totalLiabilities
        ? p.balanceSheet.totalLiabilities / p.balanceSheet.totalAssets
        : 0,
  }));

  // 预警：对最新账期 + 前一账期计算
  const latest = periods[periods.length - 1] ?? null;
  const previous = periods.length >= 2 ? periods[periods.length - 2] : null;
  const alerts = computeAlerts(latest, previous);

  // 全量历史预警（每个月都算一遍，告知哪些月有过问题）
  const historicalAlerts = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const prev = i > 0 ? periods[i - 1] : null;
    const monthAlerts = computeAlerts(p, prev);
    historicalAlerts.push(...monthAlerts.map((a) => ({ ...a, period: p.periodLabel })));
  }

  return {
    trends,
    alerts,
    historicalAlerts,
    latestPeriod: latest
      ? {
          periodLabel: latest.periodLabel,
          balanceSheet: latest.balanceSheet,
          incomeStatement: latest.incomeStatement,
        }
      : null,
    totalPeriods: periods.length,
  };
}

/**
 * 职责：从 Buffer（上传的 Excel 文件）解析并导入指定账期
 * 思路：用 ExcelJS 读取 buffer，复用与 importSingleFile 相同的解析与 upsert 逻辑
 * @param {Buffer} buffer - 上传的 Excel 文件 buffer
 * @param {number} year - 账期年份
 * @param {number} month - 账期月份
 * @param {string} periodLabel - 显示标签，如 "2025年12账期"
 * @returns {{ imported: number, skipped: number, errors: string[] }}
 */
async function importFromBuffer(buffer, year, month, periodLabel) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const bsSheet = workbook.getWorksheet('资产负债表');
  const isSheet = workbook.getWorksheet('利润表');

  if (!bsSheet || !isSheet) {
    throw new Error('文件缺少必要的 sheet（资产负债表 或 利润表），请确认上传的是三表 Excel 文件');
  }

  const bsMap = parseBalanceSheet(bsSheet);
  const isMap = parseIncomeStatement(isSheet);
  const reportDate = getLastDayOfMonth(year, month);

  // 1. Upsert FinancialPeriod
  const fp = await prisma.financialPeriod.upsert({
    where: { year_month: { year, month } },
    update: { periodLabel, reportDate, updatedAt: new Date() },
    create: { year, month, periodLabel, reportDate },
  });

  // 2. Upsert BalanceSheetEntry
  const bsData = {
    periodId: fp.id,
    cashAndEquivalents:         bsMap['1']?.end ?? null,
    shortTermInvestments:       bsMap['2']?.end ?? null,
    accountsReceivable:         bsMap['4']?.end ?? null,
    prepaidExpenses:            bsMap['5']?.end ?? null,
    otherReceivables:           bsMap['8']?.end ?? null,
    inventory:                  bsMap['9']?.end ?? null,
    totalCurrentAssets:         bsMap['15']?.end ?? null,
    totalNonCurrentAssets:      bsMap['29']?.end ?? null,
    totalAssets:                bsMap['30']?.end ?? null,
    accountsPayable:            bsMap['33']?.end ?? null,
    advancedReceipts:           bsMap['34']?.end ?? null,
    staffWagesPayable:          bsMap['35']?.end ?? null,
    taxesPayable:               bsMap['36']?.end ?? null,
    otherPayables:              bsMap['39']?.end ?? null,
    totalCurrentLiabilities:    bsMap['41']?.end ?? null,
    totalNonCurrentLiabilities: bsMap['46']?.end ?? null,
    totalLiabilities:           bsMap['47']?.end ?? null,
    paidInCapital:              bsMap['48']?.end ?? null,
    capitalReserve:             bsMap['49']?.end ?? null,
    surplusReserve:             bsMap['50']?.end ?? null,
    retainedEarnings:           bsMap['51']?.end ?? null,
    totalEquity:                bsMap['52']?.end ?? null,
  };
  await prisma.balanceSheetEntry.upsert({
    where: { periodId: fp.id },
    create: bsData,
    update: { ...bsData },
  });

  // 3. Upsert IncomeStatementEntry
  const isData = {
    periodId: fp.id,
    revenueMonth:               isMap['1']?.month ?? null,
    costOfSalesMonth:           isMap['2']?.month ?? null,
    taxesMonth:                 isMap['3']?.month ?? null,
    sellingExpensesMonth:       isMap['11']?.month ?? null,
    adminExpensesMonth:         isMap['14']?.month ?? null,
    financialExpensesMonth:     isMap['18']?.month ?? null,
    investmentIncomeMonth:      isMap['20']?.month ?? null,
    operatingProfitMonth:       isMap['21']?.month ?? null,
    nonOperatingIncomeMonth:    isMap['22']?.month ?? null,
    nonOperatingExpensesMonth:  isMap['24']?.month ?? null,
    totalProfitMonth:           isMap['30']?.month ?? null,
    incomeTaxMonth:             isMap['31']?.month ?? null,
    netProfitMonth:             isMap['32']?.month ?? null,
    revenueYTD:                 isMap['1']?.ytd ?? null,
    costOfSalesYTD:             isMap['2']?.ytd ?? null,
    taxesYTD:                   isMap['3']?.ytd ?? null,
    sellingExpensesYTD:         isMap['11']?.ytd ?? null,
    adminExpensesYTD:           isMap['14']?.ytd ?? null,
    financialExpensesYTD:       isMap['18']?.ytd ?? null,
    investmentIncomeYTD:        isMap['20']?.ytd ?? null,
    operatingProfitYTD:         isMap['21']?.ytd ?? null,
    nonOperatingIncomeYTD:      isMap['22']?.ytd ?? null,
    nonOperatingExpensesYTD:    isMap['24']?.ytd ?? null,
    totalProfitYTD:             isMap['30']?.ytd ?? null,
    incomeTaxYTD:               isMap['31']?.ytd ?? null,
    netProfitYTD:               isMap['32']?.ytd ?? null,
  };
  await prisma.incomeStatementEntry.upsert({
    where: { periodId: fp.id },
    create: isData,
    update: { ...isData },
  });

  return { imported: 1, skipped: 0, errors: [] };
}

module.exports = {
  importFromFolder,
  importSingleFile,
  importFromBuffer,
  listPeriods,
  getPeriodDetail,
  getAnalytics,
};
