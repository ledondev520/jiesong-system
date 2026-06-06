/**
 * Input: tmp/wps_11_export_list_raw/parsed/purchase_evidence_*.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/purchase_evidence_import_plan.json; optional Prisma writes when --apply is passed
 * Pos: WPS 采购合同凭证幂等导入脚本；默认 dry-run，只导入字段齐全且库里缺失的真实采购合同；显式开启后可导入只有合同头证据的 DRAFT 合同
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
const SOURCE_NOTE_PREFIX = '[WPS_PURCHASE_EVIDENCE]';

function parseArgs(argv) {
  const options = {
    parsedDir: DEFAULT_PARSED_DIR,
    out: null,
    apply: false,
    allowHeaderOnlyContracts: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--parsed-dir') {
      options.parsedDir = path.resolve(argv[++index]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--allow-header-only-contracts') {
      options.allowHeaderOnlyContracts = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  options.out = options.out || path.join(options.parsedDir, 'purchase_evidence_import_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import_wps_purchase_evidence.js [options]

Options:
  --parsed-dir <dir>  解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>        输出 purchase import plan JSON
  --allow-header-only-contracts
                    允许导入合同号、乙方、日期、总额齐全但无逐项明细的 DRAFT 合同头
  --apply             执行写库；不传则只 dry-run
`);
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(content, {
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

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\u3000/g, ' ').trim();
  return text || null;
}

function numberOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text.replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function intOrDefault(value, fallback) {
  const number = numberOrNull(value);
  return number == null ? fallback : Math.round(number);
}

function dateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp);
}

function sourceNote(source, extra = null) {
  return [SOURCE_NOTE_PREFIX, source, extra].filter(Boolean).join(' ');
}

function sourceAlreadyRecorded(note, source) {
  return String(note || '').includes(source);
}

function normalizeAccount(value) {
  return cleanText(value)?.replace(/\s+/g, '') || null;
}

async function loadDbState() {
  const [
    suppliers,
    products,
    contracts,
  ] = await Promise.all([
    prisma.supplier.findMany(),
    prisma.product.findMany(),
    prisma.purchaseContract.findMany({ include: { items: true } }),
  ]);
  return { suppliers, products, contracts };
}

function buildPlan(options, state, preferredRows, itemRows) {
  const suppliersByName = new Map(state.suppliers.map((item) => [item.name, item]));
  const productsByName = new Map(state.products.map((item) => [item.customsName, item]));
  const contractsByNo = new Map(state.contracts.map((item) => [item.contractNo, item]));
  const itemsBySource = new Map();
  for (const row of itemRows) {
    const key = `${row.purchase_contract_no}::${row.relative_path}`;
    if (!itemsBySource.has(key)) itemsBySource.set(key, []);
    itemsBySource.get(key).push(row);
  }

  const supplierCreates = [];
  const supplierUpdates = [];
  const productCreates = [];
  const productUpdates = [];
  const contractCreates = [];
  const purchaseItemCreates = [];
  const skipped = [];
  const virtualSuppliers = new Map();
  const virtualProducts = new Map();

  function resolveSupplier(row) {
    const name = cleanText(row.supplier_name);
    if (!name) return null;
    const existing = suppliersByName.get(name);
    const data = {
      name,
      taxId: cleanText(row.supplier_tax_id),
      address: cleanText(row.supplier_address),
      bankName: cleanText(row.bank_name),
      bankAccount: normalizeAccount(row.bank_account),
      hasQualityIssue: false,
      isActive: true,
    };
    if (existing) {
      const patch = {};
      for (const field of ['taxId', 'address', 'bankName', 'bankAccount']) {
        if (!existing[field] && data[field]) patch[field] = data[field];
      }
      if (Object.keys(patch).length > 0 && !supplierUpdates.some((item) => item.supplierId === existing.id)) {
        supplierUpdates.push({
          supplierId: existing.id,
          supplierName: name,
          data: patch,
          source: row.relative_path,
        });
      }
      return existing;
    }
    if (virtualSuppliers.has(name)) return virtualSuppliers.get(name);
    const virtual = { id: `__new_supplier__:${name}`, name };
    virtualSuppliers.set(name, virtual);
    supplierCreates.push({
      supplierName: name,
      data,
      source: row.relative_path,
    });
    return virtual;
  }

  function resolveProduct(itemRow) {
    const name = cleanText(itemRow.product_name);
    if (!name) return null;
    const unit = cleanText(itemRow.unit);
    const existing = productsByName.get(name);
    if (existing) {
      if (!existing.unit && unit && !productUpdates.some((item) => item.productId === existing.id)) {
        productUpdates.push({
          productId: existing.id,
          productName: name,
          data: { unit },
          source: itemRow.relative_path,
        });
      }
      return existing;
    }
    if (virtualProducts.has(name)) return virtualProducts.get(name);
    const virtual = { id: `__new_product__:${name}`, customsName: name };
    virtualProducts.set(name, virtual);
    productCreates.push({
      productName: name,
      data: {
        customsName: name,
        unit,
        isActive: true,
      },
      source: itemRow.relative_path,
    });
    return virtual;
  }

  for (const row of preferredRows) {
    const contractNo = cleanText(row.purchase_contract_no);
    const headerOnly = row.readiness === 'header_ready_for_import';
    const importable = row.readiness === 'ready_for_import'
      || (options.allowHeaderOnlyContracts && headerOnly);
    if (!importable || row.db_contract_exists === '1') {
      skipped.push({
        type: 'preferred_row_not_importable',
        contractNo,
        readiness: row.readiness,
        dbContractExists: row.db_contract_exists,
        source: row.relative_path,
        issues: row.issues,
      });
      continue;
    }
    if (!contractNo || contractsByNo.has(contractNo)) {
      skipped.push({
        type: 'missing_or_existing_contract',
        contractNo,
        source: row.relative_path,
      });
      continue;
    }
    const sourceItems = itemsBySource.get(`${contractNo}::${row.relative_path}`) || [];
    if (sourceItems.length === 0 && !headerOnly) {
      skipped.push({
        type: 'missing_purchase_items',
        contractNo,
        source: row.relative_path,
      });
      continue;
    }
    const supplier = resolveSupplier(row);
    if (!supplier) {
      skipped.push({
        type: 'missing_supplier',
        contractNo,
        source: row.relative_path,
      });
      continue;
    }
    const contractData = {
      contractNo,
      supplierId: supplier.id,
      totalAmount: numberOrNull(row.total_amount) || 0,
      paidAmount: 0,
      taxRate: intOrDefault(row.tax_rate, 13),
      status: 'DRAFT',
      signedAt: dateOrNull(row.signed_at),
      storeName: null,
      note: sourceNote(
        row.relative_path,
        headerOnly ? 'WPS 采购合同头凭证导入；未抽到逐项明细，未创建采购明细' : 'WPS 采购合同凭证导入',
      ),
    };
    contractCreates.push({
      contractNo,
      supplierName: supplier.name,
      source: row.relative_path,
      headerOnly,
      data: contractData,
    });
    for (const itemRow of sourceItems) {
      const product = resolveProduct(itemRow);
      if (!product) {
        skipped.push({
          type: 'missing_product',
          contractNo,
          source: itemRow.relative_path,
        });
        continue;
      }
      purchaseItemCreates.push({
        contractNo,
        productName: product.customsName,
        source: itemRow.relative_path,
        data: {
          purchaseContractId: `__new_purchase_contract__:${contractNo}`,
          productId: product.id,
          quantity: numberOrNull(itemRow.quantity) || 0,
          unit: cleanText(itemRow.unit),
          unitPrice: numberOrNull(itemRow.unit_price) || 0,
          totalPrice: numberOrNull(itemRow.total_amount) || 0,
          specification: null,
          note: sourceNote(itemRow.relative_path),
        },
      });
    }
  }

  return {
    options,
    summary: {
      dryRun: !options.apply,
      supplierCreates: supplierCreates.length,
      supplierUpdates: supplierUpdates.length,
      productCreates: productCreates.length,
      productUpdates: productUpdates.length,
      contractCreates: contractCreates.length,
      headerOnlyContractCreates: contractCreates.filter((item) => item.headerOnly).length,
      purchaseItemCreates: purchaseItemCreates.length,
      skipped: skipped.length,
    },
    operations: {
      supplierCreates,
      supplierUpdates,
      productCreates,
      productUpdates,
      contractCreates,
      purchaseItemCreates,
    },
    skipped,
  };
}

async function resolveCreatedSuppliers(tx, supplierCreates) {
  const map = new Map();
  for (const item of supplierCreates) {
    const supplier = await tx.supplier.create({ data: item.data });
    map.set(`__new_supplier__:${item.supplierName}`, supplier.id);
  }
  return map;
}

async function resolveCreatedProducts(tx, productCreates) {
  const map = new Map();
  for (const item of productCreates) {
    const product = await tx.product.create({ data: item.data });
    map.set(`__new_product__:${item.productName}`, product.id);
  }
  return map;
}

function replaceIds(data, supplierIdMap, productIdMap, contractIdMap) {
  const next = { ...data };
  if (supplierIdMap.has(next.supplierId)) next.supplierId = supplierIdMap.get(next.supplierId);
  if (productIdMap.has(next.productId)) next.productId = productIdMap.get(next.productId);
  if (contractIdMap.has(next.purchaseContractId)) next.purchaseContractId = contractIdMap.get(next.purchaseContractId);
  return next;
}

async function applyPlan(plan) {
  if (!plan.options.apply) return;
  await prisma.$transaction(async (tx) => {
    const supplierIdMap = await resolveCreatedSuppliers(tx, plan.operations.supplierCreates);
    for (const update of plan.operations.supplierUpdates) {
      await tx.supplier.update({ where: { id: update.supplierId }, data: update.data });
    }
    const productIdMap = await resolveCreatedProducts(tx, plan.operations.productCreates);
    for (const update of plan.operations.productUpdates) {
      await tx.product.update({ where: { id: update.productId }, data: update.data });
    }
    const contractIdMap = new Map();
    for (const create of plan.operations.contractCreates) {
      const contract = await tx.purchaseContract.create({
        data: replaceIds(create.data, supplierIdMap, productIdMap, contractIdMap),
      });
      contractIdMap.set(`__new_purchase_contract__:${create.contractNo}`, contract.id);
    }
    for (const create of plan.operations.purchaseItemCreates) {
      await tx.purchaseItem.create({
        data: replaceIds(create.data, supplierIdMap, productIdMap, contractIdMap),
      });
    }
  }, { timeout: 60000 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const preferredRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_preferred.csv'));
  const itemRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_items.csv'));
  const state = await loadDbState();
  const plan = buildPlan(options, state, preferredRows, itemRows);
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
