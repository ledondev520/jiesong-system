/**
 * Input: tmp/wps_11_export_list_raw/parsed/evidence_*.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/evidence_import_plan.json; optional Prisma writes when --apply is passed
 * Pos: WPS 真实凭证幂等导入脚本；默认 dry-run，只写真实报关单、报关明细、退税草稿和可安全命中的报关明细申报要素，不消费污染的发票汇总
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
const SOURCE_NOTE_PREFIX = '[WPS_EVIDENCE]';

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

  options.out = options.out || path.join(options.parsedDir, 'evidence_import_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import_wps_export_evidence.js [options]

Options:
  --parsed-dir <dir>  解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>        输出 evidence import plan JSON
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
  const number = Number(text.replace(/,/g, ''));
  return Number.isFinite(number) ? number : null;
}

function dateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp);
}

function splitList(value) {
  return cleanText(value)?.split(';').map((item) => item.trim()).filter(Boolean) || [];
}

function compactName(value) {
  return String(value || '').replace(/\s+/g, '');
}

function sourceNote(source, extra = null) {
  return [SOURCE_NOTE_PREFIX, source, extra].filter(Boolean).join(' ');
}

function sourceAlreadyRecorded(note, source) {
  return String(note || '').includes(source);
}

function buildEvidenceByDeclaration(extractRows) {
  const map = new Map();
  for (const row of extractRows) {
    const declarationNo = cleanText(row.declaration_no);
    if (!declarationNo) continue;
    if (!map.has(declarationNo)) {
      map.set(declarationNo, []);
    }
    map.get(declarationNo).push(row);
  }
  return map;
}

function chooseBestHeaderEvidence(rows) {
  return rows
    .slice()
    .sort((left, right) => {
      const leftScore = scoreHeaderEvidence(left);
      const rightScore = scoreHeaderEvidence(right);
      return rightScore - leftScore;
    })[0] || null;
}

function scoreHeaderEvidence(row) {
  let score = 0;
  if (row.category === 'export_tax_refund') score += 20;
  if (row.declared_at) score += 4;
  if (row.export_date) score += 4;
  if (row.gross_weight) score += 2;
  if (row.net_weight) score += 2;
  if (row.item_count && Number(row.item_count) > 0) score += 2;
  return score;
}

function scoreDeclarationElementEvidence(row) {
  if (row.category === 'export_tax_refund') return 30;
  if (row.category === 'customs_declaration') return 20;
  if (row.category === 'shipment_list') return 10;
  return 0;
}

function declarationElementSourceKind(row) {
  return row.category === 'shipment_list' ? 'shipment_list' : 'formal_evidence';
}

function hasUsableDeclarationElements(row) {
  const parts = (cleanText(row.declaration_elements) || '').split('|').filter(Boolean);
  if (parts.length >= 6) return true;
  if (parts.length < 5) return false;
  const lastPart = parts[parts.length - 1] || '';
  return !/[或，、,]$/.test(lastPart);
}

function normalizeItemRows(rows) {
  return rows.map((row) => ({
    ...row,
    declaration_no: cleanText(row.declaration_no),
    contract_no: cleanText(row.contract_no),
    customs_name: cleanText(row.customs_name),
    hs_code: cleanText(row.hs_code),
    unit: cleanText(row.unit),
    item_no_number: Number(row.item_no),
    quantity_number: numberOrNull(row.quantity),
    unit_price_number: numberOrNull(row.unit_price),
    total_price_number: numberOrNull(row.total_price),
    declaration_elements: cleanText(row.declaration_elements),
    source_area: cleanText(row.source_area),
  })).filter((row) => (
    row.declaration_no
    && row.contract_no
    && row.customs_name
    && row.hs_code
    && Number.isFinite(row.item_no_number)
  ));
}

async function loadDbState() {
  const [
    contracts,
    declarations,
    refunds,
    products,
  ] = await Promise.all([
    prisma.salesContract.findMany(),
    prisma.customsDeclaration.findMany({ include: { items: true, taxRefunds: true } }),
    prisma.taxRefund.findMany(),
    prisma.product.findMany(),
  ]);
  return {
    contracts,
    declarations,
    refunds,
    products,
  };
}

function productKey(name, hsCode) {
  return `${name || ''}::${hsCode || ''}`;
}

function buildPlan(options, state, mappingRows, extractRows, itemRows) {
  const contractsByNo = new Map(state.contracts.map((item) => [item.contractNo, item]));
  const declarationsByNo = new Map(state.declarations.map((item) => [item.declarationNo, item]));
  const refundsByDeclarationId = new Map(state.refunds.map((item) => [item.customsDeclarationId, item]));
  const productsByNameAndHs = new Map(
    state.products
      .filter((item) => item.customsName && item.hsCode)
      .map((item) => [productKey(item.customsName, item.hsCode), item]),
  );
  const productsByName = new Map(state.products.map((item) => [item.customsName, item]));
  const evidenceByDeclaration = buildEvidenceByDeclaration(extractRows);
  const itemsByDeclaration = new Map();
  const seenDeclarationItemKeys = new Set();
  for (const row of itemRows) {
    const itemKey = [
      row.declaration_no,
      row.item_no_number,
      row.hs_code,
      row.customs_name,
      row.quantity_number,
      row.unit_price_number,
      row.total_price_number,
    ].join('|');
    if (seenDeclarationItemKeys.has(itemKey)) {
      continue;
    }
    seenDeclarationItemKeys.add(itemKey);
    if (!itemsByDeclaration.has(row.declaration_no)) {
      itemsByDeclaration.set(row.declaration_no, []);
    }
    itemsByDeclaration.get(row.declaration_no).push(row);
  }

  const productCreates = [];
  const productUpdates = [];
  const virtualProducts = new Map();
  const customsCreates = [];
  const customsUpdates = [];
  const customsItemCreates = [];
  const customsItemUpdates = [];
  const taxRefundCreates = [];
  const taxRefundUpdates = [];
  const skipped = [];
  const processedDeclarationHeaders = new Set();
  const processedItemAndRefundDeclarations = new Set();
  const processedRefundDeclarations = new Set();
  const processedCustomsItemElementUpdates = new Set();

  const declarationElementRows = itemRows
    .filter((row) => hasUsableDeclarationElements(row) && scoreDeclarationElementEvidence(row) > 0)
    .sort((left, right) => scoreDeclarationElementEvidence(right) - scoreDeclarationElementEvidence(left));

  for (const itemRow of declarationElementRows) {
    const sourceKind = declarationElementSourceKind(itemRow);
    const declaration = declarationsByNo.get(itemRow.declaration_no);
    if (!declaration) {
      skipped.push({
        type: `${sourceKind}_missing_declaration`,
        source: itemRow.relative_path,
        declarationNo: itemRow.declaration_no,
      });
      continue;
    }
    const candidates = (declaration.items || []).filter((item) => (
      item.itemNo === itemRow.item_no_number
      && compactName(item.customsName) === compactName(itemRow.customs_name)
    ));
    if (candidates.length !== 1) {
      skipped.push({
        type: `${sourceKind}_item_not_unique`,
        source: itemRow.relative_path,
        declarationNo: itemRow.declaration_no,
        itemNo: itemRow.item_no_number,
        customsName: itemRow.customs_name,
        candidateCount: candidates.length,
      });
      continue;
    }
    const target = candidates[0];
    if (target.hsCode && itemRow.hs_code && target.hsCode !== itemRow.hs_code) {
      skipped.push({
        type: `${sourceKind}_hs_code_mismatch`,
        source: itemRow.relative_path,
        declarationNo: itemRow.declaration_no,
        itemNo: itemRow.item_no_number,
        customsName: itemRow.customs_name,
        dbHsCode: target.hsCode,
        sourceHsCode: itemRow.hs_code,
      });
      continue;
    }
    if (target.declarationElements) {
      continue;
    }
    if (processedCustomsItemElementUpdates.has(target.id)) {
      continue;
    }
    processedCustomsItemElementUpdates.add(target.id);
    customsItemUpdates.push({
      customsDeclarationItemId: target.id,
      declarationNo: itemRow.declaration_no,
      itemNo: itemRow.item_no_number,
      customsName: itemRow.customs_name,
      source: itemRow.relative_path,
      data: {
        declarationElements: itemRow.declaration_elements,
      },
    });
  }

  function resolveProduct(itemRow) {
    const exact = productsByNameAndHs.get(productKey(itemRow.customs_name, itemRow.hs_code));
    if (exact) return exact;

    const sameName = productsByName.get(itemRow.customs_name);
    if (sameName && !sameName.hsCode) {
      if (!productUpdates.some((item) => item.productId === sameName.id)) {
        const data = { hsCode: itemRow.hs_code };
        if (!sameName.unit && itemRow.unit) data.unit = itemRow.unit;
        productUpdates.push({
          productId: sameName.id,
          productName: sameName.customsName,
          data,
          source: itemRow.relative_path,
        });
      }
      productsByNameAndHs.set(productKey(itemRow.customs_name, itemRow.hs_code), {
        ...sameName,
        hsCode: itemRow.hs_code,
      });
      return sameName;
    }

    const key = productKey(itemRow.customs_name, itemRow.hs_code);
    if (virtualProducts.has(key)) return virtualProducts.get(key);

    const virtual = {
      id: `__new_product__:${key}`,
      customsName: itemRow.customs_name,
      hsCode: itemRow.hs_code,
    };
    virtualProducts.set(key, virtual);
    productCreates.push({
      productName: itemRow.customs_name,
      hsCode: itemRow.hs_code,
      data: {
        customsName: itemRow.customs_name,
        hsCode: itemRow.hs_code,
        unit: itemRow.unit,
        isActive: true,
      },
      source: itemRow.relative_path,
    });
    return virtual;
  }

  function buildRefundData({ declarationNo, contract, existing, row, declarationItems }) {
    const itemTotalAmount = declarationItems.reduce((sum, item) => sum + (item.total_price_number || 0), 0);
    const declaredAmount = itemTotalAmount > 0 ? itemTotalAmount : Number(existing?.totalAmount || 0);
    const detail = declarationItems.length > 0
      ? `退税联明细 ${declarationItems.length} 条；需人工核对可退税额`
      : '退税用途确认发票明细；无报关商品明细，需人工核对可退税额';
    return {
      refundNo: `TX${declarationNo}`,
      salesContractId: contract.id,
      customsDeclarationId: existing.id,
      declaredAmount,
      refundableAmount: 0,
      refundedAmount: 0,
      status: 'DRAFT',
      match_status: 'pending',
      note: sourceNote(row.relative_path, detail),
    };
  }

  for (const row of mappingRows) {
    if (['create_tax_refund_draft', 'update_existing_tax_refund'].includes(row.mapping_action)) {
      const declarationNo = cleanText(row.declaration_no);
      const contractNo = cleanText(row.matched_contract_no);
      const contract = contractsByNo.get(contractNo);
      const existing = declarationsByNo.get(declarationNo);
      if (!declarationNo || !contract || !existing) {
        skipped.push({
          type: 'missing_tax_refund_declaration_or_contract',
          source: row.relative_path,
          declarationNo,
          contractNo,
        });
        continue;
      }
      if (processedRefundDeclarations.has(declarationNo)) {
        skipped.push({
          type: 'duplicate_tax_refund_source',
          source: row.relative_path,
          declarationNo,
          contractNo,
        });
        continue;
      }
      processedRefundDeclarations.add(declarationNo);
      const existingRefund = refundsByDeclarationId.get(existing.id);
      const declarationItems = (itemsByDeclaration.get(declarationNo) || [])
        .filter((item) => item.category === 'export_tax_refund');
      const refundData = buildRefundData({ declarationNo, contract, existing, row, declarationItems });
      if (!existingRefund) {
        taxRefundCreates.push({
          declarationNo,
          contractNo,
          source: row.relative_path,
          data: refundData,
        });
      } else {
        const patch = {};
        if (Number(existingRefund.declaredAmount || 0) === 0 && Number(refundData.declaredAmount || 0) > 0) {
          patch.declaredAmount = refundData.declaredAmount;
        }
        if (!sourceAlreadyRecorded(existingRefund.note, row.relative_path)) {
          patch.note = [existingRefund.note, refundData.note].filter(Boolean).join(' | ');
        }
        if (Object.keys(patch).length > 0) {
          taxRefundUpdates.push({
            taxRefundId: existingRefund.id,
            declarationNo,
            contractNo,
            source: row.relative_path,
            data: patch,
          });
        }
      }
      continue;
    }

    if (row.mapping_action === 'map_shipment_list_declaration_elements') {
      continue;
    }

    if (!['create_customs_declaration_draft', 'needs_customs_declaration_first'].includes(row.mapping_action)) {
      skipped.push({
        type: 'mapping_action_not_importable',
        action: row.mapping_action,
        source: row.relative_path,
        issues: row.mapping_issues,
      });
      continue;
    }

    const declarationNo = cleanText(row.declaration_no);
    const contractNo = cleanText(row.matched_contract_no);
    const contract = contractsByNo.get(contractNo);
    if (!declarationNo || !contract) {
      skipped.push({
        type: 'missing_declaration_or_contract',
        source: row.relative_path,
        declarationNo,
        contractNo,
      });
      continue;
    }

    if (processedDeclarationHeaders.has(declarationNo)) {
      skipped.push({
        type: 'duplicate_declaration_source',
        source: row.relative_path,
        declarationNo,
        contractNo,
      });
      continue;
    }
    processedDeclarationHeaders.add(declarationNo);

    const evidenceRows = evidenceByDeclaration.get(declarationNo) || [];
    const header = chooseBestHeaderEvidence(evidenceRows);
    const declarationItems = itemsByDeclaration.get(declarationNo) || [];
    const totalAmount = declarationItems.reduce((sum, item) => sum + (item.total_price_number || 0), 0);
    const totalQuantity = declarationItems.reduce((sum, item) => sum + (item.quantity_number || 0), 0);
    const data = {
      salesContractId: contract.id,
      declaredAt: dateOrNull(header?.declared_at),
      exportDate: dateOrNull(header?.export_date),
      customsBroker: '捷淞',
      currency: 'USD',
      totalAmount,
      totalQuantity,
      totalNetWeight: numberOrNull(header?.net_weight) || 0,
      totalGrossWeight: numberOrNull(header?.gross_weight) || 0,
      status: 'DRAFT',
      note: sourceNote(row.relative_path, `合同 ${contractNo}`),
    };

    const existing = declarationsByNo.get(declarationNo);
    if (!existing) {
      if (row.mapping_action === 'create_customs_declaration_draft') {
        customsCreates.push({
          declarationNo,
          contractNo,
          source: row.relative_path,
          data: {
            declarationNo,
            ...data,
          },
        });
      }
    } else {
      const patch = {};
      for (const field of ['declaredAt', 'exportDate', 'customsBroker']) {
        if (!existing[field] && data[field]) patch[field] = data[field];
      }
      for (const field of ['totalAmount', 'totalQuantity', 'totalNetWeight', 'totalGrossWeight']) {
        if (Number(existing[field] || 0) === 0 && Number(data[field] || 0) !== 0) {
          patch[field] = data[field];
        }
      }
      if (!sourceAlreadyRecorded(existing.note, row.relative_path)) {
        patch.note = [existing.note, data.note].filter(Boolean).join(' | ');
      }
      if (Object.keys(patch).length > 0) {
        customsUpdates.push({
          declarationId: existing.id,
          declarationNo,
          contractNo,
          source: row.relative_path,
          data: patch,
        });
      }
    }

    const declarationHasItems = existing?.items?.length > 0;
    const shouldProcessItemsAndRefund = !processedItemAndRefundDeclarations.has(declarationNo);
    if (shouldProcessItemsAndRefund) {
      processedItemAndRefundDeclarations.add(declarationNo);
    }
    if (shouldProcessItemsAndRefund && !declarationHasItems) {
      for (const item of declarationItems) {
        const product = resolveProduct(item);
        customsItemCreates.push({
          declarationNo,
          contractNo,
          source: item.relative_path,
          data: {
            customsDeclarationId: existing?.id || `__new_declaration__:${declarationNo}`,
            productId: product.id,
            itemNo: item.item_no_number,
            customsName: item.customs_name,
            hsCode: item.hs_code,
            quantity: item.quantity_number || 0,
            unit: item.unit,
            unitPrice: item.unit_price_number,
            totalPrice: item.total_price_number,
          },
        });
      }
    }

    const existingRefund = existing ? refundsByDeclarationId.get(existing.id) : null;
    const refundEvidenceItems = declarationItems.filter((item) => item.category === 'export_tax_refund');
    if (
      shouldProcessItemsAndRefund
      && refundEvidenceItems.length > 0
      && !processedRefundDeclarations.has(declarationNo)
    ) {
      processedRefundDeclarations.add(declarationNo);
      const refundData = {
        refundNo: `TX${declarationNo}`,
        salesContractId: contract.id,
        customsDeclarationId: existing?.id || `__new_declaration__:${declarationNo}`,
        declaredAmount: totalAmount,
        refundableAmount: 0,
        refundedAmount: 0,
        status: 'DRAFT',
        match_status: 'pending',
        note: sourceNote(
          refundEvidenceItems[0].relative_path,
          `退税联明细 ${refundEvidenceItems.length} 条；需人工核对可退税额`,
        ),
      };
      if (!existingRefund) {
        taxRefundCreates.push({
          declarationNo,
          contractNo,
          source: refundEvidenceItems[0].relative_path,
          data: refundData,
        });
      } else {
        const patch = {};
        if (Number(existingRefund.declaredAmount || 0) === 0 && totalAmount > 0) {
          patch.declaredAmount = totalAmount;
        }
        if (!sourceAlreadyRecorded(existingRefund.note, refundEvidenceItems[0].relative_path)) {
          patch.note = [existingRefund.note, refundData.note].filter(Boolean).join(' | ');
        }
        if (Object.keys(patch).length > 0) {
          taxRefundUpdates.push({
            taxRefundId: existingRefund.id,
            declarationNo,
            contractNo,
            source: refundEvidenceItems[0].relative_path,
            data: patch,
          });
        }
      }
    }
  }

  return {
    options,
    summary: {
      dryRun: !options.apply,
      productCreates: productCreates.length,
      productUpdates: productUpdates.length,
      customsCreates: customsCreates.length,
      customsUpdates: customsUpdates.length,
      customsItemCreates: customsItemCreates.length,
      customsItemUpdates: customsItemUpdates.length,
      taxRefundCreates: taxRefundCreates.length,
      taxRefundUpdates: taxRefundUpdates.length,
      skipped: skipped.length,
    },
    operations: {
      productCreates,
      productUpdates,
      customsCreates,
      customsUpdates,
      customsItemCreates,
      customsItemUpdates,
      taxRefundCreates,
      taxRefundUpdates,
    },
    skipped,
  };
}

async function resolveCreatedProducts(tx, productCreates) {
  const map = new Map();
  for (const item of productCreates) {
    const product = await tx.product.create({ data: item.data });
    map.set(`__new_product__:${productKey(item.productName, item.hsCode)}`, product.id);
  }
  return map;
}

function replaceProductId(data, productIdMap) {
  const next = { ...data };
  if (productIdMap.has(next.productId)) {
    next.productId = productIdMap.get(next.productId);
  }
  return next;
}

function replaceDeclarationId(data, declarationIdMap) {
  const next = { ...data };
  if (declarationIdMap.has(next.customsDeclarationId)) {
    next.customsDeclarationId = declarationIdMap.get(next.customsDeclarationId);
  }
  return next;
}

async function applyPlan(plan) {
  if (!plan.options.apply) return;

  await prisma.$transaction(async (tx) => {
    const productIdMap = await resolveCreatedProducts(tx, plan.operations.productCreates);
    for (const update of plan.operations.productUpdates) {
      await tx.product.update({ where: { id: update.productId }, data: update.data });
    }

    const declarationIdMap = new Map();
    for (const create of plan.operations.customsCreates) {
      const declaration = await tx.customsDeclaration.create({ data: create.data });
      declarationIdMap.set(`__new_declaration__:${create.declarationNo}`, declaration.id);
    }
    for (const update of plan.operations.customsUpdates) {
      await tx.customsDeclaration.update({ where: { id: update.declarationId }, data: update.data });
    }
    for (const item of plan.operations.customsItemCreates) {
      await tx.customsDeclarationItem.create({
        data: replaceProductId(replaceDeclarationId(item.data, declarationIdMap), productIdMap),
      });
    }
    for (const update of plan.operations.customsItemUpdates) {
      await tx.customsDeclarationItem.update({ where: { id: update.customsDeclarationItemId }, data: update.data });
    }
    for (const create of plan.operations.taxRefundCreates) {
      await tx.taxRefund.create({
        data: replaceDeclarationId(create.data, declarationIdMap),
      });
    }
    for (const update of plan.operations.taxRefundUpdates) {
      await tx.taxRefund.update({ where: { id: update.taxRefundId }, data: update.data });
    }
  }, { timeout: 60000 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const mappingRows = readCsv(path.join(options.parsedDir, 'evidence_db_mapping.csv'));
  const extractRows = readCsv(path.join(options.parsedDir, 'evidence_extracts.csv'));
  const itemRows = normalizeItemRows(readCsv(path.join(options.parsedDir, 'evidence_items.csv')));
  const state = await loadDbState();
  const plan = buildPlan(options, state, mappingRows, extractRows, itemRows);
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
