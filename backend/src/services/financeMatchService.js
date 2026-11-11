/**
 * Input: Prisma client、BankTransaction / InvoiceRecord / PurchaseContract / SalesContract 模型
 * Output: 智能关联引擎；发票自动写入重验待匹配状态，仅有效发票（正常且正数）可被自动关联、红冲/负数留待人工，人工关联验证有效购销目标；
 *         发票只自动关联采购合同（购方须为本公司；人民币进项发票不与美元出口合同按数值比对，销项自动关联已移除）；
 *         银行流水自动关联在批内递减合同余额，不会把多笔流水挂满同一合同；人工银行关联校验合同未取消、方向与币种（OUT→采购/CNY，IN→销售/USD）；
 *         发票→采购合同另有硬护栏（累计额≤合同额×1.01、税号冲突排除、早于签约30天以上排除）与仅动自动关联的重配 rematchAutoInvoiceLinks
 * Pos: 财务模块-智能关联业务逻辑层
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { isInEffect, payableWhere, outstandingOf } = require('./payablesService');
const { createError } = require('../middleware/errorHandler');
const { VALID_INVOICE_WHERE } = require('./invoiceRecordService');
const { getEffectiveSalesContractTotal, getOutstandingReceivableUsd } = require('./salesContractAmount');

// ==================== 常量配置 ====================

const MATCH_STATUS = {
  PENDING: 'PENDING',
  MATCHED: 'MATCHED',
  IGNORED: 'IGNORED',
};

const CONTRACT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
};
// 选择器用途：PAYMENT = 银行付款/收款匹配，INVOICE = 发票关联
const MATCH_PURPOSE = { PAYMENT: 'PAYMENT', INVOICE: 'INVOICE' };

const SCORE_THRESHOLD = 70; // 高置信度阈值
const AMOUNT_TOLERANCE = 0.001; // ±0.1%
const AMOUNT_LOOSE_TOLERANCE = 0.01; // ±1%
const DATE_MATCH_WINDOW_DAYS = 30; // 日期匹配窗口
// 发票→采购合同的硬性护栏（INVMATCH-4，修复 prod 回填后审计出的错链）：
const INVOICE_EARLY_DAYS = 30; // 发票早于签约超过 30 天不关联，与 scoreDate「早于 30 天基本不可能」同口径
const INVOICE_CAP_TOLERANCE = AMOUNT_LOOSE_TOLERANCE; // 关联发票累计额（含本张）上限 = 合同额 × (1+1%) + 0.01，容忍税差/凑整
// 发票关联来源（InvoiceRecord.matchSource）：批量重配只动 AUTO；MANUAL 与 null（迁移前遗留）一律锁定不动。
const MATCH_SOURCE = { AUTO: 'AUTO', MANUAL: 'MANUAL' };
const COMPANY = '上海捷淞国际物流有限公司'; // 进项发票购方，同 financeImportService / bankFlowService
const PURCHASE_KEYWORDS = ['货款', '采购', '购货', '材料款', '设备款', '商品款'];

// ==================== 字符串工具 ====================

function normalizeName(name) {
  return (name || '')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[\s,，.。;；]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * 职责：计算 Levenshtein 距离
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

/**
 * 职责：计算字符串相似度（0-100）
 * 思路：优先包含匹配，其次 Levenshtein 距离
 */
// 一次 runAutoMatch 内按 (a,b) 记忆相似度：销方/往来方名重复很多，Levenshtein 同步计算会长时间占住事件循环。
let similarityCache = null;

function stringSimilarity(a, b) {
  if (!similarityCache) return computeSimilarity(a, b);
  const key = `${a}\u0000${b}`;
  let value = similarityCache.get(key);
  if (value === undefined) {
    value = computeSimilarity(a, b);
    similarityCache.set(key, value);
  }
  return value;
}

function computeSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;

  const dist = levenshteinDistance(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - dist / maxLen) * 100);
}

