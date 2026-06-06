/**
 * Input: tmp/wps_11_export_list_raw/parsed/*.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/import_plan.json + invoice_summary_audit.json; optional Prisma writes when --apply is passed
 * Pos: WPS 出货源文件幂等导入脚本；默认 dry-run，只生成变更计划；报关/退税写入前先审计发票汇总污染；多门店混合名称仅在源文件给出现有真实港口时自动建组合门店，`混合港口` 不建；若组合门店已存在且无精确装箱行，则把源装箱行作为独立来源行保留；装箱来源 note 已挂到不同门店且无报关引用时，可移除错挂来源并按源门店新增/匹配装箱行；销售行不从多门店装箱商品的文件路径猜单一门店；装箱行按同源同商品同数量同规格唯一命中、数量唯一命中或同源同商品残余唯一配对时可回填销售门店；销售总数量等于同商品同规格多门店装箱数量之和时，可按装箱数量拆分销售行并沿用源单价；同一销售行已有不同装箱门店标记时不再自动改门店；同质多门店销售行只补现有门店行价格
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
const SOURCE_NOTE_PREFIX = '[WPS_SOURCE]';

function parseArgs(argv) {
  const options = {
    parsedDir: DEFAULT_PARSED_DIR,
    out: null,
    apply: false,
    allowMismatches: false,
    mergePacking: false,
    mergeSales: false,
    mergeCustoms: false,
    mergeTaxRefunds: false,
    replacePacking: false,
    replaceSales: false,
    updateProducts: true,
    updateContractAggregates: false,
    createMissingContracts: false,
    allowLinkedPackingReplace: false,
    inferSalesStoreFromSourcePath: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--parsed-dir') {
      options.parsedDir = path.resolve(argv[++i]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++i]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--allow-mismatches') {
      options.allowMismatches = true;
    } else if (arg === '--merge-packing') {
      options.mergePacking = true;
    } else if (arg === '--merge-sales') {
      options.mergeSales = true;
    } else if (arg === '--merge-customs') {
      options.mergeCustoms = true;
    } else if (arg === '--merge-tax-refunds') {
      options.mergeTaxRefunds = true;
    } else if (arg === '--replace-packing') {
      options.replacePacking = true;
    } else if (arg === '--replace-sales') {
      options.replaceSales = true;
    } else if (arg === '--update-contract-aggregates') {
      options.updateContractAggregates = true;
    } else if (arg === '--create-missing-contracts') {
      options.createMissingContracts = true;
    } else if (arg === '--allow-linked-packing-replace') {
      options.allowLinkedPackingReplace = true;
    } else if (arg === '--infer-sales-store-from-source-path') {
      options.inferSalesStoreFromSourcePath = true;
    } else if (arg === '--no-product-updates') {
      options.updateProducts = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }

  options.out = options.out || path.join(options.parsedDir, 'import_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/import_wps_export_sources.js [options]

Options:
  --parsed-dir <dir>              解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>                    输出 import plan JSON
  --apply                         执行写库；不传则只 dry-run
  --allow-mismatches              允许导入文件名/内容合同号不一致的源文件
  --merge-packing                 写库时保留现有装箱行，只补空字段并新增缺失行
  --merge-sales                   写库时保留现有销售行，只补空字段并新增缺失行
  --merge-customs                 写库时按发票汇总合并报关单和报关明细
  --merge-tax-refunds             写库时按发票汇总创建/补齐退税草稿
  --create-missing-contracts      按 contracts.csv 中的源文件证据创建数据库缺失的 EXP 合同头
  --replace-packing               写库时用源文件候选装箱行替换对应合同现有装箱行
  --replace-sales                 写库时用源文件候选销售行替换对应合同现有销售行
  --update-contract-aggregates    写库时用源文件候选装箱汇总更新合同箱数/重量/体积
  --allow-linked-packing-replace  危险开关：允许替换已被报关明细引用的装箱行
  --infer-sales-store-from-source-path
                                  销售行缺门店时，从合同聚合门店或源文件路径中唯一匹配现有门店名
  --no-product-updates            不补产品 HS 编码/申报要素
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

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\u3000/g, ' ').trim();
  if (!text || text.toLowerCase() === 'nan' || text === '#N/A' || text === '#VALUE!') return null;
  return text;
}

function hasMixedStoreMarker(value) {
  const text = cleanText(value) || '';
  return /[、，,；;]/.test(text);
}

function numberOrNull(value) {
  const text = cleanText(value);
  if (text == null) return null;
  const number = Number(String(text).replace(/,/g, '').replace(/[$¥￥]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function looksNumeric(value) {
  if (value == null || value === '') return false;
  return numberOrNull(value) != null;
}

function intOrNull(value) {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

function dateOrNull(value) {
  const text = cleanText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  if (Number.isNaN(timestamp)) return null;
  return new Date(timestamp);
}

function parseListText(value) {
  const text = cleanText(value);
  if (!text || text === '[]') return [];
  const quoted = [...text.matchAll(/'([^']*)'/g)].map((match) => cleanText(match[1])).filter(Boolean);
  if (quoted.length > 0) return quoted;
  return text.split(/[;,]/).map((item) => cleanText(item)).filter(Boolean);
}

function singleValue(values) {
  const unique = uniq(values);
  return unique.length === 1 ? unique[0] : null;
}

function sourceKey(row) {
  return `${row.source_file}#${row.sheet}:${row.row}`;
}

function sourceNote(row) {
  return `${SOURCE_NOTE_PREFIX} ${sourceKey(row)}`;
}

function sourceContractNote(row) {
  const sourceFiles = parseListText(row.source_files);
  return `${SOURCE_NOTE_PREFIX} ${sourceFiles.join('; ') || row.contract_no}`;
}

function isOwnedByJiesong(row) {
  const note = row.note_text || '';
  const broker = row.customs_broker || '';
  return !(
    note.includes('非捷淞报关')
    || note.includes('拼船')
    || note.includes('他方自行报关')
    || note.includes('共用发票')
    || broker === '埋单'
    || broker === '不报关'
  );
}

function deriveSourceParty(row) {
  if (isOwnedByJiesong(row)) return null;
  return row.manufacturer || row.purchase_contract_no || row.customs_broker || '第三方拼柜';
}

function indexBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    map.set(keyFn(item), item);
  }
  return map;
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

function dedupeRows(rows, keyFn) {
  const seen = new Set();
  const result = [];
  for (const row of rows) {
    const key = keyFn(row);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(row);
  }
  return result;
}

function canonicalName(value) {
  return String(value || '').trim().toLowerCase();
}

function uniq(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function buildExcludedSources(parsedDir, allowMismatches) {
  if (allowMismatches) return new Set();
  const mismatches = readJson(path.join(parsedDir, 'workbook_mismatches.json'), []);
  return new Set(mismatches
    .filter((item) => item.decision !== '按工作簿内容中的合同号归集')
    .map((item) => item.source_file));
}

function normalizeRows(rows, excludedSources) {
  return rows
    .filter((row) => !excludedSources.has(row.source_file))
    .map((row) => ({
      ...row,
      contract_no: cleanText(row.contract_no),
      product_name: cleanText(row.product_name),
      hs_code: cleanText(row.hs_code),
      supplement: cleanText(row.supplement),
      store: cleanText(row.store),
      port: cleanText(row.port),
      unit: cleanText(row.unit),
      manufacturer: cleanText(row.manufacturer),
      specification: cleanText(row.specification),
      container_label: cleanText(row.container_label),
      shipped_at_text: cleanText(row.shipped_at),
      customs_broker: cleanText(row.customs_broker),
      purchase_contract_no: cleanText(row.purchase_contract_no),
      invoice_no: cleanText(row.invoice_no),
      note_text: cleanText(row.note),
      quantity_number: numberOrNull(row.quantity),
      boxes_number: intOrNull(row.boxes),
      gross_weight_number: numberOrNull(row.gross_weight),
      net_weight_number: numberOrNull(row.net_weight),
      volume_number: numberOrNull(row.volume),
      purchase_cost_number: numberOrNull(row.purchase_cost),
      unit_price_number: numberOrNull(row.unit_price),
      total_price_number: numberOrNull(row.total_price),
    }))
    .filter((row) => row.contract_no && row.product_name)
    .filter((row) => (
      numericPresent(row.quantity_number)
      || numericPresent(row.boxes_number)
      || numericPresent(row.gross_weight_number)
      || numericPresent(row.net_weight_number)
      || numericPresent(row.volume_number)
    ));
}

function normalizeSalesRows(rows, excludedSources) {
  return rows
    .filter((row) => !excludedSources.has(row.source_file))
    .map((row) => ({
      ...row,
      contract_no: cleanText(row.contract_no),
      product_name: cleanText(row.product_name),
      specification: cleanText(row.specification),
      unit: looksNumeric(row.unit) ? null : cleanText(row.unit),
      quantity_number: numberOrNull(row.quantity),
      unit_price_number: numberOrNull(row.unit_price),
      total_price_number: numberOrNull(row.total_price),
    }))
    .filter((row) => row.contract_no && row.product_name);
}

function normalizeInvoiceRows(rows, excludedSources) {
  return rows
    .filter((row) => !excludedSources.has(row.source_file))
    .map((row) => ({
      ...row,
      contract_no: cleanText(row.contract_no),
      product_name: cleanText(row.product_name),
      unit: looksNumeric(row.unit) ? null : cleanText(row.unit),
      declaration_no: cleanText(row.declaration_no),
      invoice_no: cleanText(row.invoice_no),
      invoice_date_text: cleanText(row.invoice_date),
      taxpayer_no: cleanText(row.taxpayer_no),
      quantity_number: numberOrNull(row.quantity),
      unit_price_without_tax_number: numberOrNull(row.unit_price_without_tax),
      amount_without_tax_number: numberOrNull(row.amount_without_tax),
      tax_rate_text: cleanText(row.tax_rate),
      tax_rate_number: numberOrNull(row.tax_rate),
      tax_amount_number: numberOrNull(row.tax_amount),
      amount_with_tax_number: numberOrNull(row.amount_with_tax),
    }))
    .filter((row) => row.contract_no && row.product_name && row.declaration_no && row.invoice_no);
}

function normalizeContractRows(rows) {
  return rows
    .map((row) => ({
      ...row,
      contract_no: cleanText(row.contract_no),
      signed_at_date: dateOrNull(row.signed_at),
      shipped_at_date: dateOrNull(row.shipped_at),
      port: cleanText(row.port),
      customs_broker: cleanText(row.customs_broker),
      store_names: parseListText(row.stores),
      container_label: singleValue(parseListText(row.container_labels)),
      total_amount_number: numberOrNull(row.total_usd) || 0,
      total_boxes_number: intOrNull(row.total_boxes) || 0,
      gross_weight_number: numberOrNull(row.gross_weight) || 0,
      net_weight_number: numberOrNull(row.net_weight) || 0,
      volume_number: numberOrNull(row.volume) || 0,
    }))
    .filter((row) => row.contract_no);
}

function numbersEqual(left, right, tolerance = 0.001) {
  if (left == null || right == null) return false;
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function quantityKey(value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return Number(value).toFixed(6);
}

function sameNormalizedText(left, right) {
  const leftText = cleanText(left);
  const rightText = cleanText(right);
  if (!leftText || !rightText) return false;
  const normalize = (value) => String(value).replace(/\s+/g, '').toLowerCase();
  return normalize(leftText) === normalize(rightText);
}

function numericPresent(value) {
  return value != null && Number.isFinite(Number(value)) && Number(value) !== 0;
}

function valueMissing(existingValue, sourceValue) {
  if (sourceValue == null || sourceValue === '') return false;
  if (existingValue == null || existingValue === '') return true;
  if (typeof sourceValue === 'number' && Number(existingValue) === 0 && sourceValue !== 0) return true;
  return false;
}

function sourceAlreadyRecordedExact(note, source) {
  return String(note || '').includes(source);
}

function sourceAliases(source) {
  if (String(source || '').includes('#split:')) return [];
  const [sourceFile, location] = String(source || '').split('#');
  if (!sourceFile || !location) return [];
  const baseName = path.basename(sourceFile);
  const stem = baseName.replace(/\.[^.]+$/, '');
  return [
    `${baseName}#${location}`,
    `${stem}#${location}`,
  ];
}

function sourceAlreadyRecorded(note, source) {
  const text = String(note || '');
  if (text.includes(source)) return true;
  return sourceAliases(source).some((alias) => text.includes(alias));
}

function sourceFileAlreadyRecorded(note, sourceFile) {
  const text = String(note || '');
  if (!sourceFile) return false;
  const baseName = path.basename(sourceFile);
  const stem = baseName.replace(/\.[^.]+$/, '');
  return text.includes(sourceFile) || text.includes(baseName) || text.includes(stem);
}

function removeSourceReferencesFromNote(note, source) {
  let text = String(note || '');
  const refs = [source, ...sourceAliases(source)];
  for (const ref of refs) {
    text = text.split(`${SOURCE_NOTE_PREFIX} ${ref}`).join('');
  }
  return text.split('|').map((part) => cleanText(part)).filter(Boolean).join(' | ');
}

function extractPackingStoreMarkers(note) {
  return [...String(note || '').matchAll(
    /\[WPS_PACKING_(SPEC_QUANTITY|QUANTITY(?:_CONSENSUS|_ALIAS)?|RESIDUAL_PRODUCT)_STORE\]\s+([^\[|]+)/g,
  )].map((match) => ({
    type: match[1],
    storeName: cleanText(match[2]) || '',
  })).filter((item) => item.storeName);
}

function hasConflictingPackingStoreMarker(existingNote, sourceNote) {
  const existingMarkers = extractPackingStoreMarkers(existingNote);
  const sourceMarkers = extractPackingStoreMarkers(sourceNote);
  if (existingMarkers.length === 0 || sourceMarkers.length === 0) return false;
  return sourceMarkers.some((sourceMarker) => (
    existingMarkers.some((existingMarker) => existingMarker.storeName !== sourceMarker.storeName)
  ));
}

function scorePackingMatch(existing, sourceData) {
  if (existing.productId !== sourceData.productId) return -1;

  let score = 2;
  if (numbersEqual(existing.quantity, sourceData.quantity)) score += 20;
  if (existing.unit && sourceData.unit && existing.unit === sourceData.unit) score += 4;
  if (existing.storeId && sourceData.storeId && existing.storeId === sourceData.storeId) score += 4;
  if (!existing.storeId && sourceData.storeId) score += 1;
  if (numbersEqual(existing.boxes, sourceData.boxes)) score += 10;
  if (numbersEqual(existing.grossWeight, sourceData.grossWeight)) score += 10;
  if (numbersEqual(existing.netWeight, sourceData.netWeight)) score += 10;
  if (numbersEqual(existing.volume, sourceData.volume, 0.0001)) score += 10;
  if (existing.invoiceNo && sourceData.invoiceNo && existing.invoiceNo === sourceData.invoiceNo) score += 8;
  if (existing.purchaseContractNo && sourceData.purchaseContractNo && existing.purchaseContractNo === sourceData.purchaseContractNo) score += 8;

  return score;
}

function buildPackingUpdateData(existing, sourceData, source) {
  const update = {};
  const fillIfMissing = (field) => {
    if (valueMissing(existing[field], sourceData[field])) {
      update[field] = sourceData[field];
    }
  };

  fillIfMissing('storeId');
  fillIfMissing('unit');
  fillIfMissing('boxes');
  fillIfMissing('grossWeight');
  fillIfMissing('netWeight');
  fillIfMissing('volume');
  fillIfMissing('unitPrice');
  fillIfMissing('totalPrice');
  fillIfMissing('supplement');
  fillIfMissing('specification');
  fillIfMissing('manufacturer');
  fillIfMissing('invoiceNo');
  fillIfMissing('purchaseContractNo');
  fillIfMissing('purchaseCost');

  if (sourceData.isOwnedByJiesong === false && existing.isOwnedByJiesong !== false) {
    update.isOwnedByJiesong = false;
  }
  if (sourceData.sourceParty && !existing.sourceParty) {
    update.sourceParty = sourceData.sourceParty;
  }

  if (!sourceAlreadyRecordedExact(existing.note, source)) {
    update.note = [existing.note, sourceData.note].filter(Boolean).join(' | ');
  }

  return update;
}

function findUniquePackingMatch(existingItems, usedIds, sourceData) {
  const candidates = existingItems
    .filter((item) => !usedIds.has(item.id))
    .map((item) => ({ item, score: scorePackingMatch(item, sourceData) }))
    .filter((candidate) => candidate.score >= 12)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    const topScore = candidates[0].score;
    return { ambiguous: true, candidates: candidates.filter((candidate) => candidate.score === topScore) };
  }
  return candidates[0];
}

function shouldCreateSourcePackingForAmbiguousMatch(match, sourceData) {
  if (!match?.ambiguous || !sourceData.storeId) return false;
  if (String(sourceData.storeId).startsWith('__new_store__:')) return false;
  return match.candidates.every((candidate) => candidate.item.storeId !== sourceData.storeId);
}

function shouldCreateSourcePackingForAmbiguousSourceRow(match, row) {
  if (!match?.ambiguous || !row.data.storeId) return false;
  if (String(row.data.storeId).startsWith('__new_store__:') && !hasMixedStoreMarker(row.sourceStoreName)) {
    return false;
  }
  return match.candidates.every((candidate) => candidate.item.storeId !== row.data.storeId);
}

function findSourceRecordedPackingMatch(existingItems, source) {
  const matches = existingItems.filter((item) => sourceAlreadyRecorded(item.note, source));
  if (matches.length === 0) return null;
  if (matches.length > 1) return null;
  return { item: matches[0], score: 100 };
}

function buildPackingMergeForContract({ contractNo, contractId, existing, sourceRows, linkedPackingItemIds = new Set() }) {
  const usedIds = new Set();
  const updates = [];
  const creates = [];
  const unmatched = [];

  for (const row of sourceRows) {
    const recordedMatch = findSourceRecordedPackingMatch(existing, row.source);
    if (recordedMatch) {
      const sourceStoreConflicts = (
        row.data.storeId
        && recordedMatch.item.storeId
        && row.data.storeId !== recordedMatch.item.storeId
      );
      if (sourceStoreConflicts) {
        if (linkedPackingItemIds.has(recordedMatch.item.id)) {
          unmatched.push({
            source: row.source,
            reason: 'source_recorded_store_conflict_linked',
            candidates: [{
              packingItemId: recordedMatch.item.id,
              score: recordedMatch.score,
            }],
          });
          continue;
        }

        const note = removeSourceReferencesFromNote(recordedMatch.item.note, row.source);
        if (note !== String(recordedMatch.item.note || '')) {
          updates.push({
            packingItemId: recordedMatch.item.id,
            source: row.source,
            score: recordedMatch.score,
            reason: 'remove_conflicting_source_note',
            data: { note },
          });
        }

        const alternateExisting = existing.filter((item) => item.id !== recordedMatch.item.id);
        const alternateMatch = findUniquePackingMatch(alternateExisting, usedIds, row.data);
        if (!alternateMatch) {
          creates.push({
            ...row,
            reason: 'source_recorded_store_conflict_reassigned',
            previousPackingItemId: recordedMatch.item.id,
          });
          continue;
        }
        if (alternateMatch.ambiguous) {
          unmatched.push({
            source: row.source,
            reason: 'source_recorded_store_conflict_ambiguous_reassignment',
            candidates: alternateMatch.candidates.map((candidate) => ({
              packingItemId: candidate.item.id,
              score: candidate.score,
            })),
          });
          continue;
        }

        usedIds.add(alternateMatch.item.id);
        const alternateData = buildPackingUpdateData(alternateMatch.item, row.data, row.source);
        if (Object.keys(alternateData).length > 0) {
          updates.push({
            packingItemId: alternateMatch.item.id,
            source: row.source,
            score: alternateMatch.score,
            data: alternateData,
          });
        }
        continue;
      }
      const data = buildPackingUpdateData(recordedMatch.item, row.data, row.source);
      if (Object.keys(data).length > 0) {
        updates.push({
          packingItemId: recordedMatch.item.id,
          source: row.source,
          score: recordedMatch.score,
          data,
        });
      }
      continue;
    }

    const match = findUniquePackingMatch(existing, usedIds, row.data);
    if (!match) {
      creates.push(row);
      continue;
    }
    if (match.ambiguous) {
      if (shouldCreateSourcePackingForAmbiguousSourceRow(match, row)) {
        creates.push({
          ...row,
          reason: 'source_store_has_no_exact_existing_packing_match',
          candidates: match.candidates.map((candidate) => ({
            packingItemId: candidate.item.id,
            score: candidate.score,
          })),
        });
        continue;
      }
      unmatched.push({
        source: row.source,
        reason: 'ambiguous_existing_match',
        candidates: match.candidates.map((candidate) => ({
          packingItemId: candidate.item.id,
          score: candidate.score,
        })),
      });
      continue;
    }

    usedIds.add(match.item.id);
    const data = buildPackingUpdateData(match.item, row.data, row.source);
    if (Object.keys(data).length > 0) {
      updates.push({
        packingItemId: match.item.id,
        source: row.source,
        score: match.score,
        data,
      });
    }
  }

  return {
    contractNo,
    contractId,
    existingCount: existing.length,
    sourceCount: sourceRows.length,
    updates,
    creates,
    unmatched,
  };
}

function scoreSalesMatch(existing, sourceData) {
  if (existing.productId !== sourceData.productId) return -1;
  if (existing.storeId !== sourceData.storeId) return -1;

  let score = 10;
  if (numbersEqual(existing.quantity, sourceData.quantity)) score += 20;
  if (existing.unit && sourceData.unit && existing.unit === sourceData.unit) score += 4;
  if (existing.specification && sourceData.specification && existing.specification === sourceData.specification) score += 4;
  if (numbersEqual(existing.sellingPrice, sourceData.sellingPrice)) score += 8;
  return score;
}

function buildSalesUpdateData(existing, sourceData, source, options = {}) {
  const update = {};
  const packingStoreMarkerConflict = hasConflictingPackingStoreMarker(existing.note, sourceData.note);
  if (valueMissing(existing.unit, sourceData.unit)) update.unit = sourceData.unit;
  if (valueMissing(existing.specification, sourceData.specification)) update.specification = sourceData.specification;
  if (numericPresent(sourceData.sellingPrice) && Number(existing.sellingPrice || 0) === 0) {
    update.sellingPrice = sourceData.sellingPrice;
  }
  if (
    options.sourceRecorded
    && numericPresent(sourceData.sellingPrice)
    && !numbersEqual(existing.sellingPrice, sourceData.sellingPrice)
  ) {
    update.sellingPrice = sourceData.sellingPrice;
  }
  if (
    options.allowStoreCorrection
    && sourceData.storeId
    && existing.storeId
    && existing.storeId !== sourceData.storeId
    && !packingStoreMarkerConflict
  ) {
    update.storeId = sourceData.storeId;
  }
  if (!sourceAlreadyRecorded(existing.note, source)) {
    update.note = [existing.note, sourceData.note].filter(Boolean).join(' | ');
  }
  const inferenceMarker = String(sourceData.note || '')
    .match(/\[WPS_PACKING_(?:SPEC_QUANTITY|QUANTITY(?:_CONSENSUS|_ALIAS)?|RESIDUAL_PRODUCT)_STORE\]\s+[^\[]+/)?.[0]?.trim();
  if (inferenceMarker && !packingStoreMarkerConflict && !String(existing.note || '').includes(inferenceMarker)) {
    update.note = [update.note || existing.note, inferenceMarker].filter(Boolean).join(' | ');
  }
  return update;
}

function findUniqueSalesMatch(existingItems, usedIds, sourceData) {
  const candidates = existingItems
    .filter((item) => !usedIds.has(item.id))
    .map((item) => ({ item, score: scoreSalesMatch(item, sourceData) }))
    .filter((candidate) => candidate.score >= 25)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;
  if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
    return { ambiguous: true, candidates: candidates.slice(0, 3) };
  }
  return candidates[0];
}

function findSourceRecordedSalesMatch(existingItems, source) {
  const matches = existingItems.filter((item) => sourceAlreadyRecorded(item.note, source));
  if (matches.length === 0) return null;
  if (matches.length > 1) return null;
  return { item: matches[0], score: 100 };
}

function buildSalesMergeForContract({ contractNo, contractId, existing, sourceRows }) {
  const usedIds = new Set();
  const updates = [];
  const creates = [];
  const unmatched = [];

  for (const row of sourceRows) {
    const recordedMatch = findSourceRecordedSalesMatch(existing, row.source);
    if (recordedMatch) {
      if (hasConflictingPackingStoreMarker(recordedMatch.item.note, row.data.note)) {
        unmatched.push({
          source: row.source,
          reason: 'conflicting_existing_packing_store_marker',
          candidates: [{
            salesItemId: recordedMatch.item.id,
            score: recordedMatch.score,
            existingNote: recordedMatch.item.note,
            sourceNote: row.data.note,
          }],
        });
        continue;
      }
      const data = buildSalesUpdateData(recordedMatch.item, row.data, row.source, {
        sourceRecorded: true,
        allowStoreCorrection: /\[WPS_PACKING_(SPEC_QUANTITY|QUANTITY(_CONSENSUS|_ALIAS)?|RESIDUAL_PRODUCT)_STORE\]/.test(String(row.data.note || '')),
      });
      if (Object.keys(data).length > 0) {
        updates.push({
          salesItemId: recordedMatch.item.id,
          source: row.source,
          score: recordedMatch.score,
          data,
        });
      }
      continue;
    }

    const match = findUniqueSalesMatch(existing, usedIds, row.data);
    if (!match) {
      creates.push(row);
      continue;
    }
    if (match.ambiguous) {
      unmatched.push({
        source: row.source,
        reason: 'ambiguous_existing_match',
        candidates: match.candidates.map((candidate) => ({
          salesItemId: candidate.item.id,
          score: candidate.score,
        })),
      });
      continue;
    }

    usedIds.add(match.item.id);
    const data = buildSalesUpdateData(match.item, row.data, row.source);
    if (Object.keys(data).length > 0) {
      updates.push({
        salesItemId: match.item.id,
        source: row.source,
        score: match.score,
        data,
      });
    }
  }

  return {
    contractNo,
    contractId,
    existingCount: existing.length,
    sourceCount: sourceRows.length,
    updates,
    creates,
    unmatched,
  };
}

function summarizeCrossContractReuse(rows, field) {
  const grouped = groupBy(rows, (row) => row[field]);
  return [...grouped.entries()]
    .map(([value, valueRows]) => ({
      [field]: value,
      contractCount: uniq(valueRows.map((row) => row.contract_no)).length,
      contracts: uniq(valueRows.map((row) => row.contract_no)).sort(),
      rowCount: valueRows.length,
      sources: uniq(valueRows.map((row) => sourceKey(row))).slice(0, 5),
    }))
    .filter((item) => item.contractCount > 1)
    .sort((left, right) => right.contractCount - left.contractCount || right.rowCount - left.rowCount);
}

function topRepeatedValues(rows, field, limit = 10) {
  const grouped = groupBy(rows, (row) => row[field]);
  return [...grouped.entries()]
    .map(([value, valueRows]) => ({
      [field]: value,
      rowCount: valueRows.length,
      contractCount: uniq(valueRows.map((row) => row.contract_no)).length,
    }))
    .sort((left, right) => right.contractCount - left.contractCount || right.rowCount - left.rowCount)
    .slice(0, limit);
}

function buildInvoiceSummaryAudit(invoiceRows) {
  const declarationNosCrossContract = summarizeCrossContractReuse(invoiceRows, 'declaration_no');
  const invoiceNosCrossContract = summarizeCrossContractReuse(invoiceRows, 'invoice_no');
  const uniqueDeclarationNos = uniq(invoiceRows.map((row) => row.declaration_no));
  const uniqueInvoiceNos = uniq(invoiceRows.map((row) => row.invoice_no));
  const contracts = uniq(invoiceRows.map((row) => row.contract_no));
  const blocksDirectImport = declarationNosCrossContract.length > 0 || invoiceNosCrossContract.length > 0;

  return {
    source: 'invoice_summary_items.csv',
    rowCount: invoiceRows.length,
    contractCount: contracts.length,
    uniqueDeclarationNoCount: uniqueDeclarationNos.length,
    uniqueInvoiceNoCount: uniqueInvoiceNos.length,
    declarationNosCrossContractCount: declarationNosCrossContract.length,
    invoiceNosCrossContractCount: invoiceNosCrossContract.length,
    blocksDirectImport,
    blockedTargets: blocksDirectImport ? ['customs_declarations', 'tax_refunds'] : [],
    reason: blocksDirectImport
      ? '发票汇总中的报关单号或发票号跨多个 EXP 合同重复，疑似模板/旧数据复用；不能作为真实报关/退税数据直接落库。'
      : null,
    declarationNosCrossContract: declarationNosCrossContract.slice(0, 20),
    invoiceNosCrossContract: invoiceNosCrossContract.slice(0, 20),
    topDeclarationNos: topRepeatedValues(invoiceRows, 'declaration_no'),
    topInvoiceNos: topRepeatedValues(invoiceRows, 'invoice_no'),
  };
}

async function loadDbState() {
  const [
    contracts,
    products,
    stores,
    ports,
    packingItems,
    salesItems,
    linkedDeclarationItems,
  ] = await Promise.all([
    prisma.salesContract.findMany(),
    prisma.product.findMany(),
    prisma.store.findMany(),
    prisma.port.findMany(),
    prisma.packingItem.findMany({ include: { product: true, store: true } }),
    prisma.salesItem.findMany({ include: { product: true, store: true } }),
    prisma.customsDeclarationItem.findMany({
      where: { packingItemId: { not: null } },
      select: { packingItemId: true },
    }),
  ]);
  const linkedPackingItemIds = new Set(linkedDeclarationItems.map((item) => item.packingItemId));
  return {
    contracts,
    products,
    stores,
    ports,
    packingItems,
    salesItems,
    linkedPackingItemIds,
  };
}

function buildPlan(options, state, packingRows, salesRows, invoiceRows, contractRows, evidencePackingRows = packingRows) {
  const contractsByNo = indexBy(state.contracts, (item) => item.contractNo);
  const productsByName = indexBy(state.products, (item) => item.customsName);
  const storesByName = indexBy(state.stores, (item) => item.name);
  const storesByCanonicalName = indexBy(state.stores, (item) => canonicalName(item.name));
  const portsByName = indexBy(state.ports, (item) => item.name);
  const existingPackingByContract = groupBy(state.packingItems, (item) => item.salesContractId);
  const existingSalesByContract = groupBy(state.salesItems, (item) => item.salesContractId);
  const packingByContract = groupBy(packingRows, (item) => item.contract_no);
  const evidencePackingByContract = groupBy(evidencePackingRows, (item) => item.contract_no);
  const salesByContract = groupBy(salesRows, (item) => item.contract_no);
  const contractRowsByNo = groupBy(contractRows, (item) => item.contract_no);
  const invoiceSummaryAudit = buildInvoiceSummaryAudit(invoiceRows);
  const ownedByContractProduct = new Map();

  const productCreates = [];
  const productUpdates = new Map();
  const storeCreates = [];
  const contractCreates = [];
  const contractUpdates = [];
  const packingReplacements = [];
  const packingMerges = [];
  const salesReplacements = [];
  const salesMerges = [];
  const skipped = [];
  const warnings = [];
  const salesStoreContractInferences = [];
  const salesStorePathInferences = [];
  const salesStorePackingQuantityInferences = [];
  const salesStoreHomogeneousGroupInferences = [];
  const salesStoreResidualProductInferences = [];
  const salesStoreSplitInferences = [];
  const warningKeys = new Set();

  const virtualProducts = new Map();
  const virtualStores = new Map();

  function lookupStoreByName(storeName) {
    return (
      storesByName.get(storeName)
      || storesByCanonicalName.get(canonicalName(storeName))
      || virtualStores.get(storeName)
      || virtualStores.get(canonicalName(storeName))
      || null
    );
  }

  function enqueueProductUpdate(product, patch) {
    if (Object.keys(patch).length === 0) return;
    const current = productUpdates.get(product.id) || {
      productId: product.id,
      productName: product.customsName,
      data: {},
    };
    current.data = { ...current.data, ...patch };
    productUpdates.set(product.id, current);
  }

  function resolveProduct(row) {
    const existing = productsByName.get(row.product_name) || virtualProducts.get(row.product_name);
    if (existing) {
      if (options.updateProducts && productsByName.has(row.product_name)) {
        const update = {};
        if (!existing.hsCode && row.hs_code) update.hsCode = row.hs_code;
        if (!existing.declaration && row.supplement) update.declaration = row.supplement;
        if (!existing.unit && row.unit) update.unit = row.unit;
        if (!existing.specification && row.specification) update.specification = row.specification;
        enqueueProductUpdate(existing, update);
      }
      return existing;
    }

    const virtual = {
      id: `__new_product__:${row.product_name}`,
      customsName: row.product_name,
      hsCode: row.hs_code,
      declaration: row.supplement,
      unit: row.unit,
      specification: row.specification,
    };
    virtualProducts.set(row.product_name, virtual);
    productCreates.push({
      productName: row.product_name,
      data: {
        customsName: row.product_name,
        hsCode: row.hs_code,
        declaration: row.supplement,
        unit: row.unit,
        specification: row.specification,
        isActive: true,
      },
    });
    return virtual;
  }

  function resolveStore(row) {
    if (!row.store) return null;
    const existing = lookupStoreByName(row.store);
    if (existing) return existing;
    const port = row.port ? portsByName.get(row.port) : null;
    if ((hasMixedStoreMarker(row.store) || String(row.port || '').includes('混合')) && (!port || String(row.port || '').includes('混合'))) {
      const warningKey = `store_without_known_port:${row.store}:${row.port}:${sourceKey(row)}`;
      if (!warningKeys.has(warningKey)) {
        warningKeys.add(warningKey);
        warnings.push({
          type: 'store_without_known_port',
          store: row.store,
          port: row.port,
          source: sourceKey(row),
        });
      }
      return null;
    }
    if (!row.port || !port) {
      const warningKey = `store_without_known_port:${row.store}:${row.port}:${sourceKey(row)}`;
      if (!warningKeys.has(warningKey)) {
        warningKeys.add(warningKey);
        warnings.push({
          type: 'store_without_known_port',
          store: row.store,
          port: row.port,
          source: sourceKey(row),
        });
      }
      return null;
    }
    const virtual = { id: `__new_store__:${row.store}`, name: row.store, portId: port.id };
    virtualStores.set(row.store, virtual);
    virtualStores.set(canonicalName(row.store), virtual);
    storeCreates.push({
      storeName: row.store,
      data: { name: row.store, portId: port.id, isActive: true },
    });
    return virtual;
  }

  function resolveContractCreate(row) {
    if (!options.createMissingContracts || contractsByNo.has(row.contract_no)) return null;
    const port = row.port ? portsByName.get(row.port) : null;
    const virtual = {
      id: `__new_contract__:${row.contract_no}`,
      contractNo: row.contract_no,
      totalAmount: row.total_amount_number,
      totalBoxes: row.total_boxes_number,
      grossWeight: row.gross_weight_number,
      netWeight: row.net_weight_number,
      volume: row.volume_number,
      containerLabel: row.container_label,
      customsBroker: row.customs_broker,
      shippedAt: row.shipped_at_date,
      signedAt: row.signed_at_date,
      portId: port?.id || null,
    };
    contractsByNo.set(row.contract_no, virtual);
    contractCreates.push({
      contractNo: row.contract_no,
      sourceFiles: parseListText(row.source_files),
      data: {
        contractNo: row.contract_no,
        totalAmount: row.total_amount_number,
        receivedAmount: 0,
        exchangeRate: 7.0,
        status: row.shipped_at_date ? 'SHIPPED' : 'DRAFT',
        signedAt: row.signed_at_date,
        portId: port?.id || undefined,
        totalBoxes: row.total_boxes_number,
        grossWeight: row.gross_weight_number,
        netWeight: row.net_weight_number,
        volume: row.volume_number,
        shippedAt: row.shipped_at_date,
        customsBroker: row.customs_broker,
        isFumigated: false,
        containerLabel: row.container_label,
        note: sourceContractNote(row),
      },
    });
    if (row.port && !port) {
      warnings.push({
        type: 'contract_without_known_port',
        contractNo: row.contract_no,
        port: row.port,
      });
    }
    return virtual;
  }

  function inferSalesStoreFromSourcePath(row) {
    if (!options.inferSalesStoreFromSourcePath) return null;
    const source = sourceKey(row);
    const matches = state.stores.filter((store) => store.name && source.includes(store.name));
    const reducedMatches = matches.filter((store) => (
      !matches.some((other) => store.name !== other.name && other.name.includes(store.name))
    ));
    if (reducedMatches.length !== 1) return null;
    const store = reducedMatches[0];
    salesStorePathInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source,
    });
    return store;
  }

  function inferSalesRowsFromPackingQuantitySplit(row, product, contract) {
    if (quantityKey(row.quantity_number) == null || !numericPresent(row.unit_price_number)) return [];
    const candidates = (evidencePackingByContract.get(row.contract_no) || [])
      .filter((packingRow) => (
        packingRow.product_name === row.product_name
        && packingRow.store
        && quantityKey(packingRow.quantity_number) != null
        && (!row.specification || !packingRow.specification || sameNormalizedText(packingRow.specification, row.specification))
      ))
      .map((packingRow) => ({
        row: packingRow,
        store: lookupStoreByName(packingRow.store),
      }))
      .filter((candidate) => candidate.store);
    const storesById = new Map(candidates.map((candidate) => [candidate.store.id, candidate.store]));
    if (storesById.size < 2) return [];
    const totalQuantity = candidates.reduce((sum, candidate) => sum + Number(candidate.row.quantity_number || 0), 0);
    if (!numbersEqual(totalQuantity, row.quantity_number)) return [];

    const source = sourceKey(row);
    salesStoreSplitInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      source,
      sourceQuantity: row.quantity_number,
      splitRows: candidates.map((candidate) => ({
        storeName: candidate.store.name,
        quantity: candidate.row.quantity_number,
        packingSource: sourceKey(candidate.row),
      })),
    });

    return candidates.map((candidate) => {
      const splitSource = `${source}#split:${candidate.store.name}`;
      return {
        source: splitSource,
        data: {
          salesContractId: contract.id,
          productId: product.id,
          storeId: candidate.store.id,
          quantity: candidate.row.quantity_number || 0,
          unit: row.unit,
          costPrice: 0,
          sellingPrice: row.unit_price_number || 0,
          specification: row.specification,
          note: [
            `[WPS_SOURCE] ${splitSource}`,
            `[WPS_SALES_SPLIT_BY_PACKING_QUANTITY] ${candidate.store.name}:${candidate.row.quantity_number} from ${sourceKey(candidate.row)}`,
          ].filter(Boolean).join(' '),
        },
      };
    });
  }

  const contractStoreByContract = new Map();
  for (const [contractNo, rows] of contractRowsByNo.entries()) {
    const stores = uniq(
      rows
        .flatMap((row) => row.store_names || [])
        .map((storeName) => lookupStoreByName(storeName))
        .filter(Boolean),
    );
    if (stores.length === 1) {
      contractStoreByContract.set(contractNo, stores[0]);
    }
  }

function inferSalesStoreFromContract(row) {
    const store = contractStoreByContract.get(row.contract_no);
    if (!store) return null;
    salesStoreContractInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
    });
    return store;
  }

  function packingProductMatchesSales(row, packingRow) {
    if (packingRow.product_name === row.product_name) return { matched: true, scope: 'exact_product' };
    if (
      row.source_file
      && packingRow.source_file === row.source_file
      && row.product_name
      && String(packingRow.note || '').includes(row.product_name)
    ) {
      return { matched: true, scope: 'source_note_product_alias' };
    }
    return { matched: false, scope: null };
  }

  function inferSalesStoreFromSameSourcePackingQuantity(row) {
    const quantity = row.quantity_number;
    if (quantityKey(quantity) == null) return null;
    const candidates = (evidencePackingByContract.get(row.contract_no) || [])
      .map((packingRow) => ({ packingRow, productMatch: packingProductMatchesSales(row, packingRow) }))
      .filter(({ packingRow, productMatch }) => (
        productMatch.matched
        && packingRow.source_file === row.source_file
        && numbersEqual(packingRow.quantity_number, quantity)
        && packingRow.store
        && !hasMixedStoreMarker(packingRow.store)
      ))
      .map(({ packingRow, productMatch }) => ({
        source: sourceKey(packingRow),
        store: lookupStoreByName(packingRow.store),
        productName: packingRow.product_name,
        productMatchScope: productMatch.scope,
      }))
      .filter((candidate) => candidate.store);
    const storesById = new Map(candidates.map((candidate) => [candidate.store.id, candidate.store]));
    if (storesById.size !== 1) return null;
    const store = [...storesById.values()][0];
    const productMatchScopes = uniq(candidates.map((candidate) => candidate.productMatchScope));
    salesStorePackingQuantityInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
      packingSources: candidates.map((candidate) => candidate.source),
      packingProductNames: uniq(candidates.map((candidate) => candidate.productName)),
      productMatchScopes,
    });
    return {
      store,
      scope: productMatchScopes.includes('source_note_product_alias')
        ? 'source_note_product_alias'
        : 'same_source_quantity',
    };
  }

  function inferSalesStoreFromSameSourcePackingSpecQuantity(row) {
    const quantity = row.quantity_number;
    if (quantityKey(quantity) == null || !row.specification) return null;
    const candidates = (evidencePackingByContract.get(row.contract_no) || [])
      .map((packingRow) => ({ packingRow, productMatch: packingProductMatchesSales(row, packingRow) }))
      .filter(({ packingRow, productMatch }) => (
        productMatch.matched
        && packingRow.source_file === row.source_file
        && numbersEqual(packingRow.quantity_number, quantity)
        && sameNormalizedText(packingRow.specification, row.specification)
        && packingRow.store
        && !hasMixedStoreMarker(packingRow.store)
      ))
      .map(({ packingRow, productMatch }) => ({
        source: sourceKey(packingRow),
        store: lookupStoreByName(packingRow.store),
        productName: packingRow.product_name,
        productMatchScope: productMatch.scope,
      }))
      .filter((candidate) => candidate.store);
    const storesById = new Map(candidates.map((candidate) => [candidate.store.id, candidate.store]));
    if (storesById.size !== 1) return null;
    const store = [...storesById.values()][0];
    salesStorePackingQuantityInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
      packingSources: candidates.map((candidate) => candidate.source),
      packingProductNames: uniq(candidates.map((candidate) => candidate.productName)),
      productMatchScopes: uniq(candidates.map((candidate) => candidate.productMatchScope)),
      scope: 'same_source_spec_quantity',
    });
    return store;
  }

  function inferSalesStoreFromExistingPackingSpecQuantity(row, existingPackingRows) {
    const quantity = row.quantity_number;
    if (quantityKey(quantity) == null || !row.specification || !row.source_file) return null;
    const candidates = existingPackingRows
      .filter((packingRow) => (
        packingRow.productId === resolveProduct(row).id
        && numbersEqual(packingRow.quantity, quantity)
        && sameNormalizedText(packingRow.specification, row.specification)
        && packingRow.store
        && sourceFileAlreadyRecorded(packingRow.note, row.source_file)
      ))
      .map((packingRow) => ({
        source: packingRow.note,
        store: packingRow.store,
        productName: packingRow.product?.customsName || '',
      }));
    const storesById = new Map(candidates.map((candidate) => [candidate.store.id, candidate.store]));
    if (storesById.size !== 1) return null;
    const store = [...storesById.values()][0];
    salesStorePackingQuantityInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
      packingSources: candidates.map((candidate) => candidate.source),
      packingProductNames: uniq(candidates.map((candidate) => candidate.productName)),
      productMatchScopes: ['existing_packing_note_spec_quantity'],
      scope: 'existing_packing_note_spec_quantity',
    });
    return store;
  }

  function inferSalesStoreFromPackingQuantityConsensus(row) {
    const quantity = row.quantity_number;
    if (quantityKey(quantity) == null) return null;
    const candidates = (evidencePackingByContract.get(row.contract_no) || [])
      .filter((packingRow) => (
        packingRow.product_name === row.product_name
        && numbersEqual(packingRow.quantity_number, quantity)
        && packingRow.store
        && !hasMixedStoreMarker(packingRow.store)
      ))
      .map((packingRow) => ({
        source: sourceKey(packingRow),
        store: lookupStoreByName(packingRow.store),
      }))
      .filter((candidate) => candidate.store);
    const storesById = new Map(candidates.map((candidate) => [candidate.store.id, candidate.store]));
    if (storesById.size !== 1) return null;
    const store = [...storesById.values()][0];
    salesStorePackingQuantityInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
      packingSources: candidates.map((candidate) => candidate.source),
      scope: 'contract_product_quantity_consensus',
    });
    return store;
  }

  function inferSalesStoreFromSameSourceResidualProduct(row) {
    const salesGroup = (salesByContract.get(row.contract_no) || [])
      .filter((salesRow) => (
        salesRow.source_file === row.source_file
        && salesRow.product_name === row.product_name
        && quantityKey(salesRow.quantity_number) != null
      ));
    const packingGroup = (evidencePackingByContract.get(row.contract_no) || [])
      .filter((packingRow) => (
        packingRow.source_file === row.source_file
        && packingRow.product_name === row.product_name
        && packingRow.store
        && !hasMixedStoreMarker(packingRow.store)
        && lookupStoreByName(packingRow.store)
        && quantityKey(packingRow.quantity_number) != null
      ));
    if (salesGroup.length < 2 || salesGroup.length !== packingGroup.length) return null;

    const usedSales = new Set();
    const usedPacking = new Set();
    for (const salesRow of salesGroup) {
      const sameQuantityPackingRows = packingGroup
        .filter((packingRow) => (
          !usedPacking.has(sourceKey(packingRow))
          && numbersEqual(packingRow.quantity_number, salesRow.quantity_number)
        ));
      if (sameQuantityPackingRows.length !== 1) continue;
      const salesSameQuantityRows = salesGroup
        .filter((candidate) => (
          !usedSales.has(sourceKey(candidate))
          && numbersEqual(candidate.quantity_number, salesRow.quantity_number)
        ));
      if (salesSameQuantityRows.length !== 1) continue;
      usedSales.add(sourceKey(salesRow));
      usedPacking.add(sourceKey(sameQuantityPackingRows[0]));
    }

    const residualSalesRows = salesGroup.filter((salesRow) => !usedSales.has(sourceKey(salesRow)));
    const residualPackingRows = packingGroup.filter((packingRow) => !usedPacking.has(sourceKey(packingRow)));
    if (
      residualSalesRows.length !== 1
      || residualPackingRows.length !== 1
      || sourceKey(residualSalesRows[0]) !== sourceKey(row)
    ) {
      return null;
    }
    const store = lookupStoreByName(residualPackingRows[0].store);
    if (!store) return null;
    salesStoreResidualProductInferences.push({
      contractNo: row.contract_no,
      productName: row.product_name,
      storeName: store.name,
      source: sourceKey(row),
      residualPackingSource: sourceKey(residualPackingRows[0]),
      matchedSources: [...usedSales],
      scope: 'same_source_product_residual_pair',
    });
    return store;
  }

  function inferHomogeneousAmbiguousSalesGroups(contractNo, pendingRows, existing) {
    const inferredRows = [];
    const unresolved = [];
    const rowsByGroup = groupBy(pendingRows, (item) => [
      item.product.id,
      quantityKey(item.row.quantity_number) || '',
      quantityKey(item.row.unit_price_number) || '',
      item.row.unit || '',
      item.row.specification || '',
    ].join('|'));

    for (const groupRows of rowsByGroup.values()) {
      const first = groupRows[0];
      const quantity = first.row.quantity_number;
      const unitPrice = first.row.unit_price_number;
      const allSameSourceShape = groupRows.every((item) => (
        item.product.id === first.product.id
        && numbersEqual(item.row.quantity_number, quantity)
        && numbersEqual(item.row.unit_price_number, unitPrice)
        && (item.row.unit || '') === (first.row.unit || '')
        && (item.row.specification || '') === (first.row.specification || '')
      ));
      if (
        groupRows.length < 2
        || !allSameSourceShape
        || quantityKey(quantity) == null
        || !numericPresent(unitPrice)
      ) {
        unresolved.push(...groupRows);
        continue;
      }

      const sameQuantityPackingRows = (evidencePackingByContract.get(contractNo) || [])
        .filter((packingRow) => (
          packingRow.product_name === first.row.product_name
          && numbersEqual(packingRow.quantity_number, quantity)
          && packingRow.store
          && !hasMixedStoreMarker(packingRow.store)
        ));
      const packingStoresById = new Map(
        sameQuantityPackingRows
          .map((packingRow) => lookupStoreByName(packingRow.store))
          .filter(Boolean)
          .map((store) => [store.id, store]),
      );
      if (packingStoresById.size !== groupRows.length) {
        unresolved.push(...groupRows);
        continue;
      }

      const sources = groupRows.map((item) => sourceKey(item.row));
      const satisfiedCandidates = existing
        .filter((item) => (
          item.productId === first.product.id
          && item.storeId
          && packingStoresById.has(item.storeId)
          && numbersEqual(item.quantity, quantity)
          && numbersEqual(item.sellingPrice, unitPrice)
          && sources.every((source) => sourceAlreadyRecorded(item.note, source))
        ));
      const satisfiedStoresById = new Map(satisfiedCandidates.map((item) => [item.storeId, item]));
      if (
        satisfiedCandidates.length === groupRows.length
        && satisfiedStoresById.size === groupRows.length
      ) {
        continue;
      }

      const existingCandidates = existing
        .filter((item) => (
          item.productId === first.product.id
          && item.storeId
          && packingStoresById.has(item.storeId)
          && numbersEqual(item.quantity, quantity)
          && Number(item.sellingPrice || 0) === 0
          && !String(item.note || '').includes(SOURCE_NOTE_PREFIX)
        ));
      const existingStoresById = new Map(existingCandidates.map((item) => [item.storeId, item]));
      if (
        existingCandidates.length !== groupRows.length
        || existingStoresById.size !== groupRows.length
      ) {
        unresolved.push(...groupRows);
        continue;
      }

      const storeNames = [...packingStoresById.values()].map((store) => store.name).sort();
      const sourceNoteText = groupRows.map((item) => sourceNote(item.row)).join(' | ');
      const inferenceNote = `[WPS_SALES_HOMOGENEOUS_GROUP_PRICE] ${storeNames.join(',')}`;
      for (const existingItem of existingCandidates.sort((left, right) => (
        String(left.store?.name || '').localeCompare(String(right.store?.name || ''), 'zh-Hans-CN')
      ))) {
        inferredRows.push({
          source: sources[0],
          data: {
            salesContractId: first.contract.id,
            productId: first.product.id,
            storeId: existingItem.storeId,
            quantity: quantity || 0,
            unit: first.row.unit,
            costPrice: 0,
            sellingPrice: unitPrice || 0,
            specification: first.row.specification,
            note: [sourceNoteText, inferenceNote].filter(Boolean).join(' | '),
          },
        });
      }
      salesStoreHomogeneousGroupInferences.push({
        contractNo,
        productName: first.row.product_name,
        quantity,
        unitPrice,
        sourceRows: sources,
        storeNames,
        scope: 'homogeneous_sales_rows_existing_store_price',
      });
    }

    return { inferredRows, unresolved };
  }

  for (const row of packingRows) {
    resolveProduct(row);
    resolveStore(row);
  }
  for (const row of salesRows) {
    resolveProduct(row);
  }
  for (const row of contractRows) {
    resolveContractCreate(row);
  }

  for (const [contractNo, rows] of packingByContract.entries()) {
    const rowsByProduct = groupBy(rows, (row) => row.product_name);
    for (const [productName, productRows] of rowsByProduct.entries()) {
      ownedByContractProduct.set(
        `${contractNo}:${productName}`,
        productRows.some((row) => isOwnedByJiesong(row)),
      );
    }

    const contract = contractsByNo.get(contractNo);
    if (!contract) {
      skipped.push({ type: 'missing_contract_for_packing', contractNo, rows: rows.length });
      continue;
    }

    const totals = rows.reduce((acc, row) => {
      acc.totalBoxes += row.boxes_number || 0;
      acc.grossWeight += row.gross_weight_number || 0;
      acc.netWeight += row.net_weight_number || 0;
      acc.volume += row.volume_number || 0;
      return acc;
    }, { totalBoxes: 0, grossWeight: 0, netWeight: 0, volume: 0 });

    const containerLabels = uniq(rows.map((row) => row.container_label));
    const customsBrokers = uniq(rows.map((row) => row.customs_broker));
    const shippedDates = uniq(rows.map((row) => row.shipped_at_text));
    const contractPatch = {};
    if (options.updateContractAggregates) {
      if (!numbersEqual(contract.totalBoxes, totals.totalBoxes)) contractPatch.totalBoxes = totals.totalBoxes;
      if (!numbersEqual(contract.grossWeight, totals.grossWeight)) contractPatch.grossWeight = totals.grossWeight;
      if (!numbersEqual(contract.netWeight, totals.netWeight)) contractPatch.netWeight = totals.netWeight;
      if (!numbersEqual(contract.volume, totals.volume, 0.0001)) contractPatch.volume = totals.volume;
    }
    if (!contract.containerLabel && containerLabels.length === 1) contractPatch.containerLabel = containerLabels[0];
    if (!contract.customsBroker && customsBrokers.length === 1) contractPatch.customsBroker = customsBrokers[0];
    if (!contract.shippedAt && shippedDates.length === 1) contractPatch.shippedAt = dateOrNull(shippedDates[0]);
    if (Object.keys(contractPatch).length > 0) {
      contractUpdates.push({ contractNo, contractId: contract.id, data: contractPatch });
    }

    const existing = existingPackingByContract.get(contract.id) || [];
    const linkedExistingCount = existing.filter((item) => state.linkedPackingItemIds.has(item.id)).length;
    packingReplacements.push({
      contractNo,
      contractId: contract.id,
      existingCount: existing.length,
      linkedExistingCount,
      sourceCount: rows.length,
      willReplace: options.replacePacking,
      rows: rows.map((row) => {
        const product = resolveProduct(row);
        const store = resolveStore(row);
        return {
          source: sourceKey(row),
          sourceStoreName: row.store,
          data: {
            salesContractId: contract.id,
            productId: product.id,
            storeId: store?.id || null,
            isOwnedByJiesong: isOwnedByJiesong(row),
            sourceParty: deriveSourceParty(row),
            quantity: row.quantity_number || 0,
            unit: row.unit,
            boxes: row.boxes_number,
            grossWeight: row.gross_weight_number,
            netWeight: row.net_weight_number,
            volume: row.volume_number,
            unitPrice: row.unit_price_number,
            totalPrice: row.total_price_number,
            supplement: row.supplement,
            specification: row.specification,
            manufacturer: row.manufacturer,
            invoiceNo: row.invoice_no,
            purchaseContractNo: row.purchase_contract_no,
            purchaseCost: row.purchase_cost_number,
            note: [sourceNote(row), row.note_text].filter(Boolean).join(' '),
          },
        };
      }),
    });

    const mergePlan = buildPackingMergeForContract({
      contractNo,
      contractId: contract.id,
      existing,
      linkedPackingItemIds: state.linkedPackingItemIds,
      sourceRows: rows.map((row) => {
        const product = resolveProduct(row);
        const store = resolveStore(row);
        return {
          source: sourceKey(row),
          sourceStoreName: row.store,
          data: {
            salesContractId: contract.id,
            productId: product.id,
            storeId: store?.id || null,
            isOwnedByJiesong: isOwnedByJiesong(row),
            sourceParty: deriveSourceParty(row),
            quantity: row.quantity_number || 0,
            unit: row.unit,
            boxes: row.boxes_number,
            grossWeight: row.gross_weight_number,
            netWeight: row.net_weight_number,
            volume: row.volume_number,
            unitPrice: row.unit_price_number,
            totalPrice: row.total_price_number,
            supplement: row.supplement,
            specification: row.specification,
            manufacturer: row.manufacturer,
            invoiceNo: row.invoice_no,
            purchaseContractNo: row.purchase_contract_no,
            purchaseCost: row.purchase_cost_number,
            note: [sourceNote(row), row.note_text].filter(Boolean).join(' '),
          },
        };
      }),
    });
    packingMerges.push(mergePlan);
  }

  const packingStoreByContractProduct = new Map();
  const packingStoreAmbiguityByContractProduct = new Map();
  const packingStoreByContractProductSourceQuantity = new Map();
  const packingStoreByContract = new Map();
  for (const [contractNo, rows] of packingByContract.entries()) {
    const stores = uniq(rows.map((row) => row.store));
    if (stores.length === 1 && lookupStoreByName(stores[0])) {
      packingStoreByContract.set(contractNo, lookupStoreByName(stores[0]));
    }
    const rowsByProduct = groupBy(rows, (row) => row.product_name);
    for (const [productName, productRows] of rowsByProduct.entries()) {
      const productStores = uniq(productRows.map((row) => row.store).filter(Boolean));
      const knownProductStores = productStores.map((storeName) => lookupStoreByName(storeName)).filter(Boolean);
      if (knownProductStores.length === 1) {
        packingStoreByContractProduct.set(`${contractNo}:${productName}`, knownProductStores[0]);
      } else if (knownProductStores.length > 1 || productStores.some((storeName) => hasMixedStoreMarker(storeName))) {
        packingStoreAmbiguityByContractProduct.set(`${contractNo}:${productName}`, productStores);
      }

      const rowsBySourceQuantity = groupBy(productRows, (row) => (
        `${row.source_file}:${quantityKey(row.quantity_number) || ''}`
      ));
      for (const [sourceQuantityKey, sourceQuantityRows] of rowsBySourceQuantity.entries()) {
        const sourceQuantityStores = uniq(
          sourceQuantityRows
            .map((row) => row.store)
            .filter((storeName) => storeName && !hasMixedStoreMarker(storeName))
            .map((storeName) => lookupStoreByName(storeName))
            .filter(Boolean),
        );
        if (sourceQuantityStores.length === 1) {
          packingStoreByContractProductSourceQuantity.set(
            `${contractNo}:${productName}:${sourceQuantityKey}`,
            sourceQuantityStores[0],
          );
        }
      }
    }
  }

  for (const [contractNo, rows] of salesByContract.entries()) {
    const contract = contractsByNo.get(contractNo);
    if (!contract) {
      skipped.push({ type: 'missing_contract_for_sales', contractNo, rows: rows.length });
      continue;
    }
    const existing = existingSalesByContract.get(contract.id) || [];
    const existingPackingForContract = existingPackingByContract.get(contract.id) || [];
    const importRows = [];
    const pendingAmbiguousSalesRows = [];
    for (const row of rows) {
      const product = resolveProduct(row);
      if (ownedByContractProduct.get(`${contractNo}:${row.product_name}`) === false) {
        skipped.push({
          type: 'sales_row_for_third_party_packing',
          contractNo,
          productName: row.product_name,
          source: sourceKey(row),
        });
        continue;
      }
      let store = (
        packingStoreByContractProduct.get(`${contractNo}:${row.product_name}`)
        || packingStoreByContract.get(contractNo)
      );
      let storeInferenceNote = null;
      if (!store) {
        store = inferSalesStoreFromSameSourcePackingSpecQuantity(row);
        if (store) storeInferenceNote = `[WPS_PACKING_SPEC_QUANTITY_STORE] ${store.name}`;
      }
      if (!store) {
        store = inferSalesStoreFromExistingPackingSpecQuantity(row, existingPackingForContract);
        if (store) storeInferenceNote = `[WPS_PACKING_SPEC_QUANTITY_STORE] ${store.name}`;
      }
      if (!store) {
        const sameSourceQuantityInference = inferSalesStoreFromSameSourcePackingQuantity(row);
        if (sameSourceQuantityInference) {
          store = sameSourceQuantityInference.store;
          storeInferenceNote = sameSourceQuantityInference.scope === 'source_note_product_alias'
            ? `[WPS_PACKING_QUANTITY_ALIAS_STORE] ${store.name}`
            : `[WPS_PACKING_QUANTITY_STORE] ${store.name}`;
        }
        if (!store) {
          store = packingStoreByContractProductSourceQuantity.get(
            `${contractNo}:${row.product_name}:${row.source_file}:${quantityKey(row.quantity_number) || ''}`,
          );
          if (store) storeInferenceNote = `[WPS_PACKING_QUANTITY_STORE] ${store.name}`;
        }
        if (!store) {
          store = inferSalesStoreFromPackingQuantityConsensus(row);
          if (store) storeInferenceNote = `[WPS_PACKING_QUANTITY_CONSENSUS_STORE] ${store.name}`;
        }
        if (!store) {
          store = inferSalesStoreFromSameSourceResidualProduct(row);
          if (store) storeInferenceNote = `[WPS_PACKING_RESIDUAL_PRODUCT_STORE] ${store.name}`;
        }
      }
      const ambiguousPackingStores = packingStoreAmbiguityByContractProduct.get(`${contractNo}:${row.product_name}`);
      if (!store && ambiguousPackingStores) {
        const splitRows = inferSalesRowsFromPackingQuantitySplit(row, product, contract);
        if (splitRows.length > 0) {
          importRows.push(...splitRows);
          continue;
        }
        pendingAmbiguousSalesRows.push({
          row,
          product,
          contract,
          ambiguousPackingStores,
        });
        continue;
      }
      if (!store) {
        store = inferSalesStoreFromContract(row);
        if (store) storeInferenceNote = `[WPS_CONTRACT_STORE] ${store.name}`;
      }
      if (!store) {
        store = inferSalesStoreFromSourcePath(row);
        if (store) storeInferenceNote = `[WPS_SOURCE_PATH_STORE] ${store.name}`;
      }
      if (!store) {
        skipped.push({
          type: 'sales_row_without_source_store',
          contractNo,
          productName: row.product_name,
          source: sourceKey(row),
        });
        continue;
      }
      importRows.push({
        source: sourceKey(row),
        data: {
          salesContractId: contract.id,
          productId: product.id,
          storeId: store.id,
          quantity: row.quantity_number || 0,
          unit: row.unit,
          costPrice: 0,
          sellingPrice: row.unit_price_number || 0,
          specification: row.specification,
          note: [sourceNote(row), storeInferenceNote].filter(Boolean).join(' '),
        },
      });
    }
    const homogeneousGroups = inferHomogeneousAmbiguousSalesGroups(
      contractNo,
      pendingAmbiguousSalesRows,
      existing,
    );
    importRows.push(...homogeneousGroups.inferredRows);
    for (const item of homogeneousGroups.unresolved) {
      skipped.push({
        type: 'sales_row_ambiguous_packing_stores',
        contractNo,
        productName: item.row.product_name,
        source: sourceKey(item.row),
        stores: item.ambiguousPackingStores,
      });
    }
    salesReplacements.push({
      contractNo,
      contractId: contract.id,
      existingCount: existing.length,
      sourceCount: rows.length,
      importableCount: importRows.length,
      willReplace: options.replaceSales,
      rows: importRows,
    });
    salesMerges.push(buildSalesMergeForContract({
      contractNo,
      contractId: contract.id,
      existing,
      sourceRows: importRows,
    }));
  }

  return {
    options,
    summary: {
      dryRun: !options.apply,
      sourcePackingRows: packingRows.length,
      sourceSalesRows: salesRows.length,
      sourceInvoiceRows: invoiceRows.length,
      productCreates: productCreates.length,
      productUpdates: productUpdates.size,
      storeCreates: storeCreates.length,
      contractCreates: contractCreates.length,
      invoiceDeclarationNos: invoiceSummaryAudit.uniqueDeclarationNoCount,
      invoiceNos: invoiceSummaryAudit.uniqueInvoiceNoCount,
      customsImportBlocked: options.mergeCustoms && invoiceSummaryAudit.blocksDirectImport,
      taxRefundImportBlocked: options.mergeTaxRefunds && invoiceSummaryAudit.blocksDirectImport,
      contractUpdates: contractUpdates.length,
      linkedPackingItemsAtRisk: packingReplacements.reduce((sum, item) => sum + item.linkedExistingCount, 0),
      packingContracts: packingReplacements.length,
      packingRowsToWrite: packingReplacements.reduce((sum, item) => sum + item.rows.length, 0),
      packingMergeContracts: packingMerges.length,
      packingMergeUpdates: packingMerges.reduce((sum, item) => sum + item.updates.length, 0),
      packingMergeCreates: packingMerges.reduce((sum, item) => sum + item.creates.length, 0),
      packingMergeUnmatched: packingMerges.reduce((sum, item) => sum + item.unmatched.length, 0),
      salesContracts: salesReplacements.length,
      salesRowsToWrite: salesReplacements.reduce((sum, item) => sum + item.rows.length, 0),
      salesMergeContracts: salesMerges.length,
      salesMergeUpdates: salesMerges.reduce((sum, item) => sum + item.updates.length, 0),
      salesMergeCreates: salesMerges.reduce((sum, item) => sum + item.creates.length, 0),
      salesMergeUnmatched: salesMerges.reduce((sum, item) => sum + item.unmatched.length, 0),
      salesStoreContractInferences: salesStoreContractInferences.length,
      salesStorePathInferences: salesStorePathInferences.length,
      salesStorePackingQuantityInferences: salesStorePackingQuantityInferences.length,
      salesStoreHomogeneousGroupInferences: salesStoreHomogeneousGroupInferences.length,
      salesStoreResidualProductInferences: salesStoreResidualProductInferences.length,
      salesStoreSplitInferences: salesStoreSplitInferences.length,
      skipped: skipped.length,
      warnings: warnings.length,
    },
    operations: {
      productCreates,
      productUpdates: [...productUpdates.values()],
      storeCreates,
      contractCreates,
      contractUpdates,
      packingReplacements,
      packingMerges,
      salesReplacements,
      salesMerges,
      salesStoreContractInferences,
      salesStorePathInferences,
      salesStorePackingQuantityInferences,
      salesStoreHomogeneousGroupInferences,
      salesStoreResidualProductInferences,
      salesStoreSplitInferences,
    },
    invoiceSummaryAudit,
    skipped,
    warnings,
  };
}

async function resolveCreatedProducts(tx, productCreates) {
  const map = new Map();
  for (const item of productCreates) {
    const product = await tx.product.create({
      data: item.data,
    });
    map.set(`__new_product__:${item.productName}`, product.id);
  }
  return map;
}

async function resolveCreatedStores(tx, storeCreates) {
  const map = new Map();
  for (const item of storeCreates) {
    const store = await tx.store.upsert({
      where: { name: item.storeName },
      update: {},
      create: item.data,
    });
    map.set(`__new_store__:${item.storeName}`, store.id);
  }
  return map;
}

async function resolveCreatedContracts(tx, contractCreates) {
  const map = new Map();
  for (const item of contractCreates) {
    const contract = await tx.salesContract.create({
      data: item.data,
    });
    map.set(`__new_contract__:${item.contractNo}`, contract.id);
  }
  return map;
}

function replaceVirtualIds(data, productIdMap, storeIdMap, contractIdMap) {
  const next = { ...data };
  if (contractIdMap.has(next.salesContractId)) next.salesContractId = contractIdMap.get(next.salesContractId);
  if (productIdMap.has(next.productId)) next.productId = productIdMap.get(next.productId);
  if (next.storeId && storeIdMap.has(next.storeId)) next.storeId = storeIdMap.get(next.storeId);
  return next;
}

async function applyPlan(plan) {
  if (!plan.options.apply) return;
  if (plan.options.mergePacking && plan.options.replacePacking) {
    throw new Error('不能同时使用 --merge-packing 和 --replace-packing。');
  }
  if (plan.options.mergeSales && plan.options.replaceSales) {
    throw new Error('不能同时使用 --merge-sales 和 --replace-sales。');
  }
  if ((plan.options.mergeCustoms || plan.options.mergeTaxRefunds) && plan.invoiceSummaryAudit.blocksDirectImport) {
    throw new Error(
      `${plan.invoiceSummaryAudit.reason} `
      + `重复报关单号 ${plan.invoiceSummaryAudit.declarationNosCrossContractCount} 个，`
      + `重复发票号 ${plan.invoiceSummaryAudit.invoiceNosCrossContractCount} 个。`
      + ' 请改用真实报关单/出口退税联/发票 PDF 或经核对后的明细源。',
    );
  }
  const linkedPackingItemsAtRisk = plan.operations.packingReplacements
    .reduce((sum, item) => sum + item.linkedExistingCount, 0);
  if (plan.options.replacePacking && linkedPackingItemsAtRisk > 0 && !plan.options.allowLinkedPackingReplace) {
    throw new Error(
      `拒绝替换装箱明细：当前有 ${linkedPackingItemsAtRisk} 条装箱行已被报关明细引用。`
      + ' 如确需断开并重建，必须显式传 --allow-linked-packing-replace。',
    );
  }

  await prisma.$transaction(async (tx) => {
    const productIdMap = await resolveCreatedProducts(tx, plan.operations.productCreates);
    const storeIdMap = await resolveCreatedStores(tx, plan.operations.storeCreates);
    const contractIdMap = await resolveCreatedContracts(tx, plan.operations.contractCreates);

    for (const update of plan.operations.productUpdates) {
      await tx.product.update({ where: { id: update.productId }, data: update.data });
    }
    for (const update of plan.operations.contractUpdates) {
      const contractId = contractIdMap.get(update.contractId) || update.contractId;
      await tx.salesContract.update({ where: { id: contractId }, data: update.data });
    }
    if (plan.options.replacePacking) {
      for (const replacement of plan.operations.packingReplacements) {
        await tx.packingItem.deleteMany({ where: { salesContractId: replacement.contractId } });
        for (const row of replacement.rows) {
          await tx.packingItem.create({
            data: replaceVirtualIds(row.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
      }
    }
    if (plan.options.mergePacking) {
      for (const merge of plan.operations.packingMerges) {
        for (const update of merge.updates) {
          await tx.packingItem.update({
            where: { id: update.packingItemId },
            data: replaceVirtualIds(update.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
        for (const row of merge.creates) {
          await tx.packingItem.create({
            data: replaceVirtualIds(row.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
      }
    }
    if (plan.options.replaceSales) {
      for (const replacement of plan.operations.salesReplacements) {
        await tx.salesItem.deleteMany({ where: { salesContractId: replacement.contractId } });
        for (const row of replacement.rows) {
          await tx.salesItem.create({
            data: replaceVirtualIds(row.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
      }
    }
    if (plan.options.mergeSales) {
      for (const merge of plan.operations.salesMerges) {
        for (const update of merge.updates) {
          await tx.salesItem.update({
            where: { id: update.salesItemId },
            data: replaceVirtualIds(update.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
        for (const row of merge.creates) {
          await tx.salesItem.create({
            data: replaceVirtualIds(row.data, productIdMap, storeIdMap, contractIdMap),
          });
        }
      }
    }
  }, { timeout: 60000 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const excludedSources = buildExcludedSources(options.parsedDir, options.allowMismatches);
  const packingRows = normalizeRows(
    readCsv(path.join(options.parsedDir, 'preferred_packing_items.csv')),
    excludedSources,
  );
  const salesRows = normalizeSalesRows(
    readCsv(path.join(options.parsedDir, 'preferred_sales_items.csv')),
    excludedSources,
  );
  const invoiceRows = normalizeInvoiceRows(
    readCsv(path.join(options.parsedDir, 'invoice_summary_items.csv')),
    excludedSources,
  );
  const contractRows = normalizeContractRows(
    readCsv(path.join(options.parsedDir, 'contracts.csv')),
  );
  const dedupedPackingRows = dedupeRows(
    packingRows,
    (row) => [
      row.contract_no,
      row.product_name,
      row.store,
      row.quantity_number,
      row.unit,
      row.boxes_number,
      row.gross_weight_number,
      row.net_weight_number,
      row.volume_number,
      row.unit_price_number,
      row.total_price_number,
    ].join('|'),
  );
  const dedupedSalesRows = dedupeRows(
    salesRows,
    (row) => [
      row.source_file,
      row.sheet,
      row.row,
      row.contract_no,
      row.product_name,
      row.specification,
      row.quantity_number,
      row.unit_price_number,
      row.total_price_number,
    ].join('|'),
  );
  const dedupedInvoiceRows = dedupeRows(
    invoiceRows,
    (row) => [
      row.contract_no,
      row.product_name,
      row.unit,
      row.quantity_number,
      row.unit_price_without_tax_number,
      row.amount_without_tax_number,
      row.tax_rate_text,
      row.tax_amount_number,
      row.amount_with_tax_number,
      row.declaration_no,
      row.invoice_no,
      row.invoice_date_text,
      row.taxpayer_no,
    ].join('|'),
  );
  const state = await loadDbState();
  const plan = buildPlan(
    options,
    state,
    dedupedPackingRows,
    dedupedSalesRows,
    dedupedInvoiceRows,
    contractRows,
    packingRows,
  );
  plan.excludedSources = [...excludedSources];
  plan.sourceRowCounts = {
    contractRows: contractRows.length,
    packingRowsBeforeDedupe: packingRows.length,
    packingRowsAfterDedupe: dedupedPackingRows.length,
    salesRowsBeforeDedupe: salesRows.length,
    salesRowsAfterDedupe: dedupedSalesRows.length,
    invoiceRowsBeforeDedupe: invoiceRows.length,
    invoiceRowsAfterDedupe: dedupedInvoiceRows.length,
  };

  fs.writeFileSync(options.out, JSON.stringify(plan, null, 2), 'utf8');
  fs.writeFileSync(
    path.join(options.parsedDir, 'invoice_summary_audit.json'),
    JSON.stringify(plan.invoiceSummaryAudit, null, 2),
    'utf8',
  );
  await applyPlan(plan);

  console.log(JSON.stringify({
    ...plan.summary,
    sourceRowCounts: plan.sourceRowCounts,
    out: options.out,
    excludedSources: plan.excludedSources.length,
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
