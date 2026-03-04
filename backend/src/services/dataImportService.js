/**
 * Input: CSV数据、Prisma客户端
 * Output: 数据对比结果、增量导入结果
 * Pos: 数据导入服务，处理CSV解析、对比、增量导入
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const Papa = require('papaparse');
const prisma = require('../utils/prisma');

// ==================== 配置映射 ====================

const PORT_MAP = {
  '洛杉矶': { name: '洛杉矶', code: 'LA' },
  'Oakland': { name: 'Oakland', code: 'OAK' },
  '密歇根': { name: '密歇根', code: 'MI' },
  'Oakland和洛杉矶': { name: 'Oakland', code: 'OAK' },
};

const SUPPLIER_ALIASES = {
  '黎总': '佛山陶瓷有限公司',
  '叶总': '叶总餐饮设备',
  '郭总': '郭总金属制品',
  '阿宗': '振宗石材',
  '振宗': '振宗石材',
  '刘总': '刘总家具',
  '卡座刘总': '刘总家具',
  '淘宝': '淘宝在线采购',
  '淘宝定制': '淘宝在线采购',
  '何总布菲传奇': '布菲传奇设备',
  '涂经理': '涂经理机械公司',
  '南常': '南常厨房设备',
  '徐州玻璃瓶': '徐州玻璃瓶厂',
  '深圳陈小姐': '深圳照明公司',
  '深圳杨总': '深圳电子公司',
  '泉州林总': '泉州工艺品厂',
  '泉州定制': '泉州定制厂',
  '新兴石材': '新兴石材厂',
  '王总定制': '王总餐具厂',
  '王总': '王总餐具厂',
  '台德': '台德餐具公司',
  '廊坊秀儿商贸': '廊坊秀儿商贸有限公司',
  '宜拓': '宜拓设备',
  '亚克力': '亚克力定制厂',
  '广东厂家': '广东生产厂',
  '山东厂家': '山东生产厂',
  '山东运输玻璃门': '山东生产厂',
  '新厂家窗帘': '新厂家窗帘',
  '新厂家': '新厂家',
  '佛山': '佛山金属制品',
  '蔡': '蔡氏金属',
  '上海定制': '上海定制厂',
  '厦门': '厦门石材公司',
  '广州的': '广州设备厂',
  '大汉焊接': '大汉焊接设备',
  '雾化壁炉': '雾化壁炉厂',
  '炜艺': '炜艺屏风厂',
  '酒架定制': '酒架定制厂',
  '定制提盘': '定制提盘厂',
  '玮杰': '玮杰家具',
  '物流': '物流公司',
  'zeqin': 'zeqin供应商',
  '阿珍贵州': '阿珍贵州食品',
  '重庆新': '重庆新食品',
  '君耀-淘宝': '淘宝君耀店铺',
  '外运输': '外部运输',
  '厂家定制': '厂家定制',
  '水晶屏风厂家': '水晶屏风厂',
  '泉州石材': '泉州石材厂',
  '淘宝店家': '淘宝在线采购',
  '阿里巴巴': '阿里巴巴采购',
  '新派': '新派包装',
  '舅妈联系': '舅妈联系供应商',
  '深圳（舅妈联系': '舅妈联系供应商',
  '亚克力定制': '亚克力定制厂',
  '传送带': '传送带设备厂',
  '新': '新供应商',
};

// ==================== 辅助函数 ====================

function parseAmount(value) {
  if (!value || value === '') return null;
  const cleaned = String(value).replace(/"/g, '').replace(/,/g, '').replace(/\s/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseQuantity(value) {
  if (!value || value === '') return null;
  const cleaned = String(value)
    .replace(/（/g, '').replace(/）/g, '')
    .replace(/=/g, '').replace(/\s/g, '').trim();
  const match = cleaned.match(/^[\d.]+/);
  if (match) {
    const num = parseFloat(match[0]);
    return isNaN(num) ? null : num;
  }
  return null;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr === '') return null;
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

function standardizeUnit(unit) {
  if (!unit) return null;
  return unit.replace(/（/g, '').replace(/）/g, '').trim() || null;
}

function standardizeContainerNo(no, date, portCode) {
  if (!no) return null;
  if (/^\d{2}-\d{3}-[A-Z]+$/.test(no)) return no;
  const dateObj = parseDate(date);
  const year = dateObj ? dateObj.getFullYear().toString().slice(-2) : '25';
  const match = no.match(/(\d+)/);
  const seq = match ? match[1].padStart(3, '0') : '001';
  return `${year}-${seq}-${portCode || 'LA'}`;
}

function getPortInfo(portName) {
  if (!portName) return null;
  const trimmed = portName.trim();
  return PORT_MAP[trimmed] || { name: trimmed, code: trimmed.substring(0, 3).toUpperCase() };
}

function extractStatus(note, shippedAt) {
  if (!note) return shippedAt ? 'SHIPPED' : 'PENDING';
  if (note.includes('生产中')) return 'PRODUCING';
  if (note.includes('运输中')) return 'SHIPPING';
  if (note.includes('包装中')) return 'PACKING';
  if (shippedAt) return 'SHIPPED';
  return 'PENDING';
}

function isIrrelevant(row) {
  const note = row['备注'] || '';
  const broker = row['报关公司'] || '';
  return note.includes('不相关') || broker === '不报关' || broker === '埋单';
}

const parseContainerDigits = (value) => String(value || '').replace(/\D/g, '');

const getQuantityBucket = (value) => {
  const quantity = Number(value || 0);
  if (!Number.isFinite(quantity)) {
    return 0;
  }
  return Math.floor(quantity * 1000);
};

const addQuantityBucket = (index, key, quantity) => {
  if (!index.has(key)) {
    index.set(key, new Set());
  }
  index.get(key).add(getQuantityBucket(quantity));
};

const hasNearbyQuantity = (bucketSet, targetBucket) => {
  for (let offset = -9; offset <= 9; offset += 1) {
    if (bucketSet.has(targetBucket + offset)) {
      return true;
    }
  }
  return false;
};

const buildDuplicateIndexes = (items) => {
  const exactIndex = new Map();
  const fuzzyIndex = new Map();

  items.forEach((item) => {
    const customsName = item.product?.customsName;
    const contractNo = item.salesContract?.contractNo;
    if (!customsName || !contractNo) {
      return;
    }

    const normalizedCustomsName = customsName.trim();
    const exactKey = `${normalizedCustomsName}|${contractNo}`;
    addQuantityBucket(exactIndex, exactKey, item.quantity);

    const digits = parseContainerDigits(contractNo);
    if (digits) {
      const fuzzyKey = `${normalizedCustomsName}|${digits}`;
      addQuantityBucket(fuzzyIndex, fuzzyKey, item.quantity);
    }
  });

  return { exactIndex, fuzzyIndex };
};

const createLookupMap = (items, key) => {
  const map = new Map();
  items.forEach((item) => {
    const keyValue = key(item);
    if (keyValue) {
      map.set(keyValue, item);
    }
  });
  return map;
};

const normalizeText = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeNumberText = (value) => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = parseFloat(value.replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeRecordValue = (record, keyName) => normalizeText(record?.[keyName] || '');

const normalizeContainerNoForImport = (row, portInfo) => {
  const rawContainerNo = normalizeRecordValue(row, '柜子编号');
  if (!rawContainerNo) {
    return { rawContainerNo: '', standardizedNo: null };
  }

  return {
    rawContainerNo,
    standardizedNo: standardizeContainerNo(rawContainerNo, row['出货日期'], portInfo?.code),
  };
};

const normalizeSupplierName = (supplierAlias) => {
  const trimmedAlias = normalizeText(supplierAlias);
  if (!trimmedAlias) {
    return '';
  }

  return SUPPLIER_ALIASES[trimmedAlias] || trimmedAlias;
};

const normalizeImportRows = (records) => records.map((record) => {
  const row = record.data || record;
  const customsName = normalizeRecordValue(row, '报关名');
  const storeName = normalizeRecordValue(row, '门店');
  const supplierAlias = normalizeRecordValue(row, '厂家');
  const supplierName = normalizeSupplierName(supplierAlias);
  const portName = normalizeRecordValue(row, '港口');
  const portInfo = getPortInfo(portName);
  const { rawContainerNo, standardizedNo } = normalizeContainerNoForImport(row, portInfo);
  const shippedAt = parseDate(row['出货日期']);
  const salesContractNo = normalizeRecordValue(row, '合同号');
  const purchaseContractNo = normalizeRecordValue(row, '购销合同号');

  return {
    record,
    row,
    seq: record.seq,
    customsName,
    storeName,
    supplierAlias,
    supplierName,
    portName,
    portInfo,
    rawContainerNo,
    containerNo: standardizedNo,
    shippedAt,
    salesContractNo,
    purchaseContractNo,
    quantity: parseQuantity(row['报关数量']),
    quantityBucket: getQuantityBucket(parseQuantity(row['报关数量'])),
    costPrice: parseAmount(row['采购金额']),
    sellingPrice: parseAmount(row['出口金额']) || parseAmount(row['售价']),
    isFumigated: row['是否熏蒸'] === '是',
    customsBroker: normalizeRecordValue(row, '报关公司'),
    note: normalizeRecordValue(row, '备注'),
    noteContainsIrrelevant: isIrrelevant(row),
    rawOutboundDate: row['出货日期'],
    unit: normalizeText(row['单位']),
    boxes: normalizeNumberText(row['箱数']) || 0,
    grossWeight: parseAmount(row['毛重']),
    netWeight: parseAmount(row['净重']),
    volume: parseAmount(row['体积']),
    specification: normalizeText(row['规格'] || row['商品规格']),
  };
});

const buildImportCache = async (records) => {
  const keys = {
    ports: [...new Set(records.map((item) => item.portInfo?.code).filter(Boolean))],
    suppliers: [...new Set(records.map((item) => item.supplierName).filter(Boolean))],
    products: [...new Set(records.map((item) => item.customsName).filter(Boolean))],
    stores: [...new Set(records.map((item) => item.storeName).filter(Boolean))],
    salesContracts: [...new Set(records.map((item) => item.salesContractNo).filter(Boolean))],
    purchaseContracts: [...new Set(records.map((item) => item.purchaseContractNo).filter(Boolean))],
    containers: [...new Set(records.map((item) => item.containerNo).filter(Boolean))],
  };

  const [ports, suppliers, products, stores, salesContracts, purchaseContracts, containers] = await Promise.all([
    prisma.port.findMany({
      where: { code: { in: keys.ports } },
      select: { id: true, code: true, name: true },
    }),
    prisma.supplier.findMany({
      where: { name: { in: keys.suppliers } },
      select: { id: true, name: true, shortName: true },
    }),
    prisma.product.findMany({
      where: { customsName: { in: keys.products } },
      select: { id: true, customsName: true, description: true, specification: true },
    }),
    prisma.store.findMany({
      where: { name: { in: keys.stores } },
      select: { id: true, name: true, portId: true },
    }),
    prisma.salesContract.findMany({
      where: { contractNo: { in: [...keys.salesContracts, ...keys.containers] } },
      select: { id: true, contractNo: true, exchangeRate: true, status: true, signedAt: true },
    }),
    prisma.purchaseContract.findMany({
      where: { contractNo: { in: keys.purchaseContracts } },
      select: { id: true, contractNo: true, supplierId: true },
    }),
    prisma.salesContract.findMany({
      where: { contractNo: { in: keys.containers } },
      select: { id: true, contractNo: true, portId: true, shippedAt: true, status: true },
    }),
  ]);

  return {
    portsByCode: createLookupMap(ports, (item) => item.code),
    suppliersByName: createLookupMap(suppliers, (item) => item.name),
    productsByName: createLookupMap(products, (item) => item.customsName),
    storesByName: createLookupMap(stores, (item) => item.name),
    salesContractsByNo: createLookupMap(salesContracts, (item) => item.contractNo),
    purchaseContractsByNo: createLookupMap(purchaseContracts, (item) => item.contractNo),
    containerContractsByNo: createLookupMap(containers, (item) => item.contractNo),
  };
};

const createEntityCache = () => ({
  portsByCode: new Map(),
  suppliersByName: new Map(),
  productsByName: new Map(),
  storesByName: new Map(),
  salesContractsByNo: new Map(),
  purchaseContractsByNo: new Map(),
  containerByNo: new Map(),
  salesItemByKey: new Map(),
  containerItemByKey: new Map(),
});

const buildSalesItemCacheKey = (salesContractId, productId, storeId) => [salesContractId, productId, storeId || ''].join('|');

const buildContainerItemCacheKey = (contractId, productId, storeId) => [contractId, productId, storeId || ''].join('|');

const getOrBuildItem = async (cache, key, finder) => {
  if (cache.has(key)) {
    return cache.get(key);
  }

  const result = await finder();
  cache.set(key, result || null);
  return result || null;
};

const getCachedSalesItem = (cache, salesContractId, productId, storeId) => getOrBuildItem(
  cache.salesItemByKey,
  buildSalesItemCacheKey(salesContractId, productId, storeId),
  () => prisma.salesItem.findFirst({
    where: {
      salesContractId,
      productId,
      storeId,
    },
  })
);

const getCachedContainerItem = (cache, salesContractId, productId, storeId) => getOrBuildItem(
  cache.containerItemByKey,
  buildContainerItemCacheKey(salesContractId, productId, storeId),
  () => prisma.packingItem.findFirst({
    where: {
      salesContractId,
      productId,
      ...(storeId ? { storeId } : { storeId: null }),
    },
  })
);

const toNumberOrNull = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  return Number.isFinite(Number(value)) ? Number(value) : null;
};

const shouldUseAsShortName = (supplierAlias, supplierName) => {
  if (!supplierAlias) {
    return supplierName || '';
  }
  return supplierAlias;
};

const getOrCreatePort = async (portInfo, cache, results) => {
  if (!portInfo?.code) {
    return null;
  }

  if (cache.portsByCode.has(portInfo.code)) {
    return cache.portsByCode.get(portInfo.code);
  }

  let port = await prisma.port.findUnique({
    where: { code: portInfo.code },
  });

  if (!port) {
    port = await prisma.port.create({
      data: {
        name: portInfo.name,
        code: portInfo.code,
        isActive: true,
      },
    });
  }

  cache.portsByCode.set(port.code, port);
  return port;
};

const getOrCreateSupplier = async (supplierName, supplierAlias, cache, results) => {
  if (!supplierName) {
    return null;
  }

  if (cache.suppliersByName.has(supplierName)) {
    return cache.suppliersByName.get(supplierName);
  }

  let supplier = await prisma.supplier.findFirst({
    where: { name: supplierName },
  });

  if (!supplier) {
    supplier = await prisma.supplier.create({
      data: {
        name: supplierName,
        shortName: shouldUseAsShortName(supplierAlias, supplierName),
        isActive: true,
      },
    });
    results.created.suppliers += 1;
  }

  cache.suppliersByName.set(supplierName, supplier);
  return supplier;
};

const getOrCreateProduct = async (row, cache, results) => {
  if (!row.customsName) {
    return null;
  }

  if (cache.productsByName.has(row.customsName)) {
    return cache.productsByName.get(row.customsName);
  }

  let product = await prisma.product.findFirst({
    where: { customsName: row.customsName },
  });

  if (!product) {
    const description = (row.record?.['商品补充信息']?.trim?.() || '').trim() || null;
    product = await prisma.product.create({
      data: {
        customsName: row.customsName,
        description,
        specification: row.specification || null,
        unit: row.unit,
        isActive: true,
      },
    });
    results.created.products += 1;
  }

  cache.productsByName.set(row.customsName, product);
  return product;
};

const getOrCreateStore = async (storeName, port, cache, results) => {
  if (!storeName || !port) {
    return null;
  }

  if (cache.storesByName.has(storeName)) {
    return cache.storesByName.get(storeName);
  }

  let store = await prisma.store.findFirst({
    where: { name: storeName },
  });

  if (!store) {
    store = await prisma.store.create({
      data: {
        name: storeName,
        portId: port.id,
        isActive: true,
      },
    });
    results.created.stores += 1;
  }

  cache.storesByName.set(storeName, store);
  return store;
};

const getOrCreateSalesContract = async (contractNo, cache, results, options = {}) => {
  if (!contractNo) {
    return null;
  }

  if (cache.salesContractsByNo.has(contractNo)) {
    return cache.salesContractsByNo.get(contractNo);
  }

  let contract = await prisma.salesContract.findUnique({
    where: { contractNo },
  });

  if (!contract) {
    const status = options.status || 'DRAFT';
    contract = await prisma.salesContract.create({
      data: {
        contractNo,
        totalAmount: 0,
        receivedAmount: 0,
        exchangeRate: 7.0,
        status,
        signedAt: options.signedAt ?? null,
        portId: options.portId || undefined,
        shippedAt: options.shippedAt ?? null,
        customsBroker: options.customsBroker || null,
        isFumigated: options.isFumigated || false,
        note: options.note || null,
      },
    });
    results.created.salesContracts += 1;
  }

  cache.salesContractsByNo.set(contractNo, contract);
  return contract;
};

const getOrCreateSalesContainerContract = async (contractNo, port, record, cache, results) => {
  if (!contractNo || !port) {
    return null;
  }

  if (cache.containerByNo.has(contractNo)) {
    return cache.containerByNo.get(contractNo);
  }

  let contract = await prisma.salesContract.findUnique({
    where: { contractNo },
  });

  if (!contract) {
    const shippedAt = parseDate(record['出货日期']);
    const rawContainerNo = normalizeRecordValue(record, '柜子编号');
    contract = await getOrCreateSalesContract(contractNo, cache, results, {
      status: shippedAt ? 'SHIPPED' : 'DRAFT',
      signedAt: shippedAt,
      shippedAt,
      portId: port.id,
      customsBroker: normalizeRecordValue(record, '报关公司') || null,
      isFumigated: record['是否熏蒸'] === '是',
      note: rawContainerNo !== contractNo ? `原编号: ${rawContainerNo}` : null,
    });
    results.created.containers += 1;
  }

  cache.containerByNo.set(contractNo, contract);
  return contract;
};

const getOrCreatePurchaseContract = async (contractNo, supplier, cache, results, options = {}) => {
  if (!contractNo) {
    return null;
  }

  if (!supplier) {
    return null;
  }

  if (cache.purchaseContractsByNo.has(contractNo)) {
    return cache.purchaseContractsByNo.get(contractNo);
  }

  let purchaseContract = await prisma.purchaseContract.findUnique({
    where: { contractNo },
  });

  if (!purchaseContract) {
    const paidAmount = toNumberOrNull(options.paidAmount) ?? 0;
    const totalAmount = toNumberOrNull(options.totalAmount) ?? 0;
    purchaseContract = await prisma.purchaseContract.create({
      data: {
        contractNo,
        supplierId: supplier.id,
        totalAmount,
        paidAmount,
        status: 'COMPLETED',
        invoiceNo: options.invoiceNo || null,
        signedAt: options.signedAt || null,
      },
    });
    results.created.purchaseContracts += 1;
  }

  cache.purchaseContractsByNo.set(contractNo, purchaseContract);
  return purchaseContract;
};

const IMPORT_ERRORS = {
  missingContractReference: '货柜号/合同号缺失',
  missingCustomsName: '报关名为空',
};

const getRecordSource = (record) => record.record || record;

const getRecordSeq = (record) => record.seq ?? record['序号'];

const buildImportMessage = (seq, note, isIrrelevant = false) => {
  const normalizedNote = note ? note.trim() : '';
  const prefix = isIrrelevant ? `不相关记录 - 序号${seq}` : `序号${seq}`;
  return `${prefix}: ${normalizedNote}`;
};

const classifyImportRow = (row, exactIndex, fuzzyIndex) => {
  if (!row.containerNo && !row.salesContractNo) {
    return {
      status: 'invalid',
      reason: IMPORT_ERRORS.missingContractReference,
    };
  }

  if (!row.customsName) {
    return {
      status: 'invalid',
      reason: IMPORT_ERRORS.missingCustomsName,
    };
  }

  if (isRecordDuplicate(row, exactIndex, fuzzyIndex)) {
    return {
      status: 'existing',
      payload: {
        seq: row.seq,
        customsName: row.customsName,
        containerNo: row.containerNo,
        data: getRecordSource(row),
      },
    };
  }

  return {
    status: 'new',
    payload: {
      seq: row.seq,
      customsName: row.customsName,
      storeName: row.storeName,
      containerNo: row.containerNo,
      quantity: row.quantity,
      data: getRecordSource(row),
    },
  };
};

const buildImportError = (record, reason) => ({
  seq: getRecordSeq(record),
  reason,
  data: getRecordSource(record),
});

const buildImportRecordContext = async (record, cache, results) => {
  const port = await getOrCreatePort(getPortInfo(record.portName), cache, results);
  const supplier = await getOrCreateSupplier(record.supplierName, record.supplierAlias, cache, results);
  const product = await getOrCreateProduct(record, cache, results);
  const store = await getOrCreateStore(record.storeName, port, cache, results);
  const container = record.containerNo ? await getOrCreateSalesContainerContract(record.containerNo, port, record.record, cache, results) : null;
  const salesContract = record.salesContractNo ? await getOrCreateSalesContract(record.salesContractNo, cache, results) : null;

  return {
    port,
    supplier,
    product,
    store,
    container,
    salesContract,
  };
};

const attachPurchaseContractIfNeeded = async (contractNo, supplier, cache, results) => {
  if (!contractNo || !supplier) {
    return;
  }

  await getOrCreatePurchaseContract(contractNo, supplier, cache, results);
};

const isRecordDuplicate = (row, exactIndex, fuzzyIndex) => {
  if (!row.containerNo) {
    return false;
  }

  const exactBuckets = exactIndex.get(`${row.customsName}|${row.containerNo}`);
  if (exactBuckets && hasNearbyQuantity(exactBuckets, row.quantityBucket)) {
    return true;
  }

  const fuzzyDigits = parseContainerDigits(row.containerNo);
  if (!fuzzyDigits) {
    return false;
  }

  const fuzzyBuckets = fuzzyIndex.get(`${row.customsName}|${fuzzyDigits}`);
  return Boolean(fuzzyBuckets && hasNearbyQuantity(fuzzyBuckets, row.quantityBucket));
};

const addSalesItemIfNeeded = async (record, salesContract, product, store, cache, results) => {
  if (!salesContract || !product || !store || !(record.quantity > 0)) {
    return;
  }

  const existingSalesItem = await getCachedSalesItem(cache, salesContract.id, product.id, store.id);
  if (existingSalesItem) {
    return;
  }

  await prisma.salesItem.create({
    data: {
      salesContractId: salesContract.id,
      productId: product.id,
      storeId: store.id,
      quantity: record.quantity,
      unit: standardizeUnit(record.unit),
      costPrice: record.costPrice,
      sellingPrice: record.sellingPrice,
      specification: record.specification,
      note: buildImportMessage(record.seq, record.record?.['备注'] || '', false),
    },
  });

  results.created.salesItems += 1;

  await prisma.salesContract.update({
    where: { id: salesContract.id },
    data: { totalAmount: { increment: record.sellingPrice * record.quantity } },
  });
};

const addContainerItemIfNeeded = async (record, container, product, store, cache, results) => {
  if (!container || !product) {
    return;
  }

  const containerItem = await getCachedContainerItem(cache, container.id, product.id, store ? store.id : null);
  if (containerItem) {
    return;
  }

  await prisma.packingItem.create({
    data: {
      salesContractId: container.id,
      productId: product.id,
      storeId: store?.id,
      quantity: record.quantity || 0,
      unit: standardizeUnit(record.unit),
      boxes: Number.isFinite(record.boxes) ? record.boxes : null,
      grossWeight: Number.isFinite(record.grossWeight) ? record.grossWeight : 0,
      netWeight: Number.isFinite(record.netWeight) ? record.netWeight : 0,
      volume: Number.isFinite(record.volume) ? record.volume : 0,
      note: buildImportMessage(record.seq, record.record?.['备注'] || '', false),
    },
  });

  results.created.containerItems++;
};

const addInventoryIfNeeded = async (row, product, contract, results) => {
  if (!(row.quantity && row.quantity > 0)) {
    return;
  }

  if (!product) {
    return;
  }

  const sourceRow = row.record || row;
  const rawNote = sourceRow['备注'] || '';

  await prisma.inventory.create({
    data: {
      productId: product.id,
      salesContractId: contract?.id,
      quantity: row.quantity,
      unit: standardizeUnit(row.unit),
      status: extractStatus(rawNote, row.shippedAt),
      outboundAt: row.shippedAt,
      note: buildImportMessage(row.seq, rawNote, isIrrelevant(sourceRow)),
    },
  });
  results.created.inventories++;
};

const getImportFailureMessage = (error) => (error instanceof Error ? error.message : '导入失败');

// ==================== 核心服务函数 ====================

/**
 * 职责：解析CSV内容
 * @param {string} csvContent - CSV文件内容
 * @returns {Object} 解析结果
 */