/**
 * 职责：计算多名称中的最高相似度
 */
function maxStringSimilarity(name, candidates) {
  if (!candidates || candidates.length === 0) return 0;
  return Math.max(...candidates.map((c) => stringSimilarity(name, c)));
}

// ==================== 评分工具 ====================

/**
 * 职责：金额匹配评分（0-40）
 */
function scoreAmount(txnAmount, contractAmount, paidOrReceived = 0) {
  const unpaid = Math.max(contractAmount - paidOrReceived, 0);
  if (unpaid <= 0) return 0;

  const diff = Math.abs(Math.abs(txnAmount) - unpaid);
  const ratio = diff / unpaid;

  if (ratio <= AMOUNT_TOLERANCE) return 40;
  if (ratio <= AMOUNT_LOOSE_TOLERANCE) return 35;
  if (ratio <= 0.05) return 25;
  if (ratio <= 0.1) return 15;
  if (ratio <= 0.2) return 5;
  return 0;
}

/**
 * 职责：日期匹配评分（0-20）
 * 思路：银行流水/发票日期在合同签订后 30 天内得满分，之后递减
 */
function scoreDate(txnDateStr, signedAt) {
  if (!signedAt || !txnDateStr) return 10; // 无合同日期给中性分

  const txnDate = new Date(txnDateStr);
  const signDate = new Date(signedAt);
  const diffMs = txnDate.getTime() - signDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

  if (diffDays < -30) return 0; // 早于合同 30 天以上，基本不可能
  if (diffDays <= 30) return 20;
  if (diffDays <= 60) return 15;
  if (diffDays <= 90) return 10;
  if (diffDays <= 180) return 5;
  return 2;
}

/**
 * 职责：摘要关键词加分（0-10）
 */
function scoreSummary(summary) {
  if (!summary) return 0;
  const text = summary.toLowerCase();
  for (const kw of PURCHASE_KEYWORDS) {
    if (text.includes(kw)) return 10;
  }
  return 0;
}

// ==================== 数据加载 ====================

/**
 * 职责：加载全部待匹配银行流水
 * 不设条数上限：旧的 take 500 每次只取最新 500 条，未达阈值的行永远留在窗口里，更早的记录从未被评估。
 * shortcut: 一次读入内存，待匹配量到数万条时改为游标分批。
 */
async function loadPendingBankTxns() {
  return prisma.bankTransaction.findMany({
    where: { matchStatus: MATCH_STATUS.PENDING },
    orderBy: { txnDate: 'desc' },
  });
}

/**
 * 职责：加载全部待匹配发票（理由与上限说明同 loadPendingBankTxns）
 * 仅有效发票（正常且为正数）可自动关联；红冲/负数发票保持 PENDING，只能人工关联或忽略。
 */
async function loadPendingInvoices() {
  return prisma.invoiceRecord.findMany({
    where: { matchStatus: MATCH_STATUS.PENDING, ...VALID_INVOICE_WHERE },
    orderBy: { invDate: 'desc' },
  });
}

/**
 * 职责：加载所有有效采购合同（含供应商）
 */
async function loadPurchaseContracts(purpose = MATCH_PURPOSE.PAYMENT) {
  // 付款匹配：应付口径唯一来源 payablesService（草稿/已取消合同不是应付，未付余额同口径）。
  // 发票关联：只是把进项发票挂到合同上，不涉及欠款，保持"未取消"范围与原有未付余额算法不变。
  const forPayment = purpose !== MATCH_PURPOSE.INVOICE;
  const contracts = await prisma.purchaseContract.findMany({
    where: forPayment ? payableWhere() : { NOT: { status: 'CANCELLED' } },
    take: 1000, // shortcut: 超过 1000 份合同会静默截断候选，现 195 份采购；接近时改为分页
    include: { supplier: true },
  });
  return contracts.map((c) => ({
    ...c,
    nameCandidates: [
      c.supplier?.name,
      c.supplier?.shortName,
    ].filter(Boolean),
    // 付款匹配只看应付口径（草稿不计）；发票关联保留草稿合同：草稿也可能已被预付或开票，必须能匹配。
    unpaidAmount: forPayment ? outstandingOf(c) : Math.max(c.totalAmount - c.paidAmount, 0),
  }));
}

