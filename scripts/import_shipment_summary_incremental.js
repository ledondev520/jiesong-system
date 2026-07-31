/**
 * Input: 受限归档的最新 `出货汇总.xlsx` + backend/prisma SQLite
 * Output: 只新增源表中缺失的 EXP 合同、PENDING 异常占位与装箱明细；不覆盖现有合同/明细
 * Pos: 出货汇总增量导入 Adapter；默认 dry-run，显式 --apply 后才以单事务写库
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const XLSX = require(path.join(backendPath, 'node_modules/xlsx'));

const prisma = new PrismaClient();

const EXPECTED_SHA256 = '9836f1e0c02353b6f27dd5acf326baec132f27f61f6847143d780af9368f0510';
const DEFAULT_SOURCE = path.join(
  backendPath,
  'uploads/import-sources/shipment-summary/20260731',
  EXPECTED_SHA256,
  '出货汇总.xlsx',
);
const DEFAULT_OUT = path.join(repoRoot, 'tmp/wps_shipment_summary_20260731_incremental_plan.json');
const SOURCE_MARKER = '[SHIPMENT_SUMMARY_20260731]';
const TARGET_EXP_CONTRACTS = new Set(['EXP260010', 'EXP260011']);

const PRODUCT_ALIASES = Object.freeze({
  寿司机: '寿司饭团机',
});

const ANOMALY_DECISIONS = Object.freeze({
  385: {
    expected: { productName: '密胺餐具', storeName: '圣荷西2115', purchaseContractNo: 'CG2600048' },
    targetContractNo: 'PENDING-圣荷西2115',
    manufacturer: '东莞市台德塑料制品有限公司',
    reason: '源表缺 EXP；正式 CG2600048 证明采购总量 10000 只，本行为圣荷西2115的 3000 只分配，暂存 PENDING，等待最终 EXP 归属。',
  },
  395: {
    expected: { productName: '铝型材', storeName: '圣荷西2115', purchaseContractNo: null },
    targetContractNo: 'PENDING-圣荷西2115',
    reason: '源表缺 EXP、数量和采购合同号；保留为 0 数量 PENDING 占位，不推断正式合同。',
  },
  396: {
    expected: { productName: 'LED显示屏', storeName: '圣荷西625', purchaseContractNo: 'CG2600059' },
    targetContractNo: 'PENDING-圣荷西625',
    reason: '源表缺 EXP 和数量；正式 CG2600059 可确认供应商与合同金额，但不能确认出口合同，保留为 0 数量 PENDING 占位。',
  },
  397: {
    expected: { productName: '椅子', storeName: '威斯敏', purchaseContractNo: 'CG2600058' },
    targetContractNo: 'PENDING-威斯敏',
    reason: '源表缺 EXP 和数量；采购合同号、供应商和采购金额可用，保留为 0 数量 PENDING 占位。',
  },
});

function parseArgs(argv) {
  const options = { source: DEFAULT_SOURCE, out: DEFAULT_OUT, apply: false };
  const resolveRepoPath = (value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value));
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') options.source = resolveRepoPath(argv[++index]);
    else if (arg === '--out') options.out = resolveRepoPath(argv[++index]);
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage:
  node scripts/import_shipment_summary_incremental.js [--source <xlsx>] [--out <json>] [--apply]

默认只生成 dry-run 计划；--apply 才写库。脚本只处理 EXP260010、EXP260011 和 4 条已固化异常裁决。
`);
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
}

function cleanText(value) {
  if (value == null) return null;
  const text = String(value).replace(/\u3000/g, ' ').trim();
  if (!text || ['#N/A', '#VALUE!', '#NAME?'].includes(text)) return null;
  return text;
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').replace(/[¥￥$]/g, '').trim());
  return Number.isFinite(number) ? number : null;
}

function intOrNull(value) {
  const number = numberOrNull(value);
  return number == null ? null : Math.round(number);
}

function normalizeNote(value) {
  const text = cleanText(value);
  return text && text !== '1' ? text : null;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function sourceMarker(rowNumber) {
  return `${SOURCE_MARKER} 出货总清单#${rowNumber}`;
}

function readSourceRows(sourcePath) {
  if (!fs.existsSync(sourcePath)) throw new Error(`源文件不存在: ${sourcePath}`);
  const digest = sha256(sourcePath);
  if (digest !== EXPECTED_SHA256) {
    throw new Error(`源文件 SHA-256 不匹配，拒绝写库: expected=${EXPECTED_SHA256} actual=${digest}`);
  }

  const workbook = XLSX.readFile(sourcePath, { cellDates: true, raw: true });
  const sheet = workbook.Sheets['出货总清单'];
  if (!sheet) throw new Error('源文件缺少工作表: 出货总清单');
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headers = matrix[0].map((value) => cleanText(value));
  const headerIndex = new Map(headers.map((header, index) => [header, index]));
  const required = ['报关名', '门店', '港口', '报关数量', '厂家', '合同号', '购销合同号', '采购金额'];
  for (const header of required) {
    if (!headerIndex.has(header)) throw new Error(`源表缺少必需列: ${header}`);
  }

  const get = (row, header) => row[headerIndex.get(header)];
  const result = [];
  for (let index = 1; index < matrix.length; index += 1) {
    const rowNumber = index + 1;
    const row = matrix[index];
    const rawContractNo = cleanText(get(row, '合同号'));
    const anomaly = ANOMALY_DECISIONS[rowNumber] || null;
    if (!TARGET_EXP_CONTRACTS.has(rawContractNo) && !anomaly) continue;

    const rawProductName = cleanText(get(row, '报关名'));
    const rawStoreName = cleanText(get(row, '门店'));
    const rawPurchaseContractNo = cleanText(get(row, '购销合同号'));
    if (anomaly) {
      const expected = anomaly.expected;
      if (
        rawContractNo
        || rawProductName !== expected.productName
        || rawStoreName !== expected.storeName
        || rawPurchaseContractNo !== expected.purchaseContractNo
      ) {
        throw new Error(`异常裁决源行已漂移，拒绝继续: row=${rowNumber}`);
      }
    }

    if (!rawProductName || !rawStoreName) {
      throw new Error(`目标源行缺商品或门店: row=${rowNumber}`);
    }
    const targetContractNo = anomaly?.targetContractNo || rawContractNo;
    const productName = PRODUCT_ALIASES[rawProductName] || rawProductName;
    result.push({
      rowNumber,
      rawProductName,
      productName,
      contractNo: targetContractNo,
      isAnomaly: Boolean(anomaly),
      anomalyReason: anomaly?.reason || null,
      storeName: rawStoreName,
      portName: cleanText(get(row, '港口')),
      quantity: numberOrNull(get(row, '报关数量')) ?? 0,
      unit: cleanText(get(row, '单位')),
      manufacturer: anomaly?.manufacturer || cleanText(get(row, '厂家')),
      supplement: cleanText(get(row, '商品补充信息')),
      specification: cleanText(get(row, '规格')),
      boxes: intOrNull(get(row, '箱数')),
      grossWeight: numberOrNull(get(row, '毛重')),
      netWeight: numberOrNull(get(row, '净重')),
      volume: numberOrNull(get(row, '体积')),
      containerLabel: cleanText(get(row, '柜子编号')),
      customsBroker: cleanText(get(row, '报关公司')),
      purchaseContractNo: rawPurchaseContractNo,
      purchaseCost: numberOrNull(get(row, '采购金额')),
      invoiceNo: cleanText(get(row, '发票号码')),
      sourceNote: normalizeNote(get(row, '备注')),
    });
  }
  return { digest, rows: result };
}

function sum(rows, field) {
  return Number(rows.reduce((total, row) => total + Number(row[field] || 0), 0).toFixed(6));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function buildContractSpecs(rows) {
  const specs = new Map();
  for (const contractNo of TARGET_EXP_CONTRACTS) {
    const contractRows = rows.filter((row) => row.contractNo === contractNo);
    if (contractRows.length === 0) throw new Error(`源表没有目标合同明细: ${contractNo}`);
    const labeledRows = contractRows.filter((row) => row.containerLabel);
    const labeledPorts = unique(labeledRows.map((row) => row.portName));
    const labels = unique(labeledRows.map((row) => row.containerLabel));
    if (labeledPorts.length !== 1 || labels.length !== 1) {
      throw new Error(`${contractNo} 柜号/主港口不能唯一确定`);
    }
    specs.set(contractNo, {
      contractNo,
      portName: labeledPorts[0],
      containerLabel: labels[0],
      totalBoxes: sum(contractRows, 'boxes'),
      grossWeight: sum(contractRows, 'grossWeight'),
      netWeight: sum(contractRows, 'netWeight'),
      volume: sum(contractRows, 'volume'),
      customsBroker: unique(contractRows.map((row) => row.customsBroker))[0] || null,
      status: 'PACKING',
      note: `${SOURCE_MARKER} 最新出货汇总增量；无出货日期和销售价格，未创建销售明细；多门店行按源表保留。`,
    });
  }

  if (rows.some((row) => row.contractNo === 'PENDING-圣荷西625')) {
    specs.set('PENDING-圣荷西625', {
      contractNo: 'PENDING-圣荷西625',
      portName: 'Oakland',
      containerLabel: null,
      totalBoxes: 0,
      grossWeight: 0,
      netWeight: 0,
      volume: 0,
      customsBroker: null,
      status: 'DRAFT',
      note: `${SOURCE_MARKER} 圣荷西625未归属出口合同的采购/装箱占位。`,
    });
  }
  return specs;
}

function pickProduct(products, name) {
  const matches = products.filter((product) => product.customsName === name);
  if (matches.length === 0) return null;
  return matches.sort((left, right) => {
    const score = (item) => Number(Boolean(item.hsCode)) * 4 + Number(Boolean(item.specification)) * 2 + Number(Boolean(item.unit));
    return score(right) - score(left) || left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
}

function sameNumber(left, right, tolerance = 0.000001) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
}

function isSemanticDuplicate(existing, row) {
  return (
    existing.salesContract.contractNo === row.contractNo
    && existing.product.customsName === row.productName
    && (existing.store?.name || null) === row.storeName
    && sameNumber(existing.quantity, row.quantity)
    && (existing.purchaseContractNo || null) === row.purchaseContractNo
    && (existing.supplement || null) === row.supplement
  );
}

async function buildPlan(options) {
  const source = readSourceRows(options.source);
  const contractSpecs = buildContractSpecs(source.rows);
  const contractNos = unique(source.rows.map((row) => row.contractNo));
  const productNames = unique(source.rows.map((row) => row.productName));
  const storeNames = unique(source.rows.map((row) => row.storeName));
  const portNames = unique([...contractSpecs.values()].map((spec) => spec.portName));

  const [contracts, products, stores, ports, existingPacking] = await Promise.all([
    prisma.salesContract.findMany({ where: { contractNo: { in: contractNos } } }),
    prisma.product.findMany({ where: { customsName: { in: productNames } }, orderBy: { createdAt: 'asc' } }),
    prisma.store.findMany({ where: { name: { in: storeNames } }, include: { port: true } }),
    prisma.port.findMany({ where: { name: { in: portNames } } }),
    prisma.packingItem.findMany({
      where: { salesContract: { contractNo: { in: contractNos } } },
      include: { salesContract: true, product: true, store: true },
    }),
  ]);

  const contractsByNo = new Map(contracts.map((item) => [item.contractNo, item]));
  const storesByName = new Map(stores.map((item) => [item.name, item]));
  const portsByName = new Map(ports.map((item) => [item.name, item]));
  const missingStores = storeNames.filter((name) => !storesByName.has(name));
  const missingPorts = portNames.filter((name) => !portsByName.has(name));
  if (missingStores.length || missingPorts.length) {
    throw new Error(`主数据缺失，拒绝写库: stores=${missingStores.join(',')} ports=${missingPorts.join(',')}`);
  }

  const contractCreates = [...contractSpecs.values()]
    .filter((spec) => !contractsByNo.has(spec.contractNo))
    .map((spec) => ({
      contractNo: spec.contractNo,
      data: {
        contractNo: spec.contractNo,
        totalAmount: 0,
        receivedAmount: 0,
        exchangeRate: 7,
        status: spec.status,
        portId: portsByName.get(spec.portName).id,
        totalBoxes: spec.totalBoxes,
        grossWeight: spec.grossWeight,
        netWeight: spec.netWeight,
        volume: spec.volume,
        customsBroker: spec.customsBroker,
        containerLabel: spec.containerLabel,
        note: spec.note,
      },
    }));

  const productCreates = productNames
    .filter((name) => !pickProduct(products, name))
    .map((name) => {
      const sourceRow = source.rows.find((row) => row.productName === name);
      return {
        productName: name,
        data: {
          customsName: name,
          description: sourceRow?.supplement || null,
          specification: sourceRow?.specification || null,
          unit: sourceRow?.unit || null,
        },
      };
    });

  const packingCreates = [];
  const skipped = [];
  for (const row of source.rows) {
    const marker = sourceMarker(row.rowNumber);
    const markerMatch = existingPacking.find((item) => String(item.note || '').includes(marker));
    if (markerMatch) {
      skipped.push({ row: row.rowNumber, reason: 'source_already_imported', contractNo: row.contractNo });
      continue;
    }
    const semanticMatch = existingPacking.find((item) => isSemanticDuplicate(item, row));
    if (semanticMatch) {
      skipped.push({ row: row.rowNumber, reason: 'semantic_duplicate_exists', contractNo: row.contractNo });
      continue;
    }
    const product = pickProduct(products, row.productName);
    const store = storesByName.get(row.storeName);
    const notes = [marker];
    if (row.isAnomaly) notes.push(`[ANOMALY_DECISION] ${row.anomalyReason}`);
    if (!row.quantity) notes.push('源表数量为空，按 0 数量占位保留。');
    if (row.sourceNote) notes.push(row.sourceNote);
    packingCreates.push({
      row: row.rowNumber,
      contractNo: row.contractNo,
      productName: row.productName,
      storeName: row.storeName,
      anomaly: row.isAnomaly,
      data: {
        salesContractId: contractsByNo.get(row.contractNo)?.id || `__contract__:${row.contractNo}`,
        productId: product?.id || `__product__:${row.productName}`,
        storeId: store.id,
        isOwnedByJiesong: true,
        sourceParty: null,
        quantity: row.quantity,
        unit: row.unit,
        boxes: row.boxes,
        grossWeight: row.grossWeight,
        netWeight: row.netWeight,
        volume: row.volume,
        unitPrice: null,
        totalPrice: null,
        supplement: row.supplement,
        specification: row.specification,
        manufacturer: row.manufacturer,
        invoiceNo: row.invoiceNo,
        purchaseContractNo: row.purchaseContractNo,
        purchaseCost: row.purchaseCost,
        note: notes.join(' '),
      },
    });
  }

  return {
    options: { source: options.source, out: options.out, apply: options.apply },
    source: { sha256: source.digest, sheet: '出货总清单' },
    summary: {
      candidateRows: source.rows.length,
      explicitRows: source.rows.filter((row) => !row.isAnomaly).length,
      anomalyRows: source.rows.filter((row) => row.isAnomaly).length,
      contractCreates: contractCreates.length,
      productCreates: productCreates.length,
      packingCreates: packingCreates.length,
      skipped: skipped.length,
    },
    contractCreates,
    productCreates,
    packingCreates,
    skipped,
  };
}

async function applyPlan(plan) {
  if (!plan.options.apply) return { applied: false };
  return prisma.$transaction(async (tx) => {
    const contractIdMap = new Map();
    for (const item of plan.contractCreates) {
      const contract = await tx.salesContract.upsert({
        where: { contractNo: item.contractNo },
        update: {},
        create: item.data,
      });
      contractIdMap.set(item.contractNo, contract.id);
    }
    const existingContracts = await tx.salesContract.findMany({
      where: { contractNo: { in: unique(plan.packingCreates.map((item) => item.contractNo)) } },
    });
    for (const contract of existingContracts) contractIdMap.set(contract.contractNo, contract.id);

    const productIdMap = new Map();
    for (const item of plan.productCreates) {
      const existing = await tx.product.findFirst({ where: { customsName: item.productName } });
      const product = existing || await tx.product.create({ data: item.data });
      productIdMap.set(item.productName, product.id);
    }
    const existingProducts = await tx.product.findMany({
      where: { customsName: { in: unique(plan.packingCreates.map((item) => item.productName)) } },
      orderBy: { createdAt: 'asc' },
    });
    for (const item of plan.packingCreates) {
      if (!productIdMap.has(item.productName)) {
        const selected = pickProduct(existingProducts, item.productName);
        if (!selected) throw new Error(`商品不存在: ${item.productName}`);
        productIdMap.set(item.productName, selected.id);
      }
    }

    let createdPackingRows = 0;
    for (const item of plan.packingCreates) {
      const marker = sourceMarker(item.row);
      const existing = await tx.packingItem.findFirst({
        where: {
          salesContractId: contractIdMap.get(item.contractNo),
          note: { contains: marker },
        },
      });
      if (existing) continue;
      await tx.packingItem.create({
        data: {
          ...item.data,
          salesContractId: contractIdMap.get(item.contractNo),
          productId: productIdMap.get(item.productName),
        },
      });
      createdPackingRows += 1;
    }

    if (plan.contractCreates.length || plan.productCreates.length || createdPackingRows) {
      await tx.importRecord.create({
        data: {
          fileName: '出货汇总.xlsx',
          totalRows: plan.summary.candidateRows,
          successRows: createdPackingRows,
          failedRows: 0,
          status: 'COMPLETED',
          errorLog: null,
          importedBy: 'codex-local-incremental',
        },
      });
    }
    return {
      applied: true,
      contractsCreated: plan.contractCreates.length,
      productsCreated: plan.productCreates.length,
      packingRowsCreated: createdPackingRows,
    };
  }, { timeout: 60000 });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(options.out, 0o600);
  const result = await applyPlan(plan);
  console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'dry-run', ...plan.summary, ...result, out: options.out }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
