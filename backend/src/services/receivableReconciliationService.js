/**
 * Input: 正式 EXP 合同、美元银行来款、应收账款明细账与资产负债表
 * Output: 同一账期截止日的美元经营应收、人民币会计应收及差异桥接
 * Pos: 客户美元应收对账的深 Module；不强行把银行来款分配到具体合同
 */

const prisma = require('../utils/prisma');
const { SALES_AMOUNT_SOURCE } = require('./salesContractAmount');

const DEFAULT_CUSTOMER_KEY = 'SP FOOD';

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));
const normalizeText = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, ' ');
const extractContractNo = (value) => normalizeText(value).match(/EXP\d+/)?.[0] || null;
const recognitionDate = (contract) => contract.shippedAt || contract.signedAt || null;
const toIsoDate = (date) => date.toISOString().slice(0, 10);

const buildReceivableReconciliation = ({
  period,
  contracts,
  bankTransactions,
  ledgerEntries,
  customerKey = DEFAULT_CUSTOMER_KEY,
}) => {
  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const endExclusive = new Date(Date.UTC(period.year, period.month, 1));
  const throughPeriodContracts = contracts.filter((contract) => {
    const date = recognitionDate(contract);
    return date && date < endExclusive;
  });
  const periodContracts = throughPeriodContracts.filter((contract) => {
    const date = recognitionDate(contract);
    return date >= start;
  });
  const normalizedCustomerKey = normalizeText(customerKey);
  const customerReceipts = bankTransactions.filter((transaction) => (
    normalizeText(transaction.counterpart || transaction.payer).includes(normalizedCustomerKey)
  ));

  const uniqueLedgerLines = new Map();
  const duplicateGroups = new Map();
  ledgerEntries.forEach((entry) => {
    const contractNo = extractContractNo(entry.summary);
    if (!contractNo || Number(entry.debit || 0) <= 0) return;
    const key = [
      contractNo,
      normalizeText(entry.summary),
      roundMoney(entry.debit),
      roundMoney(entry.credit),
    ].join('|');
    if (!uniqueLedgerLines.has(key)) uniqueLedgerLines.set(key, { ...entry, contractNo });
    duplicateGroups.set(key, (duplicateGroups.get(key) || 0) + 1);
  });

  const duplicateLines = Array.from(uniqueLedgerLines.entries())
    .map(([key, entry]) => ({
      contractNo: entry.contractNo,
      copies: duplicateGroups.get(key) || 1,
      excessDebitCny: roundMoney(Math.max((duplicateGroups.get(key) || 1) - 1, 0) * Number(entry.debit || 0)),
    }))
    .filter((entry) => entry.excessDebitCny > 0);
  const duplicateDebitCny = roundMoney(duplicateLines.reduce((sum, entry) => sum + entry.excessDebitCny, 0));

  const recognizedDebitByContract = new Map();
  uniqueLedgerLines.forEach((entry) => {
    recognizedDebitByContract.set(
      entry.contractNo,
      roundMoney((recognizedDebitByContract.get(entry.contractNo) || 0) + Number(entry.debit || 0)),
    );
  });
  const periodContractByNo = new Map(periodContracts.map((contract) => [normalizeText(contract.contractNo), contract]));
  const recognizedPeriodContracts = Array.from(periodContractByNo.values()).filter((contract) => (
    recognizedDebitByContract.has(normalizeText(contract.contractNo))
  ));
  const recognizedPeriodUsd = recognizedPeriodContracts.reduce((sum, contract) => sum + Number(contract.totalAmount || 0), 0);
  const recognizedPeriodCny = recognizedPeriodContracts.reduce((sum, contract) => (
    sum + Number(recognizedDebitByContract.get(normalizeText(contract.contractNo)) || 0)
  ), 0);
  const effectiveExchangeRate = recognizedPeriodUsd > 0
    ? recognizedPeriodCny / recognizedPeriodUsd
    : null;

  const missingContracts = periodContracts
    .filter((contract) => !recognizedDebitByContract.has(normalizeText(contract.contractNo)))
    .map((contract) => ({
      contractNo: contract.contractNo,
      amountUsd: roundMoney(contract.totalAmount),
      estimatedAmountCny: effectiveExchangeRate === null
        ? null
        : roundMoney(Number(contract.totalAmount || 0) * effectiveExchangeRate),
    }));
  const missingDebitCny = roundMoney(missingContracts.reduce((sum, contract) => (
    sum + Number(contract.estimatedAmountCny || 0)
  ), 0));

  const formalSalesUsd = roundMoney(throughPeriodContracts.reduce((sum, contract) => sum + Number(contract.totalAmount || 0), 0));
  const receivedUsd = roundMoney(customerReceipts.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0));
  const operatingReceivableUsd = roundMoney(formalSalesUsd - receivedUsd);
  const reportedReceivableCny = roundMoney(period.balanceSheet?.accountsReceivable || 0);
  const correctedAccountingReceivableCny = roundMoney(reportedReceivableCny - duplicateDebitCny + missingDebitCny);
  const translatedOperatingReceivableCny = effectiveExchangeRate === null
    ? null
    : roundMoney(operatingReceivableUsd * effectiveExchangeRate);
  const residualCny = translatedOperatingReceivableCny === null
    ? null
    : roundMoney(correctedAccountingReceivableCny - translatedOperatingReceivableCny);

  return {
    period: { year: period.year, month: period.month, label: period.periodLabel },
    cutoffDate: `${period.year}-${String(period.month).padStart(2, '0')}-${String(new Date(Date.UTC(period.year, period.month, 0)).getUTCDate()).padStart(2, '0')}`,
    contractCount: throughPeriodContracts.length,
    formalSalesUsd,
    receivedUsd,
    operatingReceivableUsd,
    reportedReceivableCny,
    effectiveExchangeRate: effectiveExchangeRate === null ? null : Number(effectiveExchangeRate.toFixed(6)),
    translatedOperatingReceivableCny,
    correctedAccountingReceivableCny,
    residualCny,
    anomalies: {
      duplicateDebitCny,
      duplicateContracts: Array.from(new Set(duplicateLines.map((entry) => entry.contractNo))),
      missingDebitCny,
      missingContracts,
    },
    assumptions: [
      '美元来款按客户累计核销，不强行分配到具体合同',
      '经营应收以已核验的正式 EXP 合同金额为准',
      '缺失会计分录按本期已确认合同的实际记账汇率估算',
    ],
  };
};

