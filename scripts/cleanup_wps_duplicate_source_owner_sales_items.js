/**
 * Input: tmp/wps_11_export_list_raw/parsed/wps_candidate_source_ownership_review.json + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_duplicate_source_owner_sales_cleanup_plan.json; optional delete when --apply is passed
 * Pos: 清理候选来源占用复核中“同字段、无引用、已有来源行覆盖”的销售重复行；默认 dry-run，写库前必须先备份 DB
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const DEFAULT_PARSED_DIR = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');

function parseArgs(argv) {
  const options = {
    parsedDir: DEFAULT_PARSED_DIR,
    out: null,
    apply: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--parsed-dir') {
      options.parsedDir = path.resolve(argv[++i]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++i]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  options.out = options.out || path.join(options.parsedDir, 'wps_duplicate_source_owner_sales_cleanup_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/cleanup_wps_duplicate_source_owner_sales_items.js [options]

Options:
  --parsed-dir <dir>   解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>         输出 cleanup plan JSON
  --apply              执行删除；不传则只 dry-run
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function hasWpsSource(note) {
  return /\[WPS_|11-报关记录|_wps_cloud_root|出货汇总/.test(String(note || ''));
}

function sameNumber(left, right, tolerance = 0.000001) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function sameNullableText(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

function sourceSummary(owner) {
  return `${owner.source || ''}`;
}

async function loadSalesItem(id) {
  return prisma.salesItem.findUnique({
    where: { id },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
  });
}

function isCoveredDuplicate(target, owner) {
  if (!target || !owner) return { ok: false, reason: 'missing_db_row' };
  if (target.id === owner.id) return { ok: false, reason: 'same_row' };
  if (target._count.inventories !== 0) return { ok: false, reason: 'target_has_inventory_refs' };
  if (owner._count.inventories !== 0) return { ok: false, reason: 'owner_has_inventory_refs' };
  if (hasWpsSource(target.note)) return { ok: false, reason: 'target_already_has_source' };
  if (!hasWpsSource(owner.note)) return { ok: false, reason: 'owner_missing_source' };
  if (target.salesContractId !== owner.salesContractId) return { ok: false, reason: 'contract_mismatch' };
  if (target.productId !== owner.productId) return { ok: false, reason: 'product_mismatch' };
  if (target.storeId !== owner.storeId) return { ok: false, reason: 'store_mismatch' };
  if (!sameNumber(target.quantity, owner.quantity)) return { ok: false, reason: 'quantity_mismatch' };
  if (!sameNumber(target.sellingPrice, owner.sellingPrice)) return { ok: false, reason: 'price_mismatch' };
  if (!sameNullableText(target.unit, owner.unit) && owner.unit) return { ok: false, reason: 'unit_mismatch' };
  if (!sameNumber(target.costPrice, owner.costPrice) && Number(target.costPrice) !== 0) {
    return { ok: false, reason: 'cost_price_mismatch' };
  }
  return { ok: true, reason: 'covered_by_source_owner' };
}

async function buildPlan(options) {
  const review = readJson(path.join(options.parsedDir, 'wps_candidate_source_ownership_review.json'));
  const candidates = review.details.filter(
    (row) => row.verdict === 'duplicate_exact_owner_no_refs_review'
      && row.type === 'sales_item_missing_source',
  );

  const deletes = [];
  const kept = [];

  for (const row of candidates) {
    const target = await loadSalesItem(row.id);
    const salesOwners = (row.owners || []).filter((owner) => owner.table_name === 'sales_item');
    if (salesOwners.length !== 1) {
      kept.push({ id: row.id, reason: 'owner_count_not_one', ownerCount: salesOwners.length });
      continue;
    }
    const ownerInfo = salesOwners[0];
    const owner = await loadSalesItem(ownerInfo.id);
    const verdict = isCoveredDuplicate(target, owner);
    const planRow = {
      salesItemId: row.id,
      ownerSalesItemId: ownerInfo.id,
      contractNo: row.contract_no,
      product: row.product,
      store: row.store,
      quantity: row.quantity,
      unit: target?.unit || '',
      sellingPrice: row.price,
      source: sourceSummary(ownerInfo),
      targetNote: target?.note || '',
      ownerNote: owner?.note || '',
      updateOwnerUnitTo: owner && !owner.unit && target?.unit ? target.unit : null,
      reason: verdict.reason,
    };
    if (verdict.ok) {
      deletes.push(planRow);
    } else {
      kept.push(planRow);
    }
  }

  return {
    status: options.apply ? 'applied' : 'dry_run',
    mode: 'delete_duplicate_missing_source_sales_items',
    sourceReview: path.join(options.parsedDir, 'wps_candidate_source_ownership_review.json'),
    candidateCount: candidates.length,
    deleteCount: deletes.length,
    keptCount: kept.length,
    deletes,
    kept,
  };
}

async function applyPlan(plan) {
  for (const row of plan.deletes) {
    if (row.updateOwnerUnitTo) {
      await prisma.salesItem.update({
        where: { id: row.ownerSalesItemId },
        data: { unit: row.updateOwnerUnitTo },
      });
    }
    await prisma.salesItem.delete({ where: { id: row.salesItemId } });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  if (options.apply) {
    await applyPlan(plan);
  }
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: plan.status,
    candidateCount: plan.candidateCount,
    deleteCount: plan.deleteCount,
    keptCount: plan.keptCount,
    out: options.out,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