const parseCSV = (csvContent) => {
  if (typeof csvContent !== 'string') {
    return {
      data: [],
      errors: [{ message: 'CSV内容必须是字符串' }],
      meta: null,
    };
  }

  try {
    const parsed = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
    });

    return {
      data: parsed.data || [],
      errors: parsed.errors || [],
      meta: parsed.meta || null,
    };
  } catch (error) {
    return {
      data: [],
      errors: [{ message: error?.message || 'CSV解析异常' }],
      meta: null,
    };
  }
};

/**
 * 职责：分析CSV数据，找出缺失序号
 * @param {Array} rows - CSV数据行
 * @returns {Object} 分析结果
 */
const analyzeData = (rows) => {
  const sequenceSet = new Set();
  const seqs = [];

  rows.forEach((row) => {
    const rawSeq = parseInt(row['序号']);
    if (!isNaN(rawSeq)) {
      seqs.push(rawSeq);
      sequenceSet.add(rawSeq);
    }
  });

  seqs.sort((a, b) => a - b);
  const minSeq = seqs[0] || 1;
  const maxSeq = seqs[seqs.length - 1] || 1;
  
  const missingSeqs = [];
  for (let i = minSeq; i <= maxSeq; i++) {
    if (!sequenceSet.has(i)) {
      missingSeqs.push(i);
    }
  }
  
  return {
    totalRows: rows.length,
    seqRange: { min: minSeq, max: maxSeq },
    missingSeqs,
    uniqueSeqs: [...new Set(seqs)].length,
  };
};

