#!/usr/bin/env node
/**
 * Input: --database <abs path>. Output: one JSON line of counts (no names, amounts or ids).
 * Pos: A100 read-only measurement of the finance matching backlog before any engine change.
 * Every PENDING bank transaction and invoice lands in exactly one bucket, so the buckets sum to the PENDING totals:
 *   NO_COUNTERPART     no non-cancelled contract of the matching side has a counterpart name the engine would accept (similarity >= 50),
 *                      or the bank currency is one the engine never matches (counted again in detail.unsupportedCurrency);
 *   COUNTERPART_DRAFT  only DRAFT contracts match the name;
 *   ENGINE_MISS        an in-effect contract matches the name, yet the row is still PENDING.
 * Sides follow financeMatchService: CNY bank rows and invoices -> purchase contracts, USD bank rows -> sales contracts.
 * Red-flushed/negative invoices are never auto-matched; they are bucketed like the rest and also counted in detail.invalidInvoice.
 * Never reads .env; one SQLite connection with PRAGMA query_only=ON, so the run cannot write business rows.
 */
const path = require('node:path');

function parseArguments(args) {
  if (args.length !== 2 || args[0] !== '--database' || !path.isAbsolute(args[1] || '')) throw new Error('用法: --database <绝对路径>');
  return { database: args[1] };
}

const emptyCounts = () => ({ total: 0, NO_COUNTERPART: 0, COUNTERPART_DRAFT: 0, ENGINE_MISS: 0 });

function bucketFor(name, contracts, similarity, isDraft) {
  const named = contracts.filter((c) => similarity(name, c.nameCandidates) >= 50);
  if (named.length === 0) return 'NO_COUNTERPART';
  return named.every(isDraft) ? 'COUNTERPART_DRAFT' : 'ENGINE_MISS';
}

// Pure: contracts must already exclude CANCELLED and carry nameCandidates (financeMatchService loaders do both).
function classifyPending({ bankTxns, invoices, purchaseContracts, salesContracts, similarity, purchaseDraft, salesDraft, validInvoice }) {
  const report = { bank: emptyCounts(), invoice: emptyCounts(), detail: { unsupportedCurrency: 0, invalidInvoice: 0 } };
  for (const txn of bankTxns) {
    const currency = String(txn.currency || 'CNY').toUpperCase();
    let bucket = 'NO_COUNTERPART';
    if (currency === 'CNY') bucket = bucketFor(txn.counterpart, purchaseContracts, similarity, purchaseDraft);
    else if (currency === 'USD') bucket = bucketFor(txn.counterpart, salesContracts, similarity, salesDraft);
    else report.detail.unsupportedCurrency += 1;
    report.bank.total += 1;
    report.bank[bucket] += 1;
  }
  for (const inv of invoices) {
    if (!validInvoice(inv)) report.detail.invalidInvoice += 1;
    report.invoice.total += 1;
    report.invoice[bucketFor(inv.seller, purchaseContracts, similarity, purchaseDraft)] += 1;
  }
  return report;
}

async function main(args = process.argv.slice(2)) {
  const { database } = parseArguments(args);
  // Set before the Prisma client is created; no config module is loaded, so no .env is read.
  process.env.DATABASE_URL = `file:${database}?connection_limit=1`;
  const db = require('../src/utils/prisma');
  try {
    await db.$queryRawUnsafe('PRAGMA query_only = ON');
    const match = require('../src/services/financeMatchService');
    const { isInEffect } = require('../src/services/payablesService');
    const { normalizeSalesStatus } = require('../src/services/salesStateMachine');
    const { VALID_INVOICE_WHERE } = require('../src/services/invoiceRecordService');
    const where = { matchStatus: 'PENDING' };
    const report = classifyPending({
      bankTxns: await db.bankTransaction.findMany({ where, select: { currency: true, counterpart: true } }),
      invoices: await db.invoiceRecord.findMany({ where, select: { seller: true, status: true, isPositive: true } }),
      purchaseContracts: await match.loadPurchaseContracts(match.MATCH_PURPOSE.INVOICE),
      salesContracts: await match.loadSalesContracts(),
      similarity: match.maxStringSimilarity,
      purchaseDraft: (c) => !isInEffect(c),
      salesDraft: (c) => normalizeSalesStatus(c.status) === 'DRAFT',
      validInvoice: (inv) => inv.status === VALID_INVOICE_WHERE.status && inv.isPositive === VALID_INVOICE_WHERE.isPositive,
    });
    report.pendingTotals = {
      bank: await db.bankTransaction.count({ where }),
      invoice: await db.invoiceRecord.count({ where }),
    };
    console.log(JSON.stringify(report));
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exit(1); });
module.exports = { parseArguments, classifyPending };
