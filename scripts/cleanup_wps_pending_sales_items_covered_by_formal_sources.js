/**
 * Input: backend/prisma/dev.db + current WPS source notes
 * Output: tmp/wps_11_export_list_raw/parsed/wps_pending_sales_formal_source_cleanup_plan.json; optional delete/update when --apply is passed
 * Pos: 清理已被唯一正式 EXP 销售来源覆盖的 PENDING 销售占位行；默认 dry-run，写库前必须先备份 DB
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
  options.out = options.out || path.join(options.parsedDir, 'wps_pending_sales_formal_source_cleanup_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/cleanup_wps_pending_sales_items_covered_by_formal_sources.js [options]

Options:
  --parsed-dir <dir>   解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>         输出 cleanup plan JSON
  --apply              执行删除/单位补齐；不传则只 dry-run
`);
}

function hasWpsSource(note) {
  return /\[WPS_|11-报关记录|_wps_cloud_root|出货汇总/.test(String(note || ''));
}

function sameNumber(left, right, tolerance = 0.000001) {
  const a = Number(left);
  const b = Number(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance;
}

function zeroNumber(value) {
  return sameNumber(value, 0);
}

function sameNullableText(left, right) {
  return String(left || '').trim() === String(right || '').trim();
}

async function loadPendingSalesItems() {
  return prisma.salesItem.findMany({
    where: {
      salesContract: {
        contractNo: {
          startsWith: 'PENDING-',
        },
      },
    },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
    orderBy: [
      { salesContract: { contractNo: 'asc' } },
      { product: { customsName: 'asc' } },
    ],
  });
}

async function findFormalSalesOwners(target) {
  return prisma.salesItem.findMany({
    where: {
      id: { not: target.id },
      salesContract: {
        contractNo: {
          not: target.salesContract.contractNo,
          notIn: [target.salesContract.contractNo],
        },
      },
      productId: target.productId,
      storeId: target.storeId,
      quantity: target.quantity,
    },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
  });
}

async function findFormalPackingUnit(owner) {
  const packing = await prisma.packingItem.findFirst({
    where: {
      salesContractId: owner.salesContractId,
      productId: owner.productId,
      storeId: owner.storeId,
      quantity: owner.quantity,
      note: { contains: '[WPS_' },
    },
    include: {
      product: true,
      store: true,
    },
  });
  return packing?.unit || null;
}

async function evaluateTarget(target) {
  const keptBase = {
    targetId: target.id,
    pendingContractNo: target.salesContract.contractNo,
    product: target.product.customsName,
    store: target.store.name,
    quantity: target.quantity,
    unit: target.unit || '',
    sellingPrice: target.sellingPrice,
    costPrice: target.costPrice,
  };

  if (!target.salesContract.contractNo.startsWith('PENDING-')) {
    return { ok: false, reason: 'not_pending_contract', ...keptBase };
  }
  if (target._count.inventories !== 0) {
    return { ok: false, reason: 'target_has_inventory_refs', targetRefCount: target._count.inventories, ...keptBase };
  }
  if (hasWpsSource(target.note)) {
    return { ok: false, reason: 'target_already_has_source', ...keptBase };
  }
  if (!zeroNumber(target.sellingPrice) || !zeroNumber(target.costPrice)) {
    return { ok: false, reason: 'target_not_zero_price_placeholder', ...keptBase };
  }
  if (!Number.isFinite(Number(target.quantity)) || sameNumber(target.quantity, 0)) {
    return { ok: false, reason: 'target_quantity_not_positive', ...keptBase };
  }

  const owners = (await findFormalSalesOwners(target)).filter((owner) => (
    !owner.salesContract.contractNo.startsWith('PENDING-')
    && hasWpsSource(owner.note)
    && sameNumber(owner.quantity, target.quantity)
  ));

  if (owners.length !== 1) {
    return {
      ok: false,
      reason: owners.length > 1 ? 'multiple_formal_source_owners' : 'no_unique_formal_source_owner',
      ownerCount: owners.length,
      owners: owners.map((owner) => ({
        id: owner.id,
        contractNo: owner.salesContract.contractNo,
        sellingPrice: owner.sellingPrice,
        note: owner.note || '',
      })),
      ...keptBase,
    };
  }

  const owner = owners[0];
  if (owner._count.inventories !== 0) {
    return { ok: false, reason: 'owner_has_inventory_refs', ownerRefCount: owner._count.inventories, ...keptBase };
  }
  if (target.unit && owner.unit && !sameNullableText(target.unit, owner.unit)) {
    return { ok: false, reason: 'unit_mismatch', ownerUnit: owner.unit, ...keptBase };
  }

  const formalPackingUnit = await findFormalPackingUnit(owner);
  const updateOwnerUnitTo = !owner.unit && target.unit && sameNullableText(target.unit, formalPackingUnit)
    ? target.unit
    : null;

  return {
    ok: true,
    reason: 'pending_zero_sales_covered_by_unique_formal_wps_source',
    targetId: target.id,
    ownerId: owner.id,
    pendingContractNo: target.salesContract.contractNo,
    formalContractNo: owner.salesContract.contractNo,
    product: target.product.customsName,
    store: target.store.name,
    quantity: target.quantity,
    targetUnit: target.unit || '',
    ownerUnit: owner.unit || '',
    formalPackingUnit: formalPackingUnit || '',
    updateOwnerUnitTo,
    targetSellingPrice: target.sellingPrice,
    ownerSellingPrice: owner.sellingPrice,
    source: owner.note || '',
  };
}

async function buildPlan(options) {
  const targets = await loadPendingSalesItems();
  const deletes = [];
  const kept = [];

  for (const target of targets) {
    const verdict = await evaluateTarget(target);
    if (verdict.ok) deletes.push(verdict);
    else kept.push(verdict);
  }

  return {
    status: options.apply ? 'applied' : 'dry_run',
    mode: 'delete_pending_zero_sales_items_covered_by_unique_formal_wps_source',
    candidateCount: targets.length,
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
        where: { id: row.ownerId },
        data: { unit: row.updateOwnerUnitTo },
      });
    }
    await prisma.salesItem.delete({ where: { id: row.targetId } });
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  if (options.apply) await applyPlan(plan);
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