/**
 * 职责：与数据库现有数据对比，找出新增记录
 * @param {Array} rows - CSV数据行
 * @returns {Object} 对比结果
 */
const compareWithDatabase = async (rows) => {
  // 获取数据库中现有的装箱明细
  const normalizedRows = normalizeImportRows(rows);
  const existingItems = await prisma.packingItem.findMany({
    include: {
      product: true,
      salesContract: true,
    },
  });
  const { exactIndex, fuzzyIndex } = buildDuplicateIndexes(existingItems);
  
  // 分类记录
  const newRecords = [];
  const existingRecords = [];
  const invalidRecords = [];
  
  for (const row of normalizedRows) {
    const classification = classifyImportRow(row, exactIndex, fuzzyIndex);

    if (classification.status === 'invalid') {
      invalidRecords.push(buildImportError(row, classification.reason));
      continue;
    }

    if (classification.status === 'existing') {
      existingRecords.push(classification.payload);
      continue;
    }

    newRecords.push(classification.payload);
  }
  
  return {
    newRecords,
    existingRecords,
    invalidRecords,
    summary: {
      total: rows.length,
      new: newRecords.length,
      existing: existingRecords.length,
      invalid: invalidRecords.length,
    },
  };
};

/**
 * 职责：导入新增记录到数据库
 * @param {Array} records - 要导入的记录
 * @returns {Object} 导入结果
 */
