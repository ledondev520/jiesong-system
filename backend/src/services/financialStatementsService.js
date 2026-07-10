/**
 * Input: Excel 会计报表 Buffer、账期与 Prisma 数据库
 * Output: 只读解析预览、确认后事务写入、财务报表查询、趋势分析和预警
 * Pos: 财务报表业务服务层；上传文件必须跨越“预览 → 明确确认”Interface 后才能写库
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const crypto = require('crypto');
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

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
 * 职责：根据年月计算期末日期（该月最后一天）
 * @param {number} year
 * @param {number} month
 * @returns {Date}
 */
function getLastDayOfMonth(year, month) {
  return new Date(year, month, 0); // Day 0 of next month = last day of current
}

const formatPeriodEnd = (year, month) => {
  const day = getLastDayOfMonth(year, month).getDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const buildBalanceSheetData = (bsMap) => ({
  cashAndEquivalents: bsMap['1']?.end ?? null,
  shortTermInvestments: bsMap['2']?.end ?? null,
  accountsReceivable: bsMap['4']?.end ?? null,
  prepaidExpenses: bsMap['5']?.end ?? null,
  otherReceivables: bsMap['8']?.end ?? null,
  inventory: bsMap['9']?.end ?? null,
  totalCurrentAssets: bsMap['15']?.end ?? null,
  totalNonCurrentAssets: bsMap['29']?.end ?? null,
  totalAssets: bsMap['30']?.end ?? null,
  accountsPayable: bsMap['33']?.end ?? null,
  advancedReceipts: bsMap['34']?.end ?? null,
  staffWagesPayable: bsMap['35']?.end ?? null,
  taxesPayable: bsMap['36']?.end ?? null,
  otherPayables: bsMap['39']?.end ?? null,
  totalCurrentLiabilities: bsMap['41']?.end ?? null,
  totalNonCurrentLiabilities: bsMap['46']?.end ?? null,
  totalLiabilities: bsMap['47']?.end ?? null,
  paidInCapital: bsMap['48']?.end ?? null,
  capitalReserve: bsMap['49']?.end ?? null,
  surplusReserve: bsMap['50']?.end ?? null,
  retainedEarnings: bsMap['51']?.end ?? null,
  totalEquity: bsMap['52']?.end ?? null,
});

const buildIncomeStatementData = (isMap) => ({
  revenueMonth: isMap['1']?.month ?? null,
  costOfSalesMonth: isMap['2']?.month ?? null,
  taxesMonth: isMap['3']?.month ?? null,
  sellingExpensesMonth: isMap['11']?.month ?? null,
  adminExpensesMonth: isMap['14']?.month ?? null,
  financialExpensesMonth: isMap['18']?.month ?? null,
  investmentIncomeMonth: isMap['20']?.month ?? null,
  operatingProfitMonth: isMap['21']?.month ?? null,
  nonOperatingIncomeMonth: isMap['22']?.month ?? null,
  nonOperatingExpensesMonth: isMap['24']?.month ?? null,
  totalProfitMonth: isMap['30']?.month ?? null,
  incomeTaxMonth: isMap['31']?.month ?? null,
  netProfitMonth: isMap['32']?.month ?? null,
  revenueYTD: isMap['1']?.ytd ?? null,
  costOfSalesYTD: isMap['2']?.ytd ?? null,
  taxesYTD: isMap['3']?.ytd ?? null,
  sellingExpensesYTD: isMap['11']?.ytd ?? null,
  adminExpensesYTD: isMap['14']?.ytd ?? null,
  financialExpensesYTD: isMap['18']?.ytd ?? null,
  investmentIncomeYTD: isMap['20']?.ytd ?? null,
  operatingProfitYTD: isMap['21']?.ytd ?? null,
  nonOperatingIncomeYTD: isMap['22']?.ytd ?? null,
  nonOperatingExpensesYTD: isMap['24']?.ytd ?? null,
  totalProfitYTD: isMap['30']?.ytd ?? null,
  incomeTaxYTD: isMap['31']?.ytd ?? null,
  netProfitYTD: isMap['32']?.ytd ?? null,
});

const parseWorkbook = (workbook) => {
  const bsSheet = workbook.getWorksheet('资产负债表');
  const isSheet = workbook.getWorksheet('利润表');
  if (!bsSheet || !isSheet) {
    throw createError('文件缺少必要的 Sheet（资产负债表、利润表）', 400);
  }
  return {
    balanceSheet: buildBalanceSheetData(parseBalanceSheet(bsSheet)),
    incomeStatement: buildIncomeStatementData(parseIncomeStatement(isSheet)),
  };
};

const parseStatementBuffer = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw createError('会计报表文件为空', 400);
  }
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    throw createError('无法解析会计报表，请确认文件是有效的 .xlsx 工作簿', 400);
  }
  return parseWorkbook(workbook);
};

const createPreviewId = (buffer, year, month, periodLabel) => crypto
  .createHash('sha256')
  .update(buffer)
  .update(JSON.stringify({ year, month, periodLabel }))
  .digest('hex');

