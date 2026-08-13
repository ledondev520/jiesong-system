/**
 * Input: EXP260010 线上 WPS 正式三单、最新出货汇总、已核验 2026B 定价预案
 * Output: 逐行差异计划；显式 --apply 后仅替换 EXP260010 装箱明细并更新合同汇总/当期退税率
 * Pos: EXP260010 一次性正式源同步 Adapter；严格校验三份来源 SHA-256，默认 dry-run
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendRoot = path.join(repoRoot, 'backend');
process.chdir(backendRoot);

const { PrismaClient } = require(path.join(backendRoot, 'node_modules/@prisma/client'));
const XLSX = require(path.join(backendRoot, 'node_modules/xlsx'));

const prisma = new PrismaClient();
const CONTRACT_NO = 'EXP260010';
const EXPECTED = Object.freeze({
  formal: 'dd2dfe8a6f3e2a5739865c575fd1d0c5d4b435661503a277cef98e8e31ece0e3',
  shipment: '4f0f601c1c385a3466f747b0422f76bf9686a594f88ed4153c28410c80ac8ada',
  pricing: 'b25a049d0fdc978e867b14941ce8ad58f5178cf8fc544499e7b8455c0b041cd3',
});
const DEFAULTS = Object.freeze({
  formal: '/Users/helena/Library/Containers/com.kingsoft.wpsoffice.mac/Data/Library/Application Support/Kingsoft/WPS Cloud Files/userdata/qing/filecache/212320004/团队文档/捷淞/11-报关记录/2026年8月/外销出口合同+发票+箱单+EXP260010 0812 圣荷西2115.xlsx',
  shipment: '/Users/helena/Downloads/出货汇总_最新云端回放源_20260813.xlsx',
  pricing: path.join(repoRoot, 'outputs/019ffb8f-94fc-7b41-8c5e-120610d15910/EXP260010_流程回放定价预案.json'),
  out: path.join(repoRoot, 'tmp/exp260010-formal-wps-sync-plan.json'),
});
const TAX_SOURCE_URL = 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5250255/content.html';
const SOURCE_MARKER = '[FORMAL_WPS_EXP260010_20260813]';

const parseArgs = (argv) => {
  const options = { ...DEFAULTS, apply: false };
  const resolve = (value) => (path.isAbsolute(value) ? value : path.join(repoRoot, value));
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--formal') options.formal = resolve(argv[++index]);
    else if (arg === '--shipment') options.shipment = resolve(argv[++index]);
    else if (arg === '--pricing') options.pricing = resolve(argv[++index]);
    else if (arg === '--out') options.out = resolve(argv[++index]);
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/sync_exp260010_formal_wps.js [--formal <xlsx>] [--shipment <xlsx>] [--pricing <json>] [--out <json>] [--apply]');
      process.exit(0);
    } else throw new Error(`未知参数: ${arg}`);
  }
  return options;
};

const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
const normalizeText = (value) => String(value ?? '').replace(/\s+/g, '').trim();
const cleanText = (value) => {
  const text = String(value ?? '').trim();
  return !text || ['#N/A', '#VALUE!', '#NAME?'].includes(text) ? null : text;
};
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(String(value).replace(/,/g, '').replace(/[¥￥$]/g, '').trim());
  return Number.isFinite(number) ? number : null;
};
const round = (value, digits = 6) => Number(Number(value || 0).toFixed(digits));
const sameNumber = (left, right, tolerance = 0.000001) => Math.abs(Number(left || 0) - Number(right || 0)) <= tolerance;
const excelDate = (value) => {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === 'number') return XLSX.SSF.parse_date_code(value)
    ? new Date(Date.UTC(
        XLSX.SSF.parse_date_code(value).y,
        XLSX.SSF.parse_date_code(value).m - 1,
        XLSX.SSF.parse_date_code(value).d,
      ))
    : null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const parseEnglishDocumentDate = (value) => {
  const match = String(value || '').match(/([A-Za-z]{3})\.?\s*(\d{1,2}),\s*(\d{4})/);
  if (!match) return null;
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = months.indexOf(match[1].toLowerCase());
  if (month < 0) return null;
  return new Date(Date.UTC(Number(match[3]), month, Number(match[2])));
};
const findSheet = (workbook, normalizedName) => {
  const name = workbook.SheetNames.find((item) => normalizeText(item) === normalizedName);
  if (!name) throw new Error(`工作簿缺少工作表: ${normalizedName}`);
  return workbook.Sheets[name];
};
const matrix = (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });

const assertSource = (filePath, expected, label) => {
  if (!fs.existsSync(filePath)) throw new Error(`${label}不存在: ${filePath}`);
  const actual = sha256(filePath);
  if (actual !== expected) throw new Error(`${label} SHA-256 已变化，拒绝同步: expected=${expected} actual=${actual}`);
  return actual;
};

const readFormalWorkbook = (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: true });
  const packing = matrix(findSheet(workbook, '箱单'));
  const contract = matrix(findSheet(workbook, '合同'));
  const rows = [];
  for (let rowIndex = 8; rowIndex < packing.length; rowIndex += 1) {
    const itemNo = numberOrNull(packing[rowIndex]?.[0]);
    if (!Number.isInteger(itemNo)) continue;
    const contractRow = contract[rowIndex] || [];
    const hsCode = String(numberOrNull(packing[rowIndex][2]) ?? cleanText(packing[rowIndex][2]) ?? '').replace(/\D/g, '');
    const row = {
      itemNo,
      productName: cleanText(packing[rowIndex][1]),
      hsCode,
      specification: cleanText(packing[rowIndex][3]),
      boxes: numberOrNull(packing[rowIndex][4]),
      grossWeight: numberOrNull(packing[rowIndex][5]),
      netWeight: numberOrNull(packing[rowIndex][6]),
      volume: numberOrNull(packing[rowIndex][7]),
      quantity: numberOrNull(packing[rowIndex][8]),
      unit: cleanText(packing[rowIndex][9]),
      declarationElements: cleanText(packing[rowIndex][10]),
      origin: cleanText(packing[rowIndex][11]),
      unitPrice: numberOrNull(contractRow[4]),
      totalPrice: numberOrNull(contractRow[5]),
    };
    const missing = Object.entries(row)
      .filter(([field, value]) => field !== 'itemNo' && (value === null || value === ''))
      .map(([field]) => field);
    if (missing.length) throw new Error(`正式工作簿第 ${itemNo} 项缺字段: ${missing.join(', ')}`);
    if (!/^\d{10}$/.test(row.hsCode)) throw new Error(`正式工作簿第 ${itemNo} 项 HS 编码不是 10 位`);
    if (!sameNumber(row.unitPrice * row.quantity, row.totalPrice, 0.11)) {
      throw new Error(`正式工作簿第 ${itemNo} 项单价×数量与总价不一致`);
    }
    rows.push(row);
  }
  if (rows.length !== 16 || rows.some((row, index) => row.itemNo !== index + 1)) {
    throw new Error(`正式工作簿商品行必须为连续 1-16 项，实际 ${rows.length} 项`);
  }
  const summary = {
    totalBoxes: round(rows.reduce((sum, row) => sum + row.boxes, 0)),
    grossWeight: round(rows.reduce((sum, row) => sum + row.grossWeight, 0)),
    netWeight: round(rows.reduce((sum, row) => sum + row.netWeight, 0)),
    volume: round(rows.reduce((sum, row) => sum + row.volume, 0)),
    totalAmount: round(rows.reduce((sum, row) => sum + row.totalPrice, 0), 2),
  };
  const cachedTotals = packing[24] || [];
  const contractTotals = contract[24] || [];
  const checks = [
    ['totalBoxes', cachedTotals[4]],
    ['grossWeight', cachedTotals[5]],
    ['netWeight', cachedTotals[6]],
    ['volume', cachedTotals[7]],
    ['totalAmount', contractTotals[5]],
  ];
  for (const [field, cached] of checks) {
    if (!sameNumber(summary[field], cached, field === 'totalAmount' ? 0.01 : 0.000001)) {
      throw new Error(`正式工作簿 ${field} 明细合计与缓存总计不一致`);
    }
  }
  const contractNo = cleanText(contract[2]?.[5])?.match(/EXP\d+/)?.[0];
  if (contractNo !== CONTRACT_NO) throw new Error(`正式工作簿合同号不是 ${CONTRACT_NO}`);
  const signedAt = parseEnglishDocumentDate(cleanText(contract[3]?.[5]));
  if (!signedAt) throw new Error('正式工作簿合同日期无法识别');
  return { rows, summary, signedAt };
};

const readShipmentRows = (filePath) => {
  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: true });
  const rows = matrix(findSheet(workbook, '出货总清单'));
  const headers = rows[0].map((value) => cleanText(value));
  const index = new Map(headers.map((header, position) => [header, position]));
  const get = (row, header) => row[index.get(header)];
  const matches = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const source = rows[rowIndex];
    if (cleanText(get(source, '合同号')) !== CONTRACT_NO) continue;
    matches.push({
      sourceRow: rowIndex + 1,
      productName: cleanText(get(source, '报关名')),
      specification: cleanText(get(source, '规格')),
      storeName: cleanText(get(source, '门店')),
      portName: cleanText(get(source, '港口')),
      supplement: cleanText(get(source, '商品补充信息')),
      manufacturer: cleanText(get(source, '厂家')),
      purchaseContractNo: cleanText(get(source, '购销合同号')),
      purchaseCost: numberOrNull(get(source, '采购金额')),
      invoiceNo: cleanText(get(source, '发票号码')),
      containerLabel: cleanText(get(source, '柜子编号')),
      customsBroker: cleanText(get(source, '报关公司')),
      shippedAt: excelDate(get(source, '出货日期')),
    });
  }
  if (matches.length !== 16) throw new Error(`最新出货汇总 ${CONTRACT_NO} 应为16行，实际${matches.length}行`);
  return matches;
};

const readPricingEvidence = (filePath) => {
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (payload?.contract?.contractNo !== CONTRACT_NO || payload?.pricing_policy?.refund_version !== '2026B') {
    throw new Error('定价预案不是 EXP260010 / 2026B 证据');
  }
  const rates = new Map();
  for (const row of payload.rows || []) {
    if (!row.hs_code || !row.refund) throw new Error(`定价预案 ${row.product_name || '未知商品'} 缺退税证据`);
    rates.set(row.hs_code, {
      refundRate: Number(row.refund.refund_rate),
      startDate: row.refund.start_date,
      refundCode: row.refund.code,
      refundName: row.refund.name,
      version: row.refund.source_version,
    });
  }
  return rates;
};

const joinSources = (formalRows, shipmentRows) => {
  const shipmentBySpec = new Map();
  for (const row of shipmentRows) {
    if (!row.specification || shipmentBySpec.has(normalizeText(row.specification))) {
      throw new Error(`出货汇总规格不能唯一定位: ${row.specification || '空规格'}`);
    }
    shipmentBySpec.set(normalizeText(row.specification), row);
  }
  return formalRows.map((formal) => {
    const shipment = shipmentBySpec.get(normalizeText(formal.specification));
    if (!shipment) throw new Error(`出货汇总未找到正式工作簿规格: ${formal.specification}`);
    return { ...formal, ...shipment, productName: formal.productName };
  });
};

const pickProduct = (products, row) => {
  const candidates = products.filter((product) => product.customsName === row.productName);
  if (!candidates.length) return null;
  return candidates.sort((left, right) => {
    const score = (product) => Number(product.hsCode === row.hsCode) * 8
      + Number(Boolean(product.hsCode)) * 4
      + Number(Boolean(product.declaration)) * 2
      + Number(Boolean(product.unit));
    return score(right) - score(left) || left.createdAt.getTime() - right.createdAt.getTime();
  })[0];
};

const buildPlan = async (options) => {
  const hashes = {
    formal: assertSource(options.formal, EXPECTED.formal, '线上正式工作簿'),
    shipment: assertSource(options.shipment, EXPECTED.shipment, '最新出货汇总'),
    pricing: assertSource(options.pricing, EXPECTED.pricing, '2026B定价预案'),
  };
  const formal = readFormalWorkbook(options.formal);
  const shipmentRows = readShipmentRows(options.shipment);
  const refundRates = readPricingEvidence(options.pricing);
  const rows = joinSources(formal.rows, shipmentRows);
  const contract = await prisma.salesContract.findUnique({
    where: { contractNo: CONTRACT_NO },
    include: {
      port: true,
      packingItems: { include: { product: true, store: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!contract) throw new Error(`${CONTRACT_NO} 不存在`);
  const packingIds = contract.packingItems.map((item) => item.id);
  const customsLinks = packingIds.length
    ? await prisma.customsDeclarationItem.count({ where: { packingItemId: { in: packingIds } } })
    : 0;
  if (customsLinks) throw new Error(`旧装箱明细已有 ${customsLinks} 条报关引用，拒绝替换`);

  const [products, stores, hsRecords] = await Promise.all([
    prisma.product.findMany({
      where: { customsName: { in: [...new Set(rows.map((row) => row.productName))] } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.store.findMany({ where: { name: { in: [...new Set(rows.map((row) => row.storeName))] } } }),
    prisma.hsCode.findMany({ where: { hsCode: { in: [...new Set(rows.map((row) => row.hsCode))] } } }),
  ]);
  const storeByName = new Map(stores.map((store) => [store.name, store]));
  const missingStores = [...new Set(rows.map((row) => row.storeName))].filter((name) => !storeByName.has(name));
  if (missingStores.length) throw new Error(`门店主数据缺失: ${missingStores.join(', ')}`);
  const hsByCode = new Map(hsRecords.map((record) => [record.hsCode, record]));
  const missingHs = [...new Set(rows.map((row) => row.hsCode))].filter((code) => !hsByCode.has(code));
  if (missingHs.length) throw new Error(`HS 当前证据缺失: ${missingHs.join(', ')}`);

  const productCreates = rows.filter((row) => !pickProduct(products, row)).map((row) => ({
    productName: row.productName,
    data: {
      customsName: row.productName,
      description: row.supplement,
      specification: row.specification,
      unit: row.unit,
      hsCode: row.hsCode,
      declaration: row.declarationElements,
    },
  })).filter((item, index, all) => all.findIndex((other) => other.productName === item.productName) === index);

  const packingCreates = rows.map((row) => ({
    itemNo: row.itemNo,
    productName: row.productName,
    storeName: row.storeName,
    sourceRow: row.sourceRow,
    data: {
      salesContractId: contract.id,
      productId: pickProduct(products, row)?.id || `__product__:${row.productName}`,
      storeId: storeByName.get(row.storeName).id,
      isOwnedByJiesong: true,
      quantity: row.quantity,
      unit: row.unit,
      boxes: row.boxes,
      grossWeight: row.grossWeight,
      netWeight: row.netWeight,
      volume: row.volume,
      unitPrice: row.unitPrice,
      totalPrice: row.totalPrice,
      supplement: row.supplement,
      specification: row.specification,
      hsCode: row.hsCode,
      declarationElements: row.declarationElements,
      origin: row.origin,
      manufacturer: row.manufacturer,
      invoiceNo: row.invoiceNo,
      purchaseContractNo: row.purchaseContractNo,
      purchaseCost: row.purchaseCost,
      hsMatchConfidence: 100,
      hsMatchMethod: 'formal_wps_confirmation',
      note: `${SOURCE_MARKER} 正式箱单#${row.itemNo}；出货总清单#${row.sourceRow}`,
    },
  }));
  const rateUpdates = [...new Set(rows.map((row) => row.hsCode))].map((hsCode) => {
    const evidence = refundRates.get(hsCode);
    if (!evidence) throw new Error(`2026B定价预案缺少 ${hsCode} 退税率`);
    return {
      hsCode,
      before: hsByCode.get(hsCode).refundRate,
      after: evidence.refundRate,
      evidence,
    };
  });
  const sourceNote = `${SOURCE_MARKER} 正式工作簿sha256=${hashes.formal}; 出货汇总sha256=${hashes.shipment}; 16项逐行同步；混合门店/港口按源行保留，合同主港口未改。`;
  return {
    mode: options.apply ? 'apply' : 'dry-run',
    contractNo: CONTRACT_NO,
    sources: {
      formal: { path: options.formal, sha256: hashes.formal },
      shipment: { path: options.shipment, sha256: hashes.shipment },
      pricing: { path: options.pricing, sha256: hashes.pricing, version: '2026B', officialNotice: TAX_SOURCE_URL },
    },
    summary: {
      oldPackingRows: contract.packingItems.length,
      newPackingRows: packingCreates.length,
      productCreates: productCreates.length,
      rateUpdates: rateUpdates.filter((item) => !sameNumber(item.before, item.after)).length,
      ...formal.summary,
    },
    contractBefore: {
      id: contract.id,
      status: contract.status,
      portName: contract.port?.name || null,
      totalBoxes: contract.totalBoxes,
      grossWeight: contract.grossWeight,
      netWeight: contract.netWeight,
      volume: contract.volume,
      totalAmount: contract.totalAmount,
      exchangeRate: contract.exchangeRate,
      signedAt: contract.signedAt,
      shippedAt: contract.shippedAt,
      containerLabel: contract.containerLabel,
      customsBroker: contract.customsBroker,
      note: contract.note,
      packingItems: contract.packingItems.map((item) => ({
        id: item.id,
        productName: item.product.customsName,
        storeName: item.store?.name || null,
        quantity: item.quantity,
        unit: item.unit,
        boxes: item.boxes,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        volume: item.volume,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        purchaseCost: item.purchaseCost,
        note: item.note,
      })),
    },
    contractUpdate: {
      status: 'SHIPPED',
      signedAt: formal.signedAt,
      shippedAt: rows.find((row) => row.shippedAt)?.shippedAt || null,
      totalBoxes: formal.summary.totalBoxes,
      grossWeight: formal.summary.grossWeight,
      netWeight: formal.summary.netWeight,
      volume: formal.summary.volume,
      totalAmount: formal.summary.totalAmount,
      containerLabel: rows.find((row) => row.containerLabel)?.containerLabel || null,
      customsBroker: rows.find((row) => row.customsBroker)?.customsBroker || null,
      note: sourceNote,
    },
    productCreates,
    packingCreates,
    rateUpdates,
  };
};

const applyPlan = async (plan) => {
  if (plan.mode !== 'apply') return { applied: false };
  return prisma.$transaction(async (tx) => {
    const productIdByName = new Map();
    for (const item of plan.productCreates) {
      const existing = await tx.product.findFirst({ where: { customsName: item.productName }, orderBy: { createdAt: 'asc' } });
      const product = existing || await tx.product.create({ data: item.data });
      productIdByName.set(item.productName, product.id);
    }
    const existingProducts = await tx.product.findMany({
      where: { customsName: { in: [...new Set(plan.packingCreates.map((item) => item.productName))] } },
      orderBy: { createdAt: 'asc' },
    });
    for (const item of plan.packingCreates) {
      if (!productIdByName.has(item.productName)) {
        const product = existingProducts.find((candidate) => candidate.customsName === item.productName);
        if (!product) throw new Error(`同步时商品不存在: ${item.productName}`);
        productIdByName.set(item.productName, product.id);
      }
    }

    const currentPacking = await tx.packingItem.findMany({ where: { salesContractId: plan.contractBefore.id }, select: { id: true } });
    const currentPackingIds = currentPacking.map((item) => item.id);
    const links = currentPackingIds.length
      ? await tx.customsDeclarationItem.count({ where: { packingItemId: { in: currentPackingIds } } })
      : 0;
    if (links) throw new Error(`应用时发现 ${links} 条报关引用，事务已取消`);
    await tx.packingItem.deleteMany({ where: { salesContractId: plan.contractBefore.id } });
    for (const item of plan.packingCreates) {
      await tx.packingItem.create({
        data: {
          ...item.data,
          productId: productIdByName.get(item.productName),
        },
      });
    }
    await tx.salesContract.update({
      where: { id: plan.contractBefore.id },
      data: plan.contractUpdate,
    });
    for (const item of plan.rateUpdates) {
      await tx.hsCode.update({
        where: { hsCode: item.hsCode },
        data: {
          refundRate: item.after,
          effectiveDate: new Date(Date.UTC(
            Number(item.evidence.startDate.slice(0, 4)),
            Number(item.evidence.startDate.slice(4, 6)) - 1,
            Number(item.evidence.startDate.slice(6, 8)),
          )),
          sourceUrl: TAX_SOURCE_URL,
          fetchedAt: new Date(),
          note: `出口退税率文库2026B；基本代码 ${item.evidence.refundCode}；税总货劳函〔2026〕86号`,
        },
      });
    }
    await tx.importRecord.create({
      data: {
        fileName: path.basename(plan.sources.formal.path),
        totalRows: plan.summary.newPackingRows,
        successRows: plan.summary.newPackingRows,
        failedRows: 0,
        status: 'COMPLETED',
        errorLog: null,
        importedBy: 'codex-formal-wps-sync',
      },
    });
    return {
      applied: true,
      deletedPackingRows: currentPacking.length,
      createdPackingRows: plan.packingCreates.length,
      productsCreated: plan.productCreates.length,
      hsRatesUpdated: plan.rateUpdates.length,
    };
  }, { timeout: 60000 });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  fs.mkdirSync(path.dirname(options.out), { recursive: true, mode: 0o700 });
  fs.chmodSync(path.dirname(options.out), 0o700);
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(options.out, 0o600);
  const result = await applyPlan(plan);
  console.log(JSON.stringify({ mode: plan.mode, ...plan.summary, ...result, out: options.out }, null, 2));
};

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