/**
 * 职责：加载所有有效销售合同（含门店）
 */
async function loadSalesContracts() {
  const contracts = await prisma.salesContract.findMany({
    where: { NOT: { status: 'CANCELLED' } },
    take: 1000,
    include: {
      packingItems: { include: { store: true } },
      port: true,
    },
  });

  return contracts.map((c) => {
    const storeNames = Array.from(
      new Set(
        c.packingItems
          ?.map((p) => p.store?.name)
          .filter(Boolean) || []
      )
    );
    return {
      ...c,
      nameCandidates: storeNames.length > 0 ? storeNames : [c.port?.name].filter(Boolean),
      unpaidAmount: getOutstandingReceivableUsd(c),
    };
  });
}

// ==================== 发票护栏 ====================

const taxKey = (value) => String(value || '').replace(/\s/g, '').toUpperCase();

// 双方都有税号且不同 → 不是同一主体（同名不同税号、近似名称也一样）；任一方缺失则退回名称判断。
function taxIdConflict(sellerTaxId, supplierTaxId) {
  const a = taxKey(sellerTaxId);
  const b = taxKey(supplierTaxId);
  return Boolean(a && b && a !== b);
}

function invoiceTooEarly(invDate, signedAt) {
  if (!invDate || !signedAt) return false;
  const diffDays = Math.floor((new Date(invDate).getTime() - new Date(signedAt).getTime()) / (24 * 60 * 60 * 1000));
  return diffDays < -INVOICE_EARLY_DAYS;
}

// 首张发票同样受限（INVMATCH-4b 业主决定）：单张超出合同额 1% 的发票回到待匹配，由人工确认。
function exceedsInvoiceCap(contract, linkedTotal, invTotal) {
  return linkedTotal + invTotal > contract.totalAmount * (1 + INVOICE_CAP_TOLERANCE) + 0.01;
}

// ==================== 匹配核心 ====================

/**
 * 职责：银行流水→采购合同匹配
 */
function matchBankToPurchase(txn, contracts) {
  const best = { score: 0, contract: null, details: null };
  if (String(txn.currency || 'CNY').toUpperCase() !== 'CNY') return best;

  for (const contract of contracts) {
    if (contract.unpaidAmount <= 0) continue;

    const nameSim = maxStringSimilarity(txn.counterpart, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = txn.direction === 'OUT'
      ? scoreAmount(txn.amount, contract.totalAmount, contract.paidAmount)
      : 0;
    const dateScore = scoreDate(txn.txnDate, contract.signedAt);
    const summaryScore = txn.direction === 'OUT' ? scoreSummary(txn.summary) : 0;

    const totalScore = nameScore + amountScore + dateScore + summaryScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore, summaryScore };
    }
  }

  return best;
}

/**
 * 职责：银行流水→销售合同匹配
 */
function matchBankToSales(txn, contracts) {
  const best = { score: 0, contract: null, details: null };
  if (String(txn.currency || 'CNY').toUpperCase() !== 'USD') return best;

  for (const contract of contracts) {
    if (contract.unpaidAmount <= 0) continue;

    const nameSim = maxStringSimilarity(txn.counterpart, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = txn.direction === 'IN'
      ? scoreAmount(txn.amount, getEffectiveSalesContractTotal(contract), contract.receivedAmount)
      : 0;
    const dateScore = scoreDate(txn.txnDate, contract.signedAt);

    const totalScore = nameScore + amountScore + dateScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore };
    }
  }

  return best;
}

/**
 * 职责：发票→采购合同匹配（进项）
 */
