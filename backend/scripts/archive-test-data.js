/**
 * Input: process DATABASE_URL (SQLite only, never read from .env), flags below
 * Output: dry-run list or confirmed archive (isActive=false) of 存疑 suppliers and QA- test records, with an ID receipt
 * Pos: owner decision 13 / spec §4.11 — archive, never hard-delete; restore with --restore <receipt>
 *
 * Usage (dry-run is the default and writes nothing):
 *   node scripts/archive-test-data.js [--include-damaged]
 *   node scripts/archive-test-data.js --confirm --backup-dir <private dir> [--include-damaged]
 *   node scripts/archive-test-data.js --restore <receipt.json> [--confirm --backup-dir <dir>]
 *
 * Selection rules (exact, case-sensitive, only rows that are still isActive=true):
 *   Supplier  name/shortName contains 「(存疑)」 or 「（存疑）」        -> reason doubtful
 *   Supplier  name/shortName starts with "QA-"                        -> reason test-data
 *   Supplier  name/shortName contains 「(文件损坏)」/「（文件损坏）」  -> only with --include-damaged (owner Q11 pending)
 *   Store     name starts with "QA-"                                  -> reason test-data
 *   Product   customsName starts with "QA-"                           -> reason test-data
 * Nothing else is touched; no fuzzy matching. Contracts, payments, invoices and refund history are not modified.
 * The production run is a separate, owner-approved, backed-up step.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DOUBTFUL = ['(存疑)', '（存疑）'];
const DAMAGED = ['(文件损坏)', '（文件损坏）'];
const QA = 'QA-';

const names = (row, fields) => fields.map((f) => row[f]).filter((v) => typeof v === 'string');
const includesAny = (values, marks) => values.some((v) => marks.some((m) => v.includes(m)));

function supplierReason(row, { includeDamaged }) {
  const values = names(row, ['name', 'shortName']);
  if (includesAny(values, DOUBTFUL)) return 'doubtful';
  if (values.some((v) => v.startsWith(QA))) return 'test-data';
  if (includeDamaged && includesAny(values, DAMAGED)) return 'damaged';
  return null;
}

/** Read-only selection; the Prisma pre-filter is loose (LIKE), the JS check makes it exact. */
async function selectTargets(db, options = {}) {
  const suppliers = (await db.supplier.findMany({
    where: { isActive: true },
    select: { id: true, name: true, shortName: true },
    orderBy: { id: 'asc' },
  }))
    .map((row) => ({ id: row.id, label: row.name, reason: supplierReason(row, options) }))
    .filter((row) => row.reason);
  const stores = (await db.store.findMany({
    where: { isActive: true, name: { startsWith: QA } },
    select: { id: true, name: true },
    orderBy: { id: 'asc' },
  }))
    .filter((row) => row.name.startsWith(QA))
    .map((row) => ({ id: row.id, label: row.name, reason: 'test-data' }));
  const products = (await db.product.findMany({
    where: { isActive: true, customsName: { startsWith: QA } },
    select: { id: true, customsName: true },
    orderBy: { id: 'asc' },
  }))
    .filter((row) => row.customsName.startsWith(QA))
    .map((row) => ({ id: row.id, label: row.customsName, reason: 'test-data' }));
  return { suppliers, stores, products };
}

const MODELS = { suppliers: 'supplier', stores: 'store', products: 'product' };

/** Flip isActive for the given receipt-shaped plan inside one transaction; returns rows changed per model. */
async function applyPlan(db, plan, isActive) {
  const counts = {};
  await db.$transaction(async (tx) => {
    for (const [key, model] of Object.entries(MODELS)) {
      const ids = (plan[key] || []).map((row) => row.id);
      // The isActive guard makes re-runs and partly restored data idempotent.
      const result = ids.length
        ? await tx[model].updateMany({ where: { id: { in: ids }, isActive: !isActive }, data: { isActive } })
        : { count: 0 };
      counts[key] = result.count;
    }
  });
  return counts;
}

function parseArgs(argv) {
  const opts = { confirm: false, includeDamaged: false, backupDir: null, restore: null };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split(/=(.*)/s);
    const value = () => (inline !== undefined ? inline : argv[++i]);
    if (flag === '--confirm') opts.confirm = true;
    else if (flag === '--dry-run') opts.confirm = false;
    else if (flag === '--include-damaged') opts.includeDamaged = true;
    else if (flag === '--backup-dir') opts.backupDir = value();
    else if (flag === '--restore') opts.restore = value();
    else throw new Error(`Unknown option: ${flag}`);
  }
  return opts;
}

function sqlitePathFromEnv() {
  const url = process.env.DATABASE_URL || '';
  if (!url.startsWith('file:') || !url.slice(5).split('?')[0]) {
    throw new Error('Set a SQLite DATABASE_URL in the process environment; this script never reads .env.');
  }
  return path.resolve(__dirname, '../prisma', url.slice(5).split('?')[0]);
}

/** Consistent online snapshot via the shared backup tool; fail closed so nothing is written without a backup. */
function backupDatabase(database, backupDir) {
  const result = spawnSync('python3', [path.join(__dirname, 'sqlite_snapshot.py'), 'backup', '--database', database, '--backup-dir', backupDir], { stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error('Backup failed; nothing was changed.');
}

function writeReceipt(backupDir, receipt) {
  const file = path.join(backupDir, `archive-receipt-${receipt.createdAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return file;
}

function summarize(plan) {
  return Object.fromEntries(Object.keys(MODELS).map((key) => [key, plan[key].length]));
}

async function main(argv = process.argv.slice(2), db) {
  const opts = parseArgs(argv);
  const restoring = Boolean(opts.restore);
  const plan = restoring
    ? JSON.parse(fs.readFileSync(opts.restore, 'utf8')).plan
    : await selectTargets(db, opts);
  const mode = opts.confirm ? 'CONFIRM' : 'DRY-RUN';
  console.log(`[archive-test-data] ${mode} ${restoring ? 'restore' : 'archive'}:`, JSON.stringify(summarize(plan)));
  for (const key of Object.keys(MODELS)) {
    for (const row of plan[key] || []) console.log(`  ${key} ${row.id} [${row.reason}] ${row.label}`);
  }
  if (!opts.confirm) {
    console.log('[archive-test-data] dry-run: nothing written. Re-run with --confirm --backup-dir <dir> to apply.');
    return { applied: false, plan };
  }
  if (!opts.backupDir) throw new Error('--confirm requires --backup-dir.');
  const backupDir = path.resolve(opts.backupDir);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDir, 0o700);
  backupDatabase(sqlitePathFromEnv(), backupDir);
  const receipt = { createdAt: new Date().toISOString(), action: restoring ? 'restore' : 'archive', plan };
  const receiptFile = writeReceipt(backupDir, receipt);
  const counts = await applyPlan(db, plan, restoring);
  console.log(`[archive-test-data] applied ${JSON.stringify(counts)}; receipt ${receiptFile}`);
  return { applied: true, plan, counts, receiptFile };
}

module.exports = { selectTargets, applyPlan, parseArgs, supplierReason, main };

if (require.main === module) {
  // Prisma would otherwise auto-load backend/.env; require the target to be explicit in the process env.
  try { sqlitePathFromEnv(); } catch (error) { console.error(`[archive-test-data] ${error.message}`); process.exit(1); }
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ log: [] });
  main(process.argv.slice(2), prisma)
    .catch((error) => {
      console.error(`[archive-test-data] ${error.message}`);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