const countPopulatedFields = (record) => Object.values(record).filter((value) => value !== null).length;
const roundMoney = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const buildStatementPreview = ({
  buffer,
  year,
  month,
  periodLabel,
  parsed,
  existing,
}) => {
  const { balanceSheet, incomeStatement } = parsed;
  const blockers = [];
  const warnings = [];
  [
    ['资产总计', balanceSheet.totalAssets],
    ['负债合计', balanceSheet.totalLiabilities],
    ['所有者权益合计', balanceSheet.totalEquity],
  ].forEach(([label, value]) => {
    if (value === null) blockers.push(`缺少关键科目：${label}`);
  });
  const profitValues = [
    incomeStatement.revenueMonth,
    incomeStatement.costOfSalesMonth,
    incomeStatement.netProfitMonth,
  ];
  if (profitValues.every((value) => value === null)) {
    blockers.push('利润表未识别到本月营业收入、营业成本或净利润');
  } else {
    if (incomeStatement.revenueMonth === null) warnings.push('本月营业收入为空，保留为空值并在报表分析中按 0 展示');
    if (incomeStatement.costOfSalesMonth === null) warnings.push('本月营业成本为空，保留为空值并在报表分析中按 0 展示');
    if (incomeStatement.netProfitMonth === null) warnings.push('本月净利润为空，保留为空值并在报表分析中按 0 展示');
  }

  const accountingEquationDifference = (
    balanceSheet.totalAssets === null
    || balanceSheet.totalLiabilities === null
    || balanceSheet.totalEquity === null
  ) ? null : roundMoney(
    balanceSheet.totalAssets - balanceSheet.totalLiabilities - balanceSheet.totalEquity,
  );
  if (accountingEquationDifference !== null && Math.abs(accountingEquationDifference) > 1) {
    blockers.push(`资产负债表不平衡，资产与负债加权益相差 CNY ${accountingEquationDifference.toFixed(2)}`);
  }
  if (existing) warnings.push(`账期 ${periodLabel} 已存在，确认后将覆盖更新原账期`);

  const costStructure = {
    costOfSales: Number(incomeStatement.costOfSalesMonth || 0),
    taxes: Number(incomeStatement.taxesMonth || 0),
    sellingExpenses: Number(incomeStatement.sellingExpensesMonth || 0),
    adminExpenses: Number(incomeStatement.adminExpensesMonth || 0),
    financialExpenses: Number(incomeStatement.financialExpensesMonth || 0),
  };
  costStructure.total = roundMoney(Object.values(costStructure).reduce((sum, value) => sum + value, 0));

  return {
    previewId: createPreviewId(buffer, year, month, periodLabel),
    ready: blockers.length === 0,
    period: {
      year,
      month,
      periodLabel,
      reportDate: formatPeriodEnd(year, month),
      existing: Boolean(existing),
    },
    summary: {
      balanceSheetFieldCount: countPopulatedFields(balanceSheet),
      incomeStatementFieldCount: countPopulatedFields(incomeStatement),
      totalAssets: balanceSheet.totalAssets,
      totalLiabilities: balanceSheet.totalLiabilities,
      totalEquity: balanceSheet.totalEquity,
      accountingEquationDifference,
      revenueMonth: incomeStatement.revenueMonth,
      costOfSalesMonth: incomeStatement.costOfSalesMonth,
      netProfitMonth: incomeStatement.netProfitMonth,
      costStructure,
    },
    blockers,
    warnings,
    balanceSheet,
    incomeStatement,
  };
};

const previewFromBuffer = async (
  buffer,
  year,
  month,
  periodLabel,
  prismaClient = prisma,
) => {
  const parsed = await parseStatementBuffer(buffer);
  const existing = await prismaClient.financialPeriod.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  return buildStatementPreview({ buffer, year, month, periodLabel, parsed, existing });
};

const persistStatement = async (preview, prismaClient = prisma) => prismaClient.$transaction(async (tx) => {
  const reportDate = getLastDayOfMonth(preview.period.year, preview.period.month);
  const fp = await tx.financialPeriod.upsert({
    where: { year_month: { year: preview.period.year, month: preview.period.month } },
    update: { periodLabel: preview.period.periodLabel, reportDate, updatedAt: new Date() },
    create: {
      year: preview.period.year,
      month: preview.period.month,
      periodLabel: preview.period.periodLabel,
      reportDate,
    },
  });
  const balanceData = { periodId: fp.id, ...preview.balanceSheet };
  const incomeData = { periodId: fp.id, ...preview.incomeStatement };
  await tx.balanceSheetEntry.upsert({
    where: { periodId: fp.id },
    create: balanceData,
    update: preview.balanceSheet,
  });
  await tx.incomeStatementEntry.upsert({
    where: { periodId: fp.id },
    create: incomeData,
    update: preview.incomeStatement,
  });
  return fp;
});

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

/** 用户上传确认入口：重算预览凭证、验证覆盖意图，再在单事务中写入三张表。 */
async function confirmImportFromBuffer(
  buffer,
  year,
  month,
  periodLabel,
  { previewId, allowOverwrite = false } = {},
  prismaClient = prisma,
) {
  const preview = await previewFromBuffer(buffer, year, month, periodLabel, prismaClient);
  if (!previewId || preview.previewId !== previewId) {
    throw createError('预览已失效，请重新解析当前文件和账期', 409);
  }
  if (!preview.ready) throw createError(preview.blockers.join('；'), 400);
  if (preview.period.existing && !allowOverwrite) {
    throw createError(`账期 ${periodLabel} 已存在，请明确确认覆盖后再写入`, 409);
  }
  await persistStatement(preview, prismaClient);
  return {
    imported: 1,
    skipped: 0,
    errors: [],
    overwritten: preview.period.existing,
    period: preview.period,
  };
}

module.exports = {
  previewFromBuffer,
  confirmImportFromBuffer,
  listPeriods,
  getPeriodDetail,
  getAnalytics,
};