// 合同额为 0 的合同上限为 0.01：任何发票都超限，未录入明细的草稿合同不会被自动关联（有意保守）。
// linkedTotals：合同ID→已关联有效发票累计额；传 null 只排名、不做累计额上限（见 planInvoiceLinks）。
function matchInvoiceToPurchase(inv, contracts, linkedTotals = null) {
  const best = { score: 0, contract: null, details: null };

  // 购方必须是本公司：他人名下的进项发票不能挂到我方采购合同（缺购方同样不关联）。
  if (!normalizeName(inv.buyer).includes(normalizeName(COMPANY))) return best;

  for (const contract of contracts) {
    if (taxIdConflict(inv.sellerTaxId, contract.supplier?.taxId)) continue;
    if (invoiceTooEarly(inv.invDate, contract.signedAt)) continue;
    if (linkedTotals && exceedsInvoiceCap(contract, linkedTotals.get(contract.id) || 0, inv.total)) continue;
    const nameSim = maxStringSimilarity(inv.seller, contract.nameCandidates);
    if (nameSim < 50) continue;

    const nameScore = Math.round((nameSim / 100) * 40);
    const amountScore = scoreAmount(inv.total, contract.totalAmount, contract.paidAmount);
    const dateScore = scoreDate(inv.invDate, contract.signedAt);

    const totalScore = nameScore + amountScore + dateScore;

    if (totalScore > best.score) {
      best.score = totalScore;
      best.contract = contract;
      best.details = { nameScore, amountScore, dateScore };
    }
  }

  return best;
}

/**
 * 职责：为一批发票规划关联（纯函数，不写库）
 * 思路：先按「无累计额上限」的最优分降序（同分按开票日、id）排队，让最贴合的发票先占合同额度；
 *       再逐张按累计额上限匹配，超额的合同被跳过并回落到次优候选。fixedTotals 为不参与重配的已关联发票累计额。
 *       同分先比发票金额与合同额的接近程度（更贴合者先占额度），再比开票日、id。发票不再自动关联销售合同（币种不同，见头注释）。
 */
function planInvoiceLinks(invoices, purchaseContracts, fixedTotals = new Map()) {
  const totals = new Map(fixedTotals);
  const queue = invoices
    .map((inv) => {
      const best = matchInvoiceToPurchase(inv, purchaseContracts);
      return { inv, rank: best.score, gap: best.contract ? Math.abs(inv.total - best.contract.totalAmount) : Infinity };
    })
    .sort((a, b) => b.rank - a.rank || a.gap - b.gap || String(a.inv.invDate).localeCompare(String(b.inv.invDate)) || String(a.inv.id).localeCompare(String(b.inv.id)));

  return queue.map(({ inv }) => {
    const best = matchInvoiceToPurchase(inv, purchaseContracts, totals);
    const linked = best.score >= SCORE_THRESHOLD;
    if (linked) totals.set(best.contract.id, (totals.get(best.contract.id) || 0) + inv.total);
    return { inv, best, contractType: CONTRACT_TYPE.PURCHASE, linked };
  });
}

async function loadLinkedPurchaseTotals(extraWhere = {}) {
  const rows = await prisma.invoiceRecord.findMany({
    where: { matchStatus: MATCH_STATUS.MATCHED, matchedContractType: CONTRACT_TYPE.PURCHASE, ...VALID_INVOICE_WHERE, ...extraWhere },
    select: { matchedContractId: true, total: true },
  });
  const totals = new Map();
  for (const row of rows) totals.set(row.matchedContractId, (totals.get(row.matchedContractId) || 0) + row.total);
  return totals;
}

// ==================== 对外服务接口 ====================

/**
 * 职责：触发自动匹配（银行流水 + 发票）
 * 思路：
 *   1. 批量加载待匹配数据与合同
 *   2. 对每条银行流水分别尝试采购/销售合同匹配
 *   3. 对每张发票分别尝试采购/销售合同匹配
 *   4. 总分 ≥ 70 的自动写入 MATCHED，其余保持 PENDING
 *   不改动合同的已付/已收金额，所以重复运行幂等（但经「取消关联」回到 PENDING 的行会再次关联到同一合同）
 */
