/**
 * Input: tmp/wps_11_export_list_raw/parsed/wps_candidate_source_mapping_review.json + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_aggregate_alias_source_owner_cleanup_plan.json; optional delete when --apply is passed
 * Pos: 清理“组合门店别名”聚合来源行已覆盖的无来源拆分销售/装箱行；默认 dry-run，写库前必须先备份 DB
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
  options.out = options.out || path.join(options.parsedDir, 'wps_aggregate_alias_source_owner_cleanup_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/cleanup_wps_aggregate_alias_source_owner_items.js [options]

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

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sameNumber(left, right, tolerance = 0.000001) {
  const a = numberValue(left);
  const b = numberValue(right);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return Math.abs(a - b) <= tolerance;
}

function normalizeStore(value) {
  return String(value || '')
    .replace(/店$/u, '')
    .replace(/\s+/g, '')
    .trim();
}

function storeTokens(value) {
  const normalized = normalizeStore(value)
    .replace(/和/g, '、')
    .replace(/[，,；;]/g, '、');
  const rawParts = normalized.split('、').filter(Boolean);
  const tokens = new Set(rawParts);
  let lastPrefix = '';
  for (const part of rawParts) {
    const prefixMatch = part.match(/^([^\d]+)(\d.*)$/u);
    if (prefixMatch) {
      lastPrefix = prefixMatch[1];
    } else if (/^\d/.test(part) && lastPrefix) {
      tokens.add(`${lastPrefix}${part}`);
    }
  }
  return tokens;
}

function aggregateStoreCovers(ownerStore, targetStore) {
  const owner = normalizeStore(ownerStore);
  const target = normalizeStore(targetStore);
  if (!owner || !target || owner === target) return false;
  if (owner.includes(target)) return true;
  return storeTokens(owner).has(target);
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

async function loadPackingItem(id) {
  return prisma.packingItem.findUnique({
    where: { id },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { customsDeclarationItems: true } },
    },
  });
}

function compatibleSales(target, owner) {
  if (!target || !owner) return { ok: false, reason: 'missing_db_row' };
  if (target.id === owner.id) return { ok: false, reason: 'same_row' };
  if (target._count.inventories !== 0) return { ok: false, reason: 'target_has_inventory_refs' };
  if (owner._count.inventories !== 0) return { ok: false, reason: 'owner_has_inventory_refs' };
  if (hasWpsSource(target.note)) return { ok: false, reason: 'target_already_has_source' };
  if (!hasWpsSource(owner.note)) return { ok: false, reason: 'owner_missing_source' };
  if (target.salesContractId !== owner.salesContractId) return { ok: false, reason: 'contract_mismatch' };
  if (target.productId !== owner.productId) return { ok: false, reason: 'product_mismatch' };
  if (!aggregateStoreCovers(owner.store?.name, target.store?.name)) return { ok: false, reason: 'owner_store_not_aggregate_alias_cover' };
  if (!sameNumber(target.quantity, owner.quantity)) return { ok: false, reason: 'quantity_mismatch' };
  if (!sameNumber(target.sellingPrice, owner.sellingPrice)) return { ok: false, reason: 'price_mismatch' };
  if (owner.unit && target.unit && owner.unit !== target.unit) return { ok: false, reason: 'unit_mismatch' };
  if (Number(target.costPrice) !== 0 && !sameNumber(target.costPrice, owner.costPrice)) return { ok: false, reason: 'cost_price_mismatch' };
  return { ok: true, reason: 'covered_by_aggregate_alias_source_owner' };
}

function compatiblePacking(target, owner) {
  if (!target || !owner) return { ok: false, reason: 'missing_db_row' };
  if (target.id === owner.id) return { ok: false, reason: 'same_row' };
  if (target._count.customsDeclarationItems !== 0) return { ok: false, reason: 'target_has_customs_refs' };
  if (owner._count.customsDeclarationItems !== 0) return { ok: false, reason: 'owner_has_customs_refs' };
  if (hasWpsSource(target.note)) return { ok: false, reason: 'target_already_has_source' };
  if (!hasWpsSource(owner.note)) return { ok: false, reason: 'owner_missing_source' };
  if (target.salesContractId !== owner.salesContractId) return { ok: false, reason: 'contract_mismatch' };
  if (target.productId !== owner.productId) return { ok: false, reason: 'product_mismatch' };
  if (!aggregateStoreCovers(owner.store?.name, target.store?.name)) return { ok: false, reason: 'owner_store_not_aggregate_alias_cover' };
  if (!sameNumber(target.quantity, owner.quantity)) return { ok: false, reason: 'quantity_mismatch' };
  if (owner.unit && target.unit && owner.unit !== target.unit) return { ok: false, reason: 'unit_mismatch' };
  if (target.specification && owner.specification && target.specification !== owner.specification) return { ok: false, reason: 'specification_mismatch' };
  if (target.manufacturer && owner.manufacturer && target.manufacturer !== owner.manufacturer) return { ok: false, reason: 'manufacturer_mismatch' };
  return { ok: true, reason: 'covered_by_aggregate_alias_source_owner' };
}

function oneSameInterfaceOwner(row) {
  const tableName = row.type === 'sales_item_missing_source' ? 'sales_item' : 'packing_item';
  const owners = [];
  for (const source of row.candidate_sources || []) {
    for (const owner of source.attached_elsewhere || []) {
      if (owner.table_name === tableName) {
        owners.push({ ...owner, source: source.source });
      }
    }
  }
  const unique = new Map();
  for (const owner of owners) unique.set(owner.id, owner);
  return unique.size === 1 ? [...unique.values()][0] : null;
}

async function buildPlan(options) {
  const review = readJson(path.join(options.parsedDir, 'wps_candidate_source_mapping_review.json'));
  const candidates = (review.details || []).filter((row) => (
    ['candidate_already_attached_elsewhere', 'multi_candidate_manual_review'].includes(row.verdict)
    && ['sales_item_missing_source', 'packing_item_missing_source'].includes(row.type)
  ));

  const deletes = [];
  const kept = [];

  for (const row of candidates) {
    if (row.type === 'sales_item_missing_source') {
      const target = await loadSalesItem(row.id);
      const compatible = [];
      const incompatible = [];
      for (const source of row.candidate_sources || []) {
        for (const ownerInfo of source.attached_elsewhere || []) {
          if (ownerInfo.table_name !== 'sales_item') continue;
          const owner = await loadSalesItem(ownerInfo.id);
          const verdict = compatibleSales(target, owner);
          const planRow = {
            type: row.type,
            targetId: row.id,
            ownerId: ownerInfo.id,
            contractNo: row.contract_no,
            product: row.product,
            targetStore: target?.store?.name || row.store,
            ownerStore: owner?.store?.name || ownerInfo.store || '',
            quantity: row.quantity,
            unit: target?.unit || '',
            price: row.price,
            source: source.source || '',
            updateOwnerUnitTo: owner && !owner.unit && target?.unit ? target.unit : null,
            reason: verdict.reason,
          };
          if (verdict.ok) compatible.push(planRow);
          else incompatible.push(planRow);
        }
      }
      if (compatible.length === 1) {
        deletes.push({ ...compatible[0], incompatibleOwnerCount: incompatible.length });
      } else {
        kept.push({
          id: row.id,
          type: row.type,
          reason: compatible.length > 1 ? 'multiple_compatible_owners' : 'no_compatible_aggregate_alias_owner',
          compatibleCount: compatible.length,
          incompatibleCount: incompatible.length,
        });
      }
    } else {
      const target = await loadPackingItem(row.id);
      const compatible = [];
      const incompatible = [];
      for (const source of row.candidate_sources || []) {
        for (const ownerInfo of source.attached_elsewhere || []) {
          if (ownerInfo.table_name !== 'packing_item') continue;
          const owner = await loadPackingItem(ownerInfo.id);
          const verdict = compatiblePacking(target, owner);
          const planRow = {
            type: row.type,
            targetId: row.id,
            ownerId: ownerInfo.id,
            contractNo: row.contract_no,
            product: row.product,
            targetStore: target?.store?.name || row.store,
            ownerStore: owner?.store?.name || ownerInfo.store || '',
            quantity: row.quantity,
            unit: target?.unit || '',
            source: source.source || '',
            updateOwnerUnitTo: owner && !owner.unit && target?.unit ? target.unit : null,
            reason: verdict.reason,
          };
          if (verdict.ok) compatible.push(planRow);
          else incompatible.push(planRow);
        }
      }
      if (compatible.length === 1) {
        deletes.push({ ...compatible[0], incompatibleOwnerCount: incompatible.length });
      } else {
        kept.push({
          id: row.id,
          type: row.type,
          reason: compatible.length > 1 ? 'multiple_compatible_owners' : 'no_compatible_aggregate_alias_owner',
          compatibleCount: compatible.length,
          incompatibleCount: incompatible.length,
        });
      }
    }
  }

  return {
    status: options.apply ? 'applied' : 'dry_run',
    mode: 'delete_split_rows_covered_by_aggregate_alias_source_owner',
    candidateCount: candidates.length,
    deleteCount: deletes.length,
    keptCount: kept.length,
    deletes,
    kept,
  };
}

async function applyPlan(plan) {
  for (const row of plan.deletes) {
    if (row.type === 'sales_item_missing_source') {
      if (row.updateOwnerUnitTo) {
        await prisma.salesItem.update({ where: { id: row.ownerId }, data: { unit: row.updateOwnerUnitTo } });
      }
      await prisma.salesItem.delete({ where: { id: row.targetId } });
    } else if (row.type === 'packing_item_missing_source') {
      if (row.updateOwnerUnitTo) {
        await prisma.packingItem.update({ where: { id: row.ownerId }, data: { unit: row.updateOwnerUnitTo } });
      }
      await prisma.packingItem.delete({ where: { id: row.targetId } });
    }
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
