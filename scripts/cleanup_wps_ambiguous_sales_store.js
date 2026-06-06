/**
 * Input: tmp/wps_11_export_list_raw/parsed/import_plan.json + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/ambiguous_sales_store_cleanup_plan.json; optional Prisma updates/deletes when --apply is passed
 * Pos: 清理已被当前证据证明为不可靠的 WPS 路径门店销售行；删除不在候选集合内、与同数量装箱唯一门店冲突且已有正确重复行、同源正确价格已转移到强门店行、或已被同源装箱数量拆分行覆盖的记录
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const Papa = require(path.join(backendPath, 'node_modules/papaparse'));

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
  options.out = options.out || path.join(options.parsedDir, 'ambiguous_sales_store_cleanup_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/cleanup_wps_ambiguous_sales_store.js [options]

Options:
  --parsed-dir <dir>   解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>         输出 cleanup plan JSON
  --apply              执行删除；不传则只 dry-run
`);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCsv(filePath) {
  const parsed = Papa.parse(fs.readFileSync(filePath, 'utf8'), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`${filePath} CSV 解析失败: ${first.message}`);
  }
  return parsed.data.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.replace(/^\uFEFF/, '')] = typeof value === 'string' ? value.trim() : value;
    }
    return normalized;
  });
}

function canonicalName(value) {
  return String(value || '').trim().toLowerCase();
}

function isWpsPathInferred(note) {
  return String(note || '').includes('[WPS_SOURCE_PATH_STORE]');
}

function hasSupportedPackingStoreMarker(note, storeName) {
  const text = String(note || '');
  return [
    '[WPS_PACKING_SPEC_QUANTITY_STORE]',
    '[WPS_PACKING_QUANTITY_STORE]',
    '[WPS_PACKING_QUANTITY_CONSENSUS_STORE]',
    '[WPS_PACKING_QUANTITY_ALIAS_STORE]',
    '[WPS_PACKING_RESIDUAL_PRODUCT_STORE]',
  ].some((marker) => text.includes(`${marker} ${storeName}`));
}

function hasMixedStoreMarker(value) {
  return /[、，,；;]/.test(String(value || ''));
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').replace(/[$¥￥]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function numbersEqual(left, right, tolerance = 0.001) {
  if (left == null || right == null) return false;
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function quantityKey(value) {
  const number = numberOrNull(value);
  return number == null ? null : number.toFixed(6);
}

function sourceKey(row) {
  return `${row.source_file}#${row.sheet}:${row.row}`;
}

function sourceFromNote(note) {
  const match = String(note || '').match(/\[WPS_SOURCE\]\s+([^|]+?#[^:|]+:\d+)/);
  return match?.[1]?.trim() || null;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

async function buildPlan(options) {
  const importPlan = readJson(path.join(options.parsedDir, 'import_plan.json'), {});
  const salesRows = readCsv(path.join(options.parsedDir, 'preferred_sales_items.csv'));
  const packingRows = readCsv(path.join(options.parsedDir, 'preferred_packing_items.csv'));
  const salesBySource = new Map(salesRows.map((row) => [sourceKey(row), row]));
  const packingByContract = groupBy(packingRows, (row) => row.contract_no);
  const packingByContractProduct = groupBy(
    packingRows,
    (row) => `${row.contract_no}|${row.product_name}`,
  );

  const skipped = importPlan.skipped || [];
  const candidates = skipped.filter((item) => item.type === 'sales_row_ambiguous_packing_stores');
  const updates = [];
  const deletes = [];
  const kept = [];
  const updateIds = new Set();
  const deleteIds = new Set();
  const keptKeys = new Set();

  function pushUpdate(item) {
    if (updateIds.has(item.salesItemId)) return;
    updateIds.add(item.salesItemId);
    updates.push(item);
  }

  function pushDelete(item) {
    if (deleteIds.has(item.salesItemId)) return;
    deleteIds.add(item.salesItemId);
    deletes.push(item);
  }

  function pushKept(item) {
    const key = `${item.reason}:${item.salesItemId || item.source || ''}`;
    if (keptKeys.has(key)) return;
    keptKeys.add(key);
    kept.push(item);
  }

  function packingProductMatchesSales(sourceSales, packingRow) {
    if (packingRow.product_name === sourceSales.product_name) {
      return { matched: true, scope: 'exact_product' };
    }
    if (
      sourceSales.source_file
      && packingRow.source_file === sourceSales.source_file
      && sourceSales.product_name
      && String(packingRow.note || '').includes(sourceSales.product_name)
    ) {
      return { matched: true, scope: 'source_note_product_alias' };
    }
    return { matched: false, scope: null };
  }

  for (const item of candidates) {
    const allowedStores = new Set((item.stores || []).map(canonicalName));
    const matches = await prisma.salesItem.findMany({
      where: { note: { contains: item.source } },
      include: {
        salesContract: true,
        product: true,
        store: true,
        _count: { select: { inventories: true } },
      },
    });
    for (const match of matches) {
      if (!isWpsPathInferred(match.note)) {
        pushKept({
          reason: 'not_path_inferred',
          source: item.source,
          salesItemId: match.id,
          storeName: match.store.name,
        });
        continue;
      }
      if (match._count.inventories > 0) {
        pushKept({
          reason: 'has_inventory_refs',
          source: item.source,
          salesItemId: match.id,
          storeName: match.store.name,
          inventoryRefs: match._count.inventories,
        });
        continue;
      }
      if (allowedStores.has(canonicalName(match.store.name))) {
        pushKept({
          reason: 'path_store_still_candidate',
          source: item.source,
          salesItemId: match.id,
          storeName: match.store.name,
          candidateStores: item.stores || [],
        });
        continue;
      }
      pushDelete({
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        source: item.source,
        storeName: match.store.name,
        candidateStores: item.stores || [],
        quantity: match.quantity,
        sellingPrice: match.sellingPrice,
        reason: 'path_inferred_store_not_in_current_packing_candidates',
      });
    }
  }

  const stores = await prisma.store.findMany();
  const storesByCanonicalName = new Map(stores.map((store) => [canonicalName(store.name), store]));
  const pathInferredRows = await prisma.salesItem.findMany({
    where: { note: { contains: '[WPS_SOURCE_PATH_STORE]' } },
    include: {
      salesContract: true,
      product: true,
      store: true,
      _count: { select: { inventories: true } },
    },
  });
  const allSalesRows = await prisma.salesItem.findMany({
    include: {
      salesContract: true,
      product: true,
      store: true,
    },
  });

  for (const match of pathInferredRows) {
    const source = sourceFromNote(match.note);
    if (!source) {
      pushKept({
        reason: 'path_inferred_without_source_note',
        salesItemId: match.id,
        storeName: match.store.name,
      });
      continue;
    }
    const sourceSales = salesBySource.get(source);
    if (!sourceSales) {
      pushKept({
        reason: 'path_inferred_source_not_found',
        source,
        salesItemId: match.id,
        storeName: match.store.name,
      });
      continue;
    }
    if (match._count.inventories > 0) {
      pushKept({
        reason: 'path_store_has_inventory_refs',
        source,
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        storeName: match.store.name,
        inventoryRefs: match._count.inventories,
      });
      continue;
    }
    const equivalentNonPath = allSalesRows.find((row) => (
      row.id !== match.id
      && row.salesContractId === match.salesContractId
      && row.productId === match.productId
      && numbersEqual(row.quantity, match.quantity)
      && numbersEqual(row.sellingPrice, match.sellingPrice)
      && String(row.note || '').includes(source)
      && !isWpsPathInferred(row.note)
    ));
    if (equivalentNonPath) {
      pushDelete({
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        source,
        storeName: match.store.name,
        quantity: match.quantity,
        sellingPrice: match.sellingPrice,
        equivalentSalesItemId: equivalentNonPath.id,
        equivalentStoreName: equivalentNonPath.store.name,
        reason: 'path_inferred_duplicate_equivalent_non_path_source',
      });
      continue;
    }
    const sourcePrice = numberOrNull(sourceSales.unit_price);
    const priceMismatchNonPath = allSalesRows.find((row) => (
      row.id !== match.id
      && row.salesContractId === match.salesContractId
      && row.productId === match.productId
      && numbersEqual(row.quantity, match.quantity)
      && sourcePrice != null
      && numbersEqual(match.sellingPrice, sourcePrice)
      && !numbersEqual(row.sellingPrice, sourcePrice)
      && String(row.note || '').includes(source)
      && String(row.note || '').includes('[WPS_CONTRACT_STORE]')
      && !isWpsPathInferred(row.note)
    ));
    if (priceMismatchNonPath) {
      pushUpdate({
        salesItemId: priceMismatchNonPath.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        source,
        storeName: priceMismatchNonPath.store.name,
        quantity: priceMismatchNonPath.quantity,
        oldSellingPrice: priceMismatchNonPath.sellingPrice,
        newSellingPrice: sourcePrice,
        pathSalesItemId: match.id,
        pathStoreName: match.store.name,
        reason: 'non_path_source_price_corrected_from_equivalent_path_source',
      });
      pushDelete({
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        source,
        storeName: match.store.name,
        quantity: match.quantity,
        sellingPrice: match.sellingPrice,
        equivalentSalesItemId: priceMismatchNonPath.id,
        equivalentStoreName: priceMismatchNonPath.store.name,
        reason: 'path_inferred_duplicate_after_non_path_source_price_correction',
      });
      continue;
    }
    if (hasSupportedPackingStoreMarker(match.note, match.store.name)) {
      pushKept({
        reason: 'path_store_supported_by_packing_marker',
        source,
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        storeName: match.store.name,
      });
      continue;
    }

    const splitRows = allSalesRows.filter((row) => (
      row.id !== match.id
      && row.salesContractId === match.salesContractId
      && row.productId === match.productId
      && String(row.note || '').includes(source)
      && String(row.note || '').includes('[WPS_SALES_SPLIT_BY_PACKING_QUANTITY]')
      && !isWpsPathInferred(row.note)
    ));
    const splitQuantity = splitRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    if (
      splitRows.length >= 2
      && numbersEqual(splitQuantity, match.quantity)
      && splitRows.every((row) => numbersEqual(row.sellingPrice, match.sellingPrice))
    ) {
      pushDelete({
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        source,
        storeName: match.store.name,
        quantity: match.quantity,
        sellingPrice: match.sellingPrice,
        splitSalesItemIds: splitRows.map((row) => row.id),
        splitStores: splitRows.map((row) => row.store.name),
        reason: 'path_inferred_source_covered_by_split_sales_rows',
      });
      continue;
    }

    const exactQuantityPackingCandidates = (packingByContract.get(match.salesContract.contractNo) || [])
      .map((row) => ({ row, productMatch: packingProductMatchesSales(sourceSales, row) }))
      .filter(({ row, productMatch }) => (
        productMatch.matched
        && row.store
        && !hasMixedStoreMarker(row.store)
        && quantityKey(row.quantity) === quantityKey(sourceSales.quantity)
      ));
    const exactQuantityPackingStores = exactQuantityPackingCandidates
      .map(({ row }) => storesByCanonicalName.get(canonicalName(row.store)))
      .filter(Boolean);
    const uniqueStoreIds = new Set(exactQuantityPackingStores.map((store) => store.id));
    if (uniqueStoreIds.size === 0) {
      const productPackingStores = (packingByContractProduct.get(`${match.salesContract.contractNo}|${sourceSales.product_name}`) || [])
        .filter((row) => row.store && !hasMixedStoreMarker(row.store))
        .map((row) => row.store);
      pushKept({
        reason: 'path_store_without_exact_quantity_packing_evidence',
        source,
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        storeName: match.store.name,
        sourceQuantity: sourceSales.quantity,
        productPackingStores: Array.from(new Set(productPackingStores)),
      });
      continue;
    }
    if (uniqueStoreIds.size > 1) {
      pushKept({
        reason: 'path_store_multiple_exact_quantity_packing_stores',
        source,
        salesItemId: match.id,
        contractNo: match.salesContract.contractNo,
        productName: match.product.customsName,
        storeName: match.store.name,
        sourceQuantity: sourceSales.quantity,
        candidateStores: Array.from(new Set(exactQuantityPackingStores.map((store) => store.name))),
      });
      continue;
    }
    const provenStore = exactQuantityPackingStores[0];
    if (provenStore.id === match.storeId) {
      const productMatchScopes = Array.from(new Set(exactQuantityPackingCandidates.map(({ productMatch }) => productMatch.scope)));
      pushKept({
        reason: 'path_store_supported_by_exact_quantity_packing',
        source,
        salesItemId: match.id,
        storeName: match.store.name,
        productMatchScopes,
      });
      continue;
    }
    if (match._count.inventories > 0) {
      pushKept({
        reason: 'path_store_conflict_has_inventory_refs',
        source,
        salesItemId: match.id,
        storeName: match.store.name,
        provenStoreName: provenStore.name,
        inventoryRefs: match._count.inventories,
      });
      continue;
    }

    const equivalent = allSalesRows.find((row) => (
      row.id !== match.id
      && row.salesContractId === match.salesContractId
      && row.productId === match.productId
      && row.storeId === provenStore.id
      && numbersEqual(row.quantity, match.quantity)
      && numbersEqual(row.sellingPrice, match.sellingPrice)
      && String(row.note || '').includes(source)
      && !isWpsPathInferred(row.note)
    ));
    if (!equivalent) {
      pushKept({
        reason: 'path_store_conflict_without_equivalent_correct_row',
        source,
        salesItemId: match.id,
        storeName: match.store.name,
        provenStoreName: provenStore.name,
      });
      continue;
    }

    pushDelete({
      salesItemId: match.id,
      contractNo: match.salesContract.contractNo,
      productName: match.product.customsName,
      source,
      storeName: match.store.name,
      candidateStores: [provenStore.name],
      quantity: match.quantity,
      sellingPrice: match.sellingPrice,
      equivalentSalesItemId: equivalent.id,
      reason: 'path_inferred_store_conflicts_with_exact_quantity_packing_and_equivalent_exists',
    });
  }

  return {
    options,
    summary: {
      dryRun: !options.apply,
      skippedSalesRows: candidates.length,
      updateCount: updates.length,
      deleteCount: deletes.length,
      keptCount: kept.length,
      pathInferredRows: pathInferredRows.length,
    },
    updates,
    deletes,
    kept,
  };
}

async function applyPlan(plan) {
  if (!plan.options.apply) return;
  await prisma.$transaction(async (tx) => {
    for (const item of plan.updates || []) {
      await tx.salesItem.update({
        where: { id: item.salesItemId },
        data: {
          sellingPrice: item.newSellingPrice,
          updatedAt: new Date(),
        },
      });
    }
    for (const item of plan.deletes) {
      await tx.salesItem.delete({ where: { id: item.salesItemId } });
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  fs.writeFileSync(options.out, JSON.stringify(plan, null, 2), 'utf8');
  await applyPlan(plan);
  console.log(JSON.stringify({
    ...plan.summary,
    out: options.out,
    mode: options.apply ? 'apply' : 'dry-run',
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