async function runAutoMatch() {
  similarityCache = new Map();
  try {
    return await runAutoMatchOnce();
  } finally {
    similarityCache = null;
  }
}

async function runAutoMatchOnce() {
  const [bankTxns, invoices, purchaseContracts, invoicePurchaseContracts, salesContracts] = await Promise.all([
    loadPendingBankTxns(),
    loadPendingInvoices(),
    loadPurchaseContracts(MATCH_PURPOSE.PAYMENT),
    loadPurchaseContracts(MATCH_PURPOSE.INVOICE),
    loadSalesContracts(),
  ]);

  const bankResults = [];
  const invoiceResults = [];

  // 1. 匹配银行流水
  for (const txn of bankTxns) {
    let best;
    let contractType;

    if (txn.direction === 'OUT') {
      best = matchBankToPurchase(txn, purchaseContracts);
      contractType = CONTRACT_TYPE.PURCHASE;
    } else {
      best = matchBankToSales(txn, salesContracts);
      contractType = CONTRACT_TYPE.SALES;
    }

    if (best.score >= SCORE_THRESHOLD) {
      // 与发票写入一致：只改仍为 PENDING 的行，较长的运行期间被人工确认/忽略的流水不被覆盖。
      const updated = await prisma.bankTransaction.updateMany({
        where: { id: txn.id, matchStatus: MATCH_STATUS.PENDING },
        data: {
          matchedContractId: best.contract.id,
          matchedContractType: contractType,
          matchScore: best.score,
          matchStatus: MATCH_STATUS.MATCHED,
          matchedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        bankResults.push({ id: txn.id, matched: false, score: best.score });
        continue;
      }

      // 批内递减余额：同一合同不会被多笔流水重复吃满（合同对象是本次加载的副本）。
      const amount = Math.abs(Number(txn.amount) || 0);
      best.contract.unpaidAmount = Math.max(best.contract.unpaidAmount - amount, 0);
      if (contractType === CONTRACT_TYPE.PURCHASE) best.contract.paidAmount = Number(best.contract.paidAmount || 0) + amount;
      else best.contract.receivedAmount = Number(best.contract.receivedAmount || 0) + amount;

      bankResults.push({
        id: txn.id,
        matched: true,
        contractId: best.contract.id,
        contractType,
        score: best.score,
      });
    } else {
      bankResults.push({
        id: txn.id,
        matched: false,
        score: best.score,
      });
    }
  }

  // 2. 匹配发票（累计额上限以库里已关联的有效发票为基线，人工关联的也计入）
  const plans = planInvoiceLinks(invoices, invoicePurchaseContracts, await loadLinkedPurchaseTotals());
  for (const { inv, best, contractType, linked } of plans) {
    if (linked) {
      // A user may confirm/ignore this invoice after the candidate read. Keep the
      // existing PENDING-only rule at the write so that newer decisions survive.
      const updated = await prisma.invoiceRecord.updateMany({
        where: { id: inv.id, matchStatus: MATCH_STATUS.PENDING },
        data: {
          matchedContractId: best.contract.id,
          matchedContractType: contractType,
          matchScore: best.score,
          matchSource: MATCH_SOURCE.AUTO,
          matchStatus: MATCH_STATUS.MATCHED,
          matchedAt: new Date(),
        },
      });

      if (updated.count === 0) {
        invoiceResults.push({ id: inv.id, matched: false, score: best.score });
        continue;
      }

      invoiceResults.push({
        id: inv.id,
        matched: true,
        contractId: best.contract.id,
        contractType,
        score: best.score,
      });
    } else {
      invoiceResults.push({
        id: inv.id,
        matched: false,
        score: best.score,
      });
    }
  }

  return {
    bankMatched: bankResults.filter((r) => r.matched).length,
    bankTotal: bankResults.length,
    invoiceMatched: invoiceResults.filter((r) => r.matched).length,
    invoiceTotal: invoiceResults.length,
    details: {
      bank: bankResults,
      invoices: invoiceResults,
    },
  };
}

/**
 * 职责：按当前规则重配「自动」采购发票关联（默认只出报告；apply 才写库）
 * 范围：MATCHED + PURCHASE + 有效 + matchSource=AUTO 的发票。MANUAL、来源为空、销售、已忽略、待匹配行一律不动，
 *       但已锁定行的金额计入合同累计额基线。结果是纯函数式的：自动关联集合和锁定集合不变时，再跑一次计划为空（幂等）。
 * 写入：逐行带乐观条件（仍 MATCHED、AUTO、同合同、同分数），期间被人工改动的行跳过；解除的行回到 PENDING，与 unmatch 一致。
 */
async function rematchAutoInvoiceLinks({ apply = false } = {}) {
  similarityCache = new Map();
  try {
    const [rows, purchaseContracts] = await Promise.all([
      prisma.invoiceRecord.findMany({
        where: { matchStatus: MATCH_STATUS.MATCHED, matchedContractType: CONTRACT_TYPE.PURCHASE, ...VALID_INVOICE_WHERE },
        orderBy: { invDate: 'asc' },
      }),
      loadPurchaseContracts(MATCH_PURPOSE.INVOICE),
    ]);
    const isAuto = (r) => r.matchSource === MATCH_SOURCE.AUTO;
    const auto = rows.filter(isAuto);
    const lockedTotals = new Map();
    for (const r of rows.filter((x) => !isAuto(x))) {
      lockedTotals.set(r.matchedContractId, (lockedTotals.get(r.matchedContractId) || 0) + r.total);
    }

    const contractNo = new Map(purchaseContracts.map((c) => [c.id, c.contractNo]));
    const changes = [];
    let kept = 0;
    for (const { inv, best, contractType, linked } of planInvoiceLinks(auto, purchaseContracts, lockedTotals)) {
      const toId = linked ? best.contract.id : null;
      if (linked && toId === inv.matchedContractId) { kept += 1; continue; } // 同合同：分数漂移不算变更
      changes.push({
        id: inv.id,
        invNo: inv.invNo,
        action: toId ? 'MOVE' : 'UNLINK',
        fromContractId: inv.matchedContractId,
        fromContractNo: contractNo.get(inv.matchedContractId) || null,
        fromScore: inv.matchScore,
        toContractId: toId,
        toContractNo: toId ? contractNo.get(toId) : null,
        toScore: toId ? best.score : null,
      });
    }

    let applied = 0;
    let skipped = 0;
    if (apply && changes.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          const data = change.toContractId
            ? { matchedContractId: change.toContractId, matchScore: change.toScore, matchedAt: new Date() }
            : { matchedContractId: null, matchedContractType: null, matchScore: null, matchSource: null, matchStatus: MATCH_STATUS.PENDING, matchedAt: null };
          const result = await tx.invoiceRecord.updateMany({
            where: { id: change.id, matchStatus: MATCH_STATUS.MATCHED, matchSource: MATCH_SOURCE.AUTO, matchedContractId: change.fromContractId, matchScore: change.fromScore },
            data,
          });
          if (result.count === 1) applied += 1; else skipped += 1;
        }
      });
    }
    return { mode: apply ? 'apply' : 'dry-run', autoLinks: auto.length, lockedLinks: rows.length - auto.length, kept, changes, applied, skipped };
  } finally {
    similarityCache = null;
  }
}