const importRecords = async (records) => {
  const results = {
    success: [],
    failed: [],
    created: {
      suppliers: 0,
      products: 0,
      stores: 0,
      containers: 0,
      salesContracts: 0,
      salesItems: 0,
      purchaseContracts: 0,
      containerItems: 0,
      inventories: 0,
    },
  };
  
  const normalizedRecords = normalizeImportRows(records);
  const cache = createEntityCache();

  const seeded = await buildImportCache(normalizedRecords);
  cache.portsByCode = seeded.portsByCode;
  cache.suppliersByName = seeded.suppliersByName;
  cache.productsByName = seeded.productsByName;
  cache.storesByName = seeded.storesByName;
  cache.salesContractsByNo = seeded.salesContractsByNo;
  cache.purchaseContractsByNo = seeded.purchaseContractsByNo;
  cache.containerByNo = seeded.containerContractsByNo;

  for (const record of normalizedRecords) {
    try {
      if (!record.customsName) {
        results.failed.push(buildImportError(record, IMPORT_ERRORS.missingCustomsName));
        continue;
      }
      const context = await buildImportRecordContext(record, cache, results);
      const { supplier, product, store, container, salesContract } = context;
      const { purchaseContractNo } = record;

      await attachPurchaseContractIfNeeded(purchaseContractNo, supplier, cache, results);

      // 6.1 创建销售合同明细（SalesItem）
      await addSalesItemIfNeeded(record, salesContract, product, store, cache, results);

      // 8. 创建装箱明细
      await addContainerItemIfNeeded(record, container, product, store, cache, results);
      
      // 9. 创建库存记录
      await addInventoryIfNeeded(record, product, container, results);
      
      results.success.push({
        seq: record.seq,
        customsName: record.customsName,
        storeName: record.storeName,
      });
      
    } catch (error) {
      results.failed.push({
        seq: record.seq,
        reason: getImportFailureMessage(error),
      });
    }
  }
  
  // 记录导入日志
  await prisma.importRecord.create({
    data: {
      fileName: 'web_upload',
      totalRows: records.length,
      successRows: results.success.length,
      failedRows: results.failed.length,
      status: 'COMPLETED',
      errorLog: results.failed.length > 0 ? JSON.stringify(results.failed) : null,
      importedBy: 'user',
    },
  });
  
  return results;
};

/**
 * 职责：获取导入历史记录
 * @returns {Array} 导入记录列表
 */
const getImportHistory = async () => {
  return prisma.importRecord.findMany({
    orderBy: { importedAt: 'desc' },
    take: 20,
  });
};

/**
 * 职责：获取数据库统计信息
 * @returns {Object} 统计信息
 */
const getDatabaseStats = async () => {
  const [
    suppliers,
    products,
    stores,
    salesContracts,
    packingItemsCount,
    salesItems,
    purchaseContracts,
    inventories,
  ] = await Promise.all([
    prisma.supplier.count(),
    prisma.product.count(),
    prisma.store.count(),
    prisma.salesContract.count(),
    prisma.packingItem.count(),
    prisma.salesItem.count(),
    prisma.purchaseContract.count(),
    prisma.inventory.count(),
  ]);
  
  return {
    suppliers,
    products,
    stores,
    containers: salesContracts,
    containerItems: packingItemsCount,
    salesContracts,
    salesItems,
    purchaseContracts,
    inventories,
  };
};

module.exports = {
  parseCSV,
  analyzeData,
  compareWithDatabase,
  importRecords,
  getImportHistory,
  getDatabaseStats,
};
