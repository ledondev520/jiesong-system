/**
 * Input: tmp/wps_11_export_list_raw/parsed/import_plan.json + backend/prisma/dev.db
 * Output: dry-run/apply cleanup of provable duplicate WPS packing rows and conflicting source notes
 * Pos: WPS 装箱明细去重脚本；处理导入计划中的同分候选、错挂来源 note，以及被拆分源行覆盖的无门店汇总行；默认 dry-run
 *
 * Note: 我被更新时，必须同步更新 scripts/README.md + PLAN/TASKS 检查点。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const DEFAULT_PLAN = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed/import_plan.json');

function parseArgs(argv) {
  const options = {
    plan: DEFAULT_PLAN,
    apply: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plan') {
      options.plan = path.resolve(argv[++i]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/dedupe_wps_packing_duplicates.js [--plan <file>] [--apply]');
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  return options;
}

function numbersClose(left, right, tolerance = 0.001) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function sameText(left, right) {
  return String(left || '') === String(right || '');
}

function textCompatible(keep, remove) {
  if (sameText(keep, remove)) return true;
  return Boolean(keep) && !remove;
}

function numberCompatible(keep, remove, tolerance = 0.001) {
  if (numbersClose(keep, remove, tolerance)) return true;
  return keep != null && remove == null;
}

function sourceRefs(note) {
  const refs = new Set();
  const pattern = /\[WPS_SOURCE\]\s+([^|]+?#[^:|]+:\d+)/g;
  let match = pattern.exec(String(note || ''));
  while (match) {
    refs.add(`[WPS_SOURCE] ${match[1].trim()}`);
    match = pattern.exec(String(note || ''));
  }
  return refs;
}

function removeSourceReference(note, source) {
  return String(note || '')
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part && part !== `[WPS_SOURCE] ${source}`)
    .join(' | ');
}

function sourceCoverageScore(item) {
  return sourceRefs(item.note).size;
}

function coreFieldsMatch(left, right) {
  const textFields = [
    'salesContractId',
    'productId',
    'storeId',
    'unit',
    'purchaseContractNo',
    'invoiceNo',
    'manufacturer',
    'specification',
    'supplement',
    'sourceParty',
  ];
  for (const field of textFields) {
    if (!textCompatible(left[field], right[field])) return false;
  }
  const numberFields = [
    'quantity',
    'boxes',
    'grossWeight',
    'netWeight',
    'volume',
    'unitPrice',
    'totalPrice',
    'purchaseCost',
    'length',
    'width',
    'height',
  ];
  for (const field of numberFields) {
    if (!numberCompatible(left[field], right[field])) return false;
  }
  if (Boolean(left.isOwnedByJiesong) === Boolean(right.isOwnedByJiesong)) return true;
  return Boolean(left.isOwnedByJiesong) === false
    && Boolean(right.isOwnedByJiesong) === true
    && Boolean(left.sourceParty);
}

function canDeleteDuplicate({ keep, remove, refCount }) {
  if (refCount > 0) return false;
  if (!coreFieldsMatch(keep, remove)) return false;
  const keepSources = sourceRefs(keep.note);
  const removeSources = sourceRefs(remove.note);
  for (const source of removeSources) {
    if (!keepSources.has(source)) return false;
  }
  return sourceCoverageScore(keep) > sourceCoverageScore(remove);
}

function sourceDataConflicts(item, sourceData) {
  const textFields = [
    'salesContractId',
    'productId',
    'storeId',
    'unit',
    'purchaseContractNo',
    'invoiceNo',
    'manufacturer',
    'specification',
    'supplement',
    'sourceParty',
  ];
  for (const field of textFields) {
    if (!sourceData[field] || !item[field]) continue;
    if (!sameText(item[field], sourceData[field])) return true;
  }

  const numberFields = [
    'quantity',
    'boxes',
    'grossWeight',
    'netWeight',
    'volume',
    'unitPrice',
    'totalPrice',
    'purchaseCost',
  ];
  for (const field of numberFields) {
    if (sourceData[field] == null || item[field] == null) continue;
    if (!numbersClose(item[field], sourceData[field], field === 'volume' ? 0.01 : 0.001)) return true;
  }
  return false;
}

function exactCoreFieldsMatch(left, right) {
  const fields = [
    'salesContractId',
    'productId',
    'storeId',
    'unit',
    'purchaseContractNo',
    'invoiceNo',
    'manufacturer',
    'specification',
    'supplement',
    'sourceParty',
    'quantity',
    'boxes',
    'grossWeight',
    'netWeight',
    'volume',
    'unitPrice',
    'totalPrice',
    'purchaseCost',
    'length',
    'width',
    'height',
  ];
  for (const field of fields) {
    if (left[field] == null && right[field] == null) continue;
    if (typeof left[field] === 'number' || typeof right[field] === 'number') {
      if (!numbersClose(left[field], right[field])) return false;
    } else if (!sameText(left[field], right[field])) {
      return false;
    }
  }
  return Boolean(left.isOwnedByJiesong) === Boolean(right.isOwnedByJiesong);
}

function aggregateKey(row) {
  const data = row.data || row;
  return [
    data.salesContractId,
    data.productId,
    data.unit || '',
    data.manufacturer || '',
    data.specification || '',
  ].join('|');
}

function sumRows(rows) {
  return {
    salesContractId: rows[0].data.salesContractId,
    productId: rows[0].data.productId,
    unit: rows[0].data.unit,
    manufacturer: rows[0].data.manufacturer,
    specification: rows[0].data.specification,
    quantity: rows.reduce((sum, row) => sum + Number(row.data.quantity || 0), 0),
    boxes: rows.reduce((sum, row) => sum + Number(row.data.boxes || 0), 0),
    grossWeight: rows.reduce((sum, row) => sum + Number(row.data.grossWeight || 0), 0),
    netWeight: rows.reduce((sum, row) => sum + Number(row.data.netWeight || 0), 0),
    volume: rows.reduce((sum, row) => sum + Number(row.data.volume || 0), 0),
  };
}

function sourceReplacementRows(plan) {
  const rows = [];
  for (const group of plan.operations?.packingReplacements || []) {
    for (const row of group.rows || []) {
      if (!row.data?.salesContractId || !row.data?.productId) continue;
      rows.push({
        contractNo: group.contractNo,
        contractId: group.contractId,
        source: row.source,
        data: row.data,
      });
    }
  }
  return rows;
}

function aggregateCoveredBySplitRows(item, summed) {
  if (item.storeId) return false;
  if (sourceCoverageScore(item) === 0) return false;
  if (item.salesContractId !== summed.salesContractId) return false;
  if (item.productId !== summed.productId) return false;
  if (!sameText(item.unit, summed.unit)) return false;
  if (!sameText(item.manufacturer, summed.manufacturer)) return false;
  if (!sameText(item.specification, summed.specification)) return false;
  return (
    numbersClose(item.quantity, summed.quantity)
    && numbersClose(item.boxes, summed.boxes)
    && numbersClose(item.grossWeight, summed.grossWeight)
    && numbersClose(item.netWeight, summed.netWeight)
    && numbersClose(item.volume, summed.volume, 0.01)
  );
}

function chooseKeepAndRemove(left, right) {
  const leftScore = sourceCoverageScore(left);
  const rightScore = sourceCoverageScore(right);
  if (leftScore === rightScore) return null;
  return leftScore > rightScore
    ? { keep: left, remove: right }
    : { keep: right, remove: left };
}

function ambiguousCandidatePairs(plan) {
  const pairs = [];
  for (const group of plan.operations?.packingMerges || []) {
    for (const row of group.unmatched || []) {
      const candidates = row.candidates || [];
      if (candidates.length !== 2) continue;
      if (candidates[0].score !== candidates[1].score) continue;
      pairs.push({
        contractNo: group.contractNo,
        source: row.source,
        ids: candidates.map((candidate) => candidate.packingItemId),
      });
    }
  }
  return pairs;
}

async function buildDedupePlan(options) {
  const plan = JSON.parse(fs.readFileSync(options.plan, 'utf8'));
  const pairs = ambiguousCandidatePairs(plan);
  const allIds = Array.from(new Set(pairs.flatMap((pair) => pair.ids)));
  const sourceRows = sourceReplacementRows(plan);
  const sourceRowBySource = new Map(sourceRows.map((row) => [row.source, row]));
  const contractIds = Array.from(new Set(sourceRows.map((row) => row.contractId).filter(Boolean)));
  const [items, refGroups] = await Promise.all([
    prisma.packingItem.findMany({ where: { id: { in: allIds } } }),
    prisma.customsDeclarationItem.groupBy({
      by: ['packingItemId'],
      where: { packingItemId: { in: allIds } },
      _count: { packingItemId: true },
    }),
  ]);
  const contractItems = contractIds.length > 0
    ? await prisma.packingItem.findMany({ where: { salesContractId: { in: contractIds } } })
    : [];
  const contractItemIds = contractItems.map((item) => item.id);
  const extraRefGroups = contractItemIds.length > 0
    ? await prisma.customsDeclarationItem.groupBy({
      by: ['packingItemId'],
      where: { packingItemId: { in: contractItemIds } },
      _count: { packingItemId: true },
    })
    : [];
  const byId = new Map(items.map((item) => [item.id, item]));
  const refCountById = new Map(
    [...refGroups, ...extraRefGroups].map((group) => [group.packingItemId, group._count.packingItemId]),
  );
  const deletes = new Map();
  const updates = new Map();
  const skipped = [];

  for (const pair of pairs) {
    const left = byId.get(pair.ids[0]);
    const right = byId.get(pair.ids[1]);
    if (!left || !right) {
      skipped.push({ ...pair, reason: 'missing_candidate' });
      continue;
    }
    const leftRefCount = refCountById.get(left.id) || 0;
    const rightRefCount = refCountById.get(right.id) || 0;
    const sourceRow = sourceRowBySource.get(pair.source);
    const sourceRecordedCandidates = [left, right].filter((item) => (
      sourceRefs(item.note).has(`[WPS_SOURCE] ${pair.source}`)
    ));
    if (sourceRow && sourceRecordedCandidates.length > 1) {
      const compatible = sourceRecordedCandidates.filter((item) => !sourceDataConflicts(item, sourceRow.data));
      const conflicting = sourceRecordedCandidates.filter((item) => sourceDataConflicts(item, sourceRow.data));
      if (compatible.length === 1 && conflicting.length > 0) {
        for (const item of conflicting) {
          const refCount = refCountById.get(item.id) || 0;
          if (refCount > 0) {
            skipped.push({
              ...pair,
              reason: 'conflicting_source_note_has_customs_refs',
              packingItemId: item.id,
              refCount,
            });
            continue;
          }
          const nextNote = removeSourceReference(item.note, pair.source);
          if (nextNote !== String(item.note || '')) {
            updates.set(`${item.id}:${pair.source}`, {
              contractNo: pair.contractNo,
              source: pair.source,
              packingItemId: item.id,
              keepSourceOnPackingItemId: compatible[0].id,
              reason: 'remove_conflicting_source_note',
              oldNote: item.note,
              newNote: nextNote,
            });
          }
        }
        continue;
      }
    }
    const choice = chooseKeepAndRemove(left, right);
    if (!choice) {
      if (leftRefCount === 0 && rightRefCount === 0 && exactCoreFieldsMatch(left, right)) {
        const [keep, remove] = [left, right].sort((a, b) => a.id.localeCompare(b.id));
        deletes.set(remove.id, {
          contractNo: pair.contractNo,
          sources: [pair.source],
          keepId: keep.id,
          removeId: remove.id,
          reason: 'exact_duplicate_no_refs',
        });
        continue;
      }
      skipped.push({ ...pair, reason: 'same_source_coverage' });
      continue;
    }
    const refCount = refCountById.get(choice.remove.id) || 0;
    if (!canDeleteDuplicate({ ...choice, refCount })) {
      skipped.push({ ...pair, reason: 'not_provable_duplicate', removeId: choice.remove.id, keepId: choice.keep.id, refCount });
      continue;
    }
    deletes.set(choice.remove.id, {
      contractNo: pair.contractNo,
      sources: [pair.source],
      keepId: choice.keep.id,
      removeId: choice.remove.id,
    });
  }

  const sourceRowsByKey = new Map();
  for (const row of sourceRows) {
    const rows = sourceRowsByKey.get(aggregateKey(row)) || [];
    rows.push(row);
    sourceRowsByKey.set(aggregateKey(row), rows);
  }
  for (const rows of sourceRowsByKey.values()) {
    if (rows.length < 2) continue;
    const summed = sumRows(rows);
    for (const item of contractItems) {
      if (!aggregateCoveredBySplitRows(item, summed)) continue;
      const refCount = refCountById.get(item.id) || 0;
      if (refCount > 0) {
        skipped.push({
          contractNo: rows[0].contractNo,
          source: rows.map((row) => row.source).join('; '),
          ids: [item.id],
          reason: 'aggregate_has_customs_refs',
          refCount,
        });
        continue;
      }
      deletes.set(item.id, {
        contractNo: rows[0].contractNo,
        sources: rows.map((row) => row.source),
        keepId: null,
        removeId: item.id,
        reason: 'covered_by_split_source_rows',
      });
    }
  }

  return {
    dryRun: !options.apply,
    updateCount: updates.size,
    deleteCount: deletes.size,
    updates: Array.from(updates.values()),
    deletes: Array.from(deletes.values()),
    skipped,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dedupePlan = await buildDedupePlan(options);
  if (options.apply && dedupePlan.deletes.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of dedupePlan.updates || []) {
        await tx.packingItem.update({
          where: { id: item.packingItemId },
          data: {
            note: item.newNote || null,
            updatedAt: new Date(),
          },
        });
      }
      for (const item of dedupePlan.deletes) {
        await tx.packingItem.delete({ where: { id: item.removeId } });
      }
    });
  } else if (options.apply && (dedupePlan.updates || []).length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const item of dedupePlan.updates || []) {
        await tx.packingItem.update({
          where: { id: item.packingItemId },
          data: {
            note: item.newNote || null,
            updatedAt: new Date(),
          },
        });
      }
    });
  }
  console.log(JSON.stringify({ ...dedupePlan, mode: options.apply ? 'apply' : 'dry-run' }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