/**
 * 职责：获取未匹配项列表（分页）
 */
async function getUnmatchedItems({ page = 1, pageSize = 20, type, search } = {}) {
  const skip = (page - 1) * pageSize;
  const where = { matchStatus: MATCH_STATUS.PENDING };

  let bankItems = [];
  let invoiceItems = [];
  let bankTotal = 0;
  let invoiceTotal = 0;

  if (!type || type === 'BANK') {
    [bankItems, bankTotal] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: { ...where, ...(search ? { OR: [{ counterpart: { contains: search } }, { summary: { contains: search } }, { txnId: { contains: search } }] } : {}) },
        orderBy: { txnDate: 'desc' },
        skip,
        take: pageSize,
        include: { batch: { select: { fileName: true } } },
      }),
      prisma.bankTransaction.count({ where: { ...where, ...(search ? { OR: [{ counterpart: { contains: search } }, { summary: { contains: search } }, { txnId: { contains: search } }] } : {}) } }),
    ]);
  }

  if (!type || type === 'INVOICE') {
    [invoiceItems, invoiceTotal] = await Promise.all([
      prisma.invoiceRecord.findMany({
        where: { ...where, ...(search ? { OR: [{ seller: { contains: search } }, { invNo: { contains: search } }, { itemName: { contains: search } }] } : {}) },
        orderBy: { invDate: 'desc' },
        skip,
        take: pageSize,
        include: { batch: { select: { fileName: true } } },
      }),
      prisma.invoiceRecord.count({ where: { ...where, ...(search ? { OR: [{ seller: { contains: search } }, { invNo: { contains: search } }, { itemName: { contains: search } }] } : {}) } }),
    ]);
  }

  return {
    bankItems,
    invoiceItems,
    bankTotal,
    invoiceTotal,
    page,
    pageSize,
  };
}