const getReceivableReconciliation = async ({ year, month } = {}) => {
  const period = year && month
    ? await prisma.financialPeriod.findFirst({
        where: { year: Number(year), month: Number(month) },
        include: { balanceSheet: true },
      })
    : await prisma.financialPeriod.findFirst({
        where: { balanceSheet: { isNot: null } },
        include: { balanceSheet: true },
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      });
  if (!period?.balanceSheet) return null;

  const start = new Date(Date.UTC(period.year, period.month - 1, 1));
  const endExclusive = new Date(Date.UTC(period.year, period.month, 1));
  const endDate = toIsoDate(endExclusive);
  const [contracts, bankTransactions, ledgerEntries] = await Promise.all([
    prisma.salesContract.findMany({
      where: {
        amountSource: SALES_AMOUNT_SOURCE.FORMAL_DOCUMENT,
        NOT: { status: 'CANCELLED' },
        OR: [
          { shippedAt: { lt: endExclusive } },
          { shippedAt: null, signedAt: { lt: endExclusive } },
        ],
      },
      select: { contractNo: true, totalAmount: true, signedAt: true, shippedAt: true },
    }),
    prisma.bankTransaction.findMany({
      where: { currency: 'USD', direction: 'IN', txnDate: { lt: endDate } },
      select: { amount: true, txnDate: true, counterpart: true, payer: true },
    }),
    prisma.generalLedgerEntry.findMany({
      where: {
        periodId: period.id,
        accountCode: '1122',
        entryDate: { gte: start, lt: endExclusive },
      },
      select: { voucherNumber: true, summary: true, debit: true, credit: true },
    }),
  ]);

  return buildReceivableReconciliation({ period, contracts, bankTransactions, ledgerEntries });
};

module.exports = { buildReceivableReconciliation, getReceivableReconciliation };