/**
 * 职责：人工确认关联
 * @param {string} entityType - 'BANK' | 'INVOICE'
 * @param {string} entityId
 * @param {string} contractId
 * @param {string} contractType - 'PURCHASE' | 'SALES'
 */
async function manualMatch(entityType, entityId, contractId, contractType) {
  if (entityType === 'INVOICE') {
    // Invoice match IDs are polymorphic strings, not foreign keys. Mirror the
    // existing selectable-contract rule without changing any accounting rows.
    return prisma.$transaction(async tx => {
      const contractModel = contractType === CONTRACT_TYPE.PURCHASE ? tx.purchaseContract : tx.salesContract;
      const contract = await contractModel.findUnique({ where: { id: contractId }, select: { status: true } });
      if (!contract || contract.status === 'CANCELLED') throw createError('关联合同不存在或已取消', 400);
      return tx.invoiceRecord.update({
        where: { id: entityId },
        data: {
          matchedContractId: contractId,
          matchedContractType: contractType,
          matchScore: 100,
          matchSource: MATCH_SOURCE.MANUAL,
          matchStatus: MATCH_STATUS.MATCHED,
          matchedAt: new Date(),
        },
      });
    });
  }

  // 银行流水：合同须存在且未取消，方向/币种与合同类型一致（OUT→采购/CNY，IN→销售/USD）。
  return prisma.$transaction(async tx => {
    const txn = await tx.bankTransaction.findUnique({ where: { id: entityId }, select: { direction: true, currency: true } });
    if (!txn) throw createError('银行流水不存在', 404);
    const contractModel = contractType === CONTRACT_TYPE.PURCHASE ? tx.purchaseContract : tx.salesContract;
    const contract = await contractModel.findUnique({ where: { id: contractId }, select: { status: true } });
    if (!contract || contract.status === 'CANCELLED') throw createError('关联合同不存在或已取消', 400);
    const expected = contractType === CONTRACT_TYPE.PURCHASE ? { direction: 'OUT', currency: 'CNY' } : { direction: 'IN', currency: 'USD' };
    if (txn.direction !== expected.direction || String(txn.currency || 'CNY').toUpperCase() !== expected.currency) {
      throw createError(`${contractType === CONTRACT_TYPE.PURCHASE ? '采购' : '销售'}合同只能关联${expected.currency}${expected.direction === 'OUT' ? '付款' : '收款'}流水`, 400);
    }
    return tx.bankTransaction.update({
      where: { id: entityId },
      data: {
        matchedContractId: contractId,
        matchedContractType: contractType,
        matchScore: 100,
        matchStatus: MATCH_STATUS.MATCHED,
        matchedAt: new Date(),
      },
    });
  });
}

/**
 * 职责：解除关联
 */
async function unmatch(entityType, entityId) {
  const model = entityType === 'BANK' ? prisma.bankTransaction : prisma.invoiceRecord;

  const updated = await model.update({
    where: { id: entityId },
    data: {
      matchedContractId: null,
      matchedContractType: null,
      matchScore: null,
      ...(entityType === 'BANK' ? {} : { matchSource: null }),
      matchStatus: MATCH_STATUS.PENDING,
      matchedAt: null,
    },
  });

  return updated;
}

/**
 * 职责：忽略该项（不关联）
 */
async function ignore(entityType, entityId) {
  const model = entityType === 'BANK' ? prisma.bankTransaction : prisma.invoiceRecord;

  const updated = await model.update({
    where: { id: entityId },
    data: {
      matchedContractId: null,
      matchedContractType: null,
      matchScore: null,
      ...(entityType === 'BANK' ? {} : { matchSource: null }),
      matchStatus: MATCH_STATUS.IGNORED,
      matchedAt: null,
    },
  });

  return updated;
}

/**
 * 职责：获取可用于人工匹配的合同列表（按类型筛选）
 */
async function listContractsForMatch(contractType, search = '', purpose = MATCH_PURPOSE.PAYMENT) {
  if (contractType === CONTRACT_TYPE.PURCHASE) {
    const where = {
      // 付款匹配只列已生效合同（草稿/已取消不是应付）；发票关联可含草稿，仅排除已取消
      ...(purpose === MATCH_PURPOSE.INVOICE ? { NOT: { status: 'CANCELLED' } } : payableWhere()),
      ...(search
        ? {
            OR: [
              { contractNo: { contains: search } },
              { supplier: { name: { contains: search } } },
            ],
          }
        : {}),
    };

    const rows = await prisma.purchaseContract.findMany({
      where,
      take: 50,
      orderBy: { createdAt: 'desc' },
      include: { supplier: true },
    });
    // payableWhere 只是粗过滤，旧别名/小写拼写的草稿、已取消行要在这里剔除
    const listed = purpose === MATCH_PURPOSE.INVOICE ? rows : rows.filter(isInEffect);
    // 未付余额与 loadPurchaseContracts 同口径，前端不再自行计算
    return listed.map((c) => ({
      ...c,
      unpaidAmount: purpose === MATCH_PURPOSE.INVOICE ? Math.max(c.totalAmount - c.paidAmount, 0) : outstandingOf(c),
    }));
  }

  if (contractType === CONTRACT_TYPE.SALES) {
    const where = {
      NOT: { status: 'CANCELLED' },
      ...(search
        ? {
            OR: [
              { contractNo: { contains: search } },
              { packingItems: { some: { store: { name: { contains: search } } } } },
            ],
          }
        : {}),
    };

    const sales = await prisma.salesContract.findMany({
      where,
      take: 50,
      orderBy: { contractNo: 'desc' },
      include: {
        packingItems: { include: { store: true } },
        port: true,
      },
    });
    return sales.map((c) => ({ ...c, unpaidAmount: getOutstandingReceivableUsd(c) }));
  }

  return [];
}

module.exports = {
  MATCH_PURPOSE,
  maxStringSimilarity,
  loadPurchaseContracts,
  loadSalesContracts,
  loadPendingBankTxns,
  loadPendingInvoices,
  runAutoMatch,
  rematchAutoInvoiceLinks,
  getUnmatchedItems,
  manualMatch,
  unmatch,
  ignore,
  listContractsForMatch,
};
