/**
 * Input: 出货汇总 XLSX、已确认的私有公司模板/商品资料、当期税库和本票参数
 * Output: 不写业务库的逐票定价结果、原版式合同/发票/箱单及报关预录信息
 * Pos: Excel 制单入口，复用 exportPacketService 的定价和利润口径
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');
const ExcelJS = require('exceljs');
const AdmZip = require('adm-zip');
const { SaxesParser } = require('saxes');
const { assertSafeOfficeArchive, assertSafeWorksheetRange } = require('../utils/tabularImport');
const config = require('../config');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { loadPricingConfig } = require('./pricingConfigService');
const { withCategoryChains } = require('./productCategoryChain');
const { round } = require('./exportPricing');
const { evaluateExportPacket } = require('./exportPacketService');
const { addCustomsPreentrySheet, shipmentDate, EXPORT_PACKAGE_KIND, EXPORT_PACKAGE_KIND_EN } = require('./customsPreentrySheet');
const { fetchUsdCnyRate } = require('../controllers/system/configController');

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const norm = (value) => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();
const todayInShanghai = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const profilePath = () => path.join(path.resolve(config.upload.dir), 'export-packet', 'profile.json');

const fetchCurrentRefundVersion = () => new Promise((resolve, reject) => {
  let settled = false;
  const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); if (error) reject(error); else resolve(value); };
  const request = https.get('https://jiangsu.chinatax.gov.cn/col/col15956/', (response) => {
    let data = ''; let size = 0;
    response.setEncoding('utf8');
    if (response.statusCode !== 200) { response.resume(); finish(new Error('Tax library index unavailable')); return; }
    response.on('data', (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > 1024 * 1024) { request.destroy(); finish(new Error('Tax library index too large')); return; }
      data += chunk;
    });
    response.on('error', (error) => finish(error));
    response.on('end', () => {
      const versions = [...data.matchAll(/出口退税率文库(?:CMCODE)?(20\d{2}[A-Z])(?:版|\.rar)/g)].map((match) => match[1]).sort();
      if (!versions.length) finish(new Error('Tax library version missing'));
      else finish(null, versions.at(-1));
    });
  });
  const timer = setTimeout(() => { request.destroy(); finish(new Error('Tax library lookup timed out')); }, 4000);
  request.on('error', (error) => finish(error));
});

const readCell = (cell) => {
  const value = cell.value;
  if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
    if (value.result === undefined || value.result === null) throw createError(`第 ${cell.row} 行 ${cell.address} 公式没有缓存值，请用 Excel/WPS 重新计算并保存`, 400);
    if (value.result?.error) throw createError(`第 ${cell.row} 行 ${cell.address} 公式结果错误`, 400);
    return value.result;
  }
  if (value?.error) throw createError(`第 ${cell.row} 行 ${cell.address} 存在 Excel 错误值`, 400);
  if (value?.richText) return value.richText.map((part) => part.text).join('');
  if (value?.text !== undefined) return value.text;
  return value;
};

const loadWorkbook = async (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4 || buffer.length > MAX_FILE_BYTES || buffer.subarray(0, 2).toString() !== 'PK') {
    throw createError('请上传不超过 10MB 的有效 Excel .xlsx 文件', 400);
  }
  try {
    assertSafeOfficeArchive(buffer, { maxEntries: 2000, maxUncompressedBytes: 60 * 1024 * 1024 });
    const entries = new AdmZip(buffer).getEntries();
    if (entries.length > 2000 || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 60 * 1024 * 1024) {
      throw createError('Excel 解压后超过允许的大小', 400);
    }
    for (const entry of entries.filter((item) => item.entryName === 'xl/workbook.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(item.entryName))) {
      const parser = new SaxesParser();
      parser.on('doctype', () => { throw createError('Excel 不支持DTD', 400); });
      parser.on('opentag', ({ name, attributes }) => {
        const tag = name.split(':').pop();
        if (entry.entryName === 'xl/workbook.xml') {
          if (tag === 'sheet' && (!/^\d+$/.test(attributes.sheetId || '') || Number(attributes.sheetId) < 1 || Number(attributes.sheetId) > 65535)) throw createError('Excel 工作表编号超出限制', 400);
          return;
        }
        const range = tag === 'mergeCell' || tag === 'dimension' ? attributes.ref : tag === 'c' ? attributes.r : null;
        if (range) assertSafeWorksheetRange({ '!ref': range }, { maxRows: 5001, maxCols: 100, maxCells: 500100 });
        if (tag === 'row' && Number(attributes.r) > 5001 || tag === 'col' && Number(attributes.max) > 16384) throw createError('Excel 超出行列限制', 400);
      });
      parser.write(entry.getData().toString('utf8')).close();
    }
    if (!entries.some((entry) => entry.entryName === 'xl/workbook.xml')) throw createError('文件不是有效的 Excel 工作簿', 400);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    return workbook;
  } catch (error) {
    if (error.statusCode === 400) throw error;
    throw createError('无法读取 Excel，请确认文件未加密且格式为 .xlsx', 400);
  }
};

const ALIASES = {
  name: ['报关名', '商品名称'], contractNo: ['合同号', '出口合同号'],
  quantity: ['数量', '报关数量'], unit: ['单位'], specification: ['规格', '包装规格'],
  boxes: ['箱数', '件数'], grossWeight: ['毛重', '毛重(kg)', '毛重（kg）'],
  netWeight: ['净重', '净重(kg)', '净重（kg）'], volume: ['体积', '体积(m3)', '体积（m³）'],
  broker: ['报关公司'], purchaseCost: ['采购金额', '采购成本'],
  unitPrice: ['出口单价(USD)', '出口单价（USD）', '美元单价', '出口单价'],
  hsCode: ['HS编码', 'HSCODE', 'HS Code'], declaration: ['申报要素', '申报明细'],
  origin: ['货源地', '境内货源地'], supplement: ['商品补充信息'],
  purchaseContractNo: ['购销合同号'], store: ['门店'], port: ['港口'],
  shippedAt: ['出货日期'], containerLabel: ['柜子编号'],
};
const REQUIRED_HEADERS = ['name', 'contractNo', 'quantity', 'unit', 'boxes', 'grossWeight', 'netWeight', 'volume', 'broker', 'purchaseCost'];
const optionalNumber = (value, label, sourceRow) => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = typeof value === 'string' ? value.trim().replace(/,/g, '') : value;
  if (typeof normalized === 'boolean' || !Number.isFinite(Number(normalized)) || Number(normalized) < 0) {
    throw createError(`第 ${sourceRow} 行“${label}”必须为非负数值`, 400);
  }
  return Number(normalized);
};

const parseShipmentWorkbook = async (buffer, contractNo) => {
  const workbook = await loadWorkbook(buffer);
  const sheet = workbook.getWorksheet('出货总清单') || workbook.worksheets.find((item) => item.getRow(1).values.some((value) => ['合同号', '出口合同号'].includes(value)));
  if (!sheet) throw createError('Excel 中没有“出货总清单”或包含合同号的明细表', 400);
  if (sheet.rowCount > 5000 || sheet.columnCount > 64) throw createError('出货明细最多支持 5000 行、64 列', 400);
  const columns = {};
  for (const [key, aliases] of Object.entries(ALIASES)) {
    columns[key] = [];
    sheet.getRow(1).eachCell((cell, index) => { if (aliases.some((alias) => norm(alias) === norm(readCell(cell)))) columns[key].push(index); });
  }
  const missing = REQUIRED_HEADERS.filter((key) => !columns[key].length).map((key) => ALIASES[key][0]);
  if (missing.length) throw createError(`Excel 缺少列：${missing.join('、')}`, 400);
  const valueAt = (row, key) => {
    const values = columns[key].map((column) => readCell(row.getCell(column))).filter((value) => value !== null && value !== undefined && value !== '');
    if (values.some((value) => norm(value) !== norm(values[0]))) throw createError(`第 ${row.number} 行“${ALIASES[key][0]}”别名列的值冲突`, 400);
    return values[0] ?? null;
  };
  const contractRows = new Map();
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index); const no = String(valueAt(row, 'contractNo') || '').trim().toUpperCase();
    if (!no) continue;
    if (!/^EXP\d{6,12}$/.test(no)) throw createError(`第 ${index} 行合同号格式无效`, 400);
    if (!contractRows.has(no)) contractRows.set(no, []);
    contractRows.get(no).push(index);
  }
  const contracts = [...contractRows].map(([no, rows]) => ({ contractNo: no, rowCount: rows.length }));
  const sourceVersion = crypto.createHash('sha256').update(buffer).digest('hex');
  const selected = contractNo ? String(contractNo).trim().toUpperCase() : contracts.length === 1 ? contracts[0].contractNo : null;
  if (!contracts.length) throw createError('Excel 中没有可用的 EXP 出货记录', 400);
  if (selected && !contractRows.has(selected)) throw createError('所选合同号不在当前 Excel 中，请重新选择', 400);
  if (!selected) return { contracts, selectedContractNo: null, rows: [], excludedRows: [], sourceVersion };
  const rows = []; const excludedRows = [];
  for (const sourceRow of contractRows.get(selected)) {
    const source = sheet.getRow(sourceRow);
    const broker = String(valueAt(source, 'broker') || '').trim();
    if (['其他厂家报关', '不报关', '埋单'].includes(broker)) {
      excludedRows.push({ sourceRow, productName: String(valueAt(source, 'name') || ''), broker });
      continue;
    }
    if (!['捷淞', '上海捷淞国际物流有限公司'].includes(broker)) throw createError(`第 ${sourceRow} 行报关公司未明确，无法确定四单归属`, 400);
    const entry = { id: `excel:${sourceVersion.slice(0, 12)}:${sourceRow}`, sourceRow, broker };
    for (const key of Object.keys(ALIASES)) entry[key] = valueAt(source, key);
    for (const key of ['quantity', 'boxes', 'grossWeight', 'netWeight', 'volume', 'purchaseCost', 'unitPrice']) entry[key] = optionalNumber(entry[key], ALIASES[key][0], sourceRow);
    for (const key of ['name', 'unit', 'specification', 'hsCode', 'declaration', 'origin']) entry[key] = String(entry[key] ?? '').trim();
    if (entry.boxes !== null && !Number.isInteger(entry.boxes)) throw createError(`第 ${sourceRow} 行箱数必须为整数`, 400);
    if (entry.hsCode && !/^\d{10}$/.test(entry.hsCode)) throw createError(`第 ${sourceRow} 行 HS 编码必须为10位数字`, 400);
    rows.push(entry);
  }
  if (rows.length > 500) throw createError('每票四单最多支持 500 行商品', 400);
  return { contracts, selectedContractNo: selected, rows, excludedRows, sourceVersion };
};

const loadProfile = async () => {
  const file = profilePath();
  try {
    const directory = await fs.lstat(path.dirname(file));
    if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077)) throw createError('四单模板目录权限无效，请管理员检查配置', 503);
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 16 * 1024 * 1024) throw createError('四单模板存储不安全，请管理员检查配置', 503);
    const profile = JSON.parse(await fs.readFile(file, 'utf8'));
    if (profile.version !== 1 || !profile.templateBase64 || !Array.isArray(profile.goods) || !Array.isArray(profile.refundLibrary?.records)) throw new Error('Invalid profile');
    return profile;
  } catch (error) {
    if (error.statusCode) throw error;
    throw createError('尚未配置出口四单模板及税库，请管理员运行 setup-export-packet', 503);
  }
};

const lookupRefund = (library, hsCode, day) => {
  if (!hsCode) return null;
  const key = day.replace(/-/g, '');
  const matches = library.records.filter((record) => /^\d{8,10}$/.test(record.code)
    && hsCode.startsWith(record.code) && record.startDate <= key && record.endDate >= key);
  const longest = Math.max(0, ...matches.map((record) => record.code.length));
  const applicable = matches.filter((record) => record.code.length === longest);
  if (!applicable.length || new Set(applicable.map((record) => record.rate)).size !== 1) return null;
  return applicable[0];
};

const prepareExcelPacket = async (buffer, options = {}, dependencies = {}) => {
  const parsed = await parseShipmentWorkbook(buffer, options.contractNo);
  if (options.sourceVersion && options.sourceVersion !== parsed.sourceVersion) throw createError('Excel 来源已变化，请重新读取后生成', 409);
  const profile = dependencies.profile || await loadProfile();
  const pricingConfig = dependencies.pricingConfig || loadPricingConfig();
  const today = dependencies.today || todayInShanghai();
  const input = { ...profile.defaults, documentDate: today, packageKind: EXPORT_PACKAGE_KIND };
  for (const key of ['sellerName', 'buyerName', 'tradeTerm', 'documentDate']) {
    if (options[key] !== undefined) {
      if (typeof options[key] !== 'string' || options[key].length > 500) throw createError(`制单参数 ${key} 格式无效`, 400);
      input[key] = options[key].trim();
    }
  }
  if (input.sellerName !== profile.defaults.sellerName) throw createError('卖方与已配置四单模板不一致，请更新公司模板', 400);
  const parsedDate = new Date(`${input.documentDate}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.documentDate) || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input.documentDate) throw createError('单证日期无效', 400);
  const result = { contracts: parsed.contracts, sourceVersion: parsed.sourceVersion, selectedContractNo: parsed.selectedContractNo, excludedRows: parsed.excludedRows, input, taxVersion: profile.refundLibrary.version, packet: null };
  if (!parsed.selectedContractNo) return result;
  if (options.spotRate !== undefined && (!Number.isFinite(Number(options.spotRate)) || Number(options.spotRate) <= Math.max(0, -pricingConfig.exchangeAdjustment) || Number(options.spotRate) >= 20)) throw createError('现汇加调整必须大于0，且现汇小于20', 400);
  if (options.priceOverrides !== undefined && (!Array.isArray(options.priceOverrides) || options.priceOverrides.length > 500)) throw createError('人工价格格式无效', 400);
  const ids = new Set(parsed.rows.map((row) => row.id));
  for (const entry of options.priceOverrides || []) {
    if (!ids.has(entry?.packingItemId) || !Number.isFinite(entry.unitPriceUsd) || entry.unitPriceUsd <= 0) throw createError('人工价格必须为本票商品的正数单价', 400);
  }
  input.priceOverrides = parsed.rows.filter((row) => row.unitPrice > 0)
    .map((row) => ({ packingItemId: row.id, unitPriceUsd: row.unitPrice }));
  const explicit = new Map((options.priceOverrides || []).map((entry) => [entry.packingItemId, entry]));
  input.priceOverrides = [...input.priceOverrides.filter((entry) => !explicit.has(entry.packingItemId)), ...explicit.values()];
  let rateIssue = false;
  if (options.spotRate !== undefined) input.spotRate = Number(options.spotRate);
  else {
    try { input.spotRate = await (dependencies.getSpotRate || fetchUsdCnyRate)(); }
    catch { input.spotRate = 0; rateIssue = true; }
  }
  let goods = [...profile.goods];
  let products = [];
  let quotes = dependencies.historicalQuotes || profile.quotes || [];
  if (dependencies.useDatabase ?? !dependencies.profile) {
    products = await prisma.product.findMany({ where: { customsName: { in: [...new Set(parsed.rows.map((row) => row.name))] } }, select: { id: true, customsName: true, hsCode: true, declaration: true, specification: true, categoryId: true } });
    for (const product of products) if (!goods.some((item) => norm(item.name) === norm(product.customsName))) goods.push({ name: product.customsName, hsCode: product.hsCode, declaration: product.declaration });
    const history = products.length ? await prisma.packingItem.findMany({ where: { productId: { in: products.map((product) => product.id) }, unitPrice: { gt: 0 }, salesContract: { contractNo: { not: parsed.selectedContractNo } } }, include: { product: { select: { customsName: true } }, salesContract: { select: { contractNo: true, signedAt: true } } }, orderBy: { createdAt: 'desc' }, take: 2000 }) : [];
    quotes = [...quotes, ...await readConfirmedQuotes(), ...history.map((item) => ({ productName: item.product.customsName, specification: item.specification, unitPriceUsd: item.unitPrice, contractNo: item.salesContract.contractNo, date: item.salesContract.signedAt || item.createdAt }))];
  }
  quotes = quotes.filter((quote) => quote.confirmed || quote.contractNo !== parsed.selectedContractNo)
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    .map((quote) => ({ ...quote, productId: `catalog:${norm(quote.productName)}` }));
  const additionalIssues = [];
  const evidence = [];
  const items = parsed.rows.map((row) => {
    const candidates = goods.filter((good) => norm(good.name) === norm(row.name));
    const exact = candidates.filter((good) => good.specification && norm(good.specification) === norm(row.specification));
    const eligible = exact.length ? exact : candidates.filter((good) => !good.specification);
    const distinct = new Map(eligible.map((good) => [JSON.stringify([good.hsCode, good.declaration, good.origin]), good]));
    const good = distinct.size === 1 ? [...distinct.values()][0] : {};
    if (distinct.size > 1 && !(row.hsCode && row.declaration && row.origin)) additionalIssues.push({ code: 'AMBIGUOUS_PRODUCT', severity: 'error', productName: row.name, message: `第 ${row.sourceRow} 行存在多个商品档案，请在Excel明确HS、要素和货源地` });
    const hsCode = row.hsCode || String(good.hsCode || '');
    const declaration = row.declaration || good.declaration || '';
    const origin = row.origin || good.origin || '';
    const shippedAt = shipmentDate(row.shippedAt);
    const refundDay = shippedAt || input.documentDate;
    const refund = lookupRefund(profile.refundLibrary, hsCode, refundDay);
    if (!origin) additionalIssues.push({ code: 'MISSING_ORIGIN', severity: 'error', productName: row.name, message: `第 ${row.sourceRow} 行缺少已确认货源地` });
    evidence.push({ packingItemId: row.id, productName: row.name, hsCode, declarationElements: declaration, origin, unit: row.unit, hsSource: row.hsCode ? 'excel' : 'saved_catalog', hsEvidence: refund ? { refundRate: refund.rate, version: profile.refundLibrary.version } : null });
    return { ...row, shippedAt, productId: `catalog:${norm(row.name)}`, origin, declarationElements: declaration, hsCode, product: { customsName: row.name, declaration, hsCode }, store: { name: row.store || '' } };
  });
  const matchedItems = await withCategoryChains(items.map((item) => {
    const matches = products.filter((product) => norm(product.customsName) === norm(item.name)
      && norm(product.specification) === norm(item.specification));
    return matches.length === 1 ? { ...item, product: { ...item.product, categoryId: matches[0].categoryId } } : item;
  }), prisma);
  const contract = { id: `excel:${parsed.sourceVersion}`, contractNo: parsed.selectedContractNo, packingItems: matchedItems, exchangeRate: input.spotRate };
  const packet = evaluateExportPacket(contract, { lines: evidence }, quotes, input, pricingConfig);
  // Excel 中明确的人工价保留，目标偏离只提示；完整性/税库错误仍阻断。
  for (const issue of packet.issues) if (issue.code === 'MARKUP_OUTSIDE_POLICY') issue.severity = 'warning';
  for (const line of packet.lines) {
    if (line.refundRate === null && line.pricingSource === 'formula') line.unitPriceUsd = 0;
    line.totalUsd = Math.ceil((line.unitPriceUsd * line.quantity - 1e-10) * 10) / 10;
    if (!Number.isFinite(line.totalUsd) || line.totalUsd <= 0) additionalIssues.push({ code: 'INVALID_LINE_AMOUNT', severity: 'error', productName: line.productName, message: '数量或单价无法形成有效金额，请核对源表' });
  }
  packet.summary.totalUsd = round(packet.lines.reduce((sum, line) => sum + line.totalUsd, 0), 1);
  packet.summary.revenueCny = round(packet.summary.totalUsd * packet.pricingPolicy.effectiveRate, 2);
  packet.summary.grossProfitCny = round(packet.summary.revenueCny - packet.summary.purchaseCostCny, 2);
  packet.summary.costMarkupRate = packet.summary.purchaseCostCny > 0 ? packet.summary.grossProfitCny / packet.summary.purchaseCostCny : null;
  packet.summary.salesGrossMarginRate = packet.summary.revenueCny > 0 ? packet.summary.grossProfitCny / packet.summary.revenueCny : null;
  if (rateIssue) additionalIssues.push({ code: 'FX_UNAVAILABLE', severity: 'error', message: '当前汇率读取失败，请填写本票现汇后生成' });
  try {
    const latest = await (dependencies.getRefundVersion || module.exports.fetchCurrentRefundVersion)();
    if (latest !== profile.refundLibrary.version) additionalIssues.push({ code: 'REFUND_LIBRARY_UPDATE_REQUIRED', severity: 'error', message: `官方税库已更新为 ${latest}，请管理员更新当前 ${profile.refundLibrary.version} 资料后生成` });
  } catch {
    additionalIssues.push({ code: 'REFUND_LIBRARY_LOOKUP_FAILED', severity: 'error', message: '当期税库版本核对失败，请稍后重新计算' });
  }
  packet.issues.push(...additionalIssues);
  packet.ready = !packet.issues.some((issue) => issue.severity === 'error');
  packet.summary.errorCount = packet.issues.filter((issue) => issue.severity === 'error').length;
  packet.summary.warningCount = packet.issues.filter((issue) => issue.severity === 'warning').length;
  packet.lines.forEach((line, index) => { line.sourceRow = parsed.rows[index].sourceRow; });
  const packetVersion = crypto.createHash('sha256').update(JSON.stringify({ sourceVersion: parsed.sourceVersion, input, lines: packet.lines, summary: packet.summary, pricingConfig, taxVersion: result.taxVersion })).digest('hex');
  if (options.packetVersion && options.packetVersion !== packetVersion) throw createError('制单依据已变化，请重新计算后生成', 409);
  return { ...result, input, packet, packetVersion };
};

const templateSheets = (workbook) => ['合同', '发票', '箱单'].map((name) => {
  const sheet = workbook.worksheets.find((item) => ({ 外销合同: '合同', 商业发票: '发票', 装箱单: '箱单' }[norm(item.name)] || norm(item.name)) === name);
  if (!sheet || !String(sheet.getCell('A8').text).includes('Item')) throw createError('四单模板应包含原版合同、发票、箱单，明细表头在第8行', 400);
  return sheet;
});

const buildTemplatePacket = async (packet, templateBuffer) => {
  const workbook = await loadWorkbook(templateBuffer);
  const sheets = templateSheets(workbook);
  for (const sheet of [...workbook.worksheets]) if (!sheets.includes(sheet)) workbook.removeWorksheet(sheet.id);
  sheets.forEach((sheet, index) => { sheet.name = ['合同', '发票', '箱单'][index]; });
  const extra = Math.max(0, packet.lines.length - 16);
  const totalRow = 25 + extra;
  for (const [index, sheet] of sheets.entries()) {
    if (extra) {
      const merges = [...sheet.model.merges];
      merges.forEach((range) => sheet.unMergeCells(range));
      sheet.spliceRows(25, 0, ...Array.from({ length: extra }, () => []));
      for (let row = 25; row < totalRow; row += 1) {
        sheet.getRow(row).height = sheet.getRow(24).height;
        for (let col = 1; col <= (index === 2 ? 12 : 6); col += 1) sheet.getCell(row, col).style = structuredClone(sheet.getCell(24, col).style);
      }
      merges.forEach((range) => sheet.mergeCells(range.replace(/([A-Z]+)(\d+)/g, (_, col, row) => `${col}${Number(row) >= 25 ? Number(row) + extra : row}`)));
    }
    for (let row = 9; row < totalRow; row += 1) for (let col = 1; col <= (index === 2 ? 12 : 6); col += 1) sheet.getCell(row, col).value = null;
    sheet.pageSetup.printArea = index === 2 ? `A1:H${27 + extra}` : `A1:F${44 + extra}`;
  }
  const [contract, invoice, packing] = sheets;
  const documentDate = new Date(`${packet.documentDate}T00:00:00Z`);
  const month = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'][documentDate.getUTCMonth()];
  contract.getCell('F3').value = `NO.: ${packet.contractNo}`;
  contract.getCell('F4').value = `Date: ${month}${documentDate.getUTCDate()}, ${documentDate.getUTCFullYear()}`;
  if (!String(contract.getCell('B5').text).includes(packet.sellerName)) contract.getCell('B5').value = packet.sellerName;
  contract.getCell('B6').value = packet.buyerName;
  for (const sheet of [contract, invoice]) {
    const tradeCell = sheet.getCell(`A${28 + extra}`);
    if (tradeCell.value && !String(tradeCell.text).includes(packet.tradeTerm)) tradeCell.value = `（3）Trade term: ${packet.tradeTerm}.`;
    const packingCell = sheet.getCell(`A${30 + extra}`);
    packingCell.value = `（5）Packing: To be packed in ${EXPORT_PACKAGE_KIND_EN}.`;
  }
  const ref = (sheet, address, result) => ({ formula: `'${sheet}'!${address}`, result });
  for (const sheet of [invoice, packing]) {
    sheet.getCell('A1').value = ref('合同', 'A1', contract.getCell('A1').value);
    sheet.getCell('B5').value = ref('合同', 'B5', contract.getCell('B5').value);
    sheet.getCell('B6').value = ref('合同', 'B6', packet.buyerName);
    sheet.getCell(sheet === invoice ? 'F3' : 'H3').value = ref('合同', 'F3', contract.getCell('F3').value);
    sheet.getCell(sheet === invoice ? 'F4' : 'H4').value = ref('合同', 'F4', contract.getCell('F4').value);
  }
  packet.lines.forEach((line, index) => {
    const row = 9 + index;
    contract.getRow(row).values = [index + 1, line.productName, line.specification, line.quantity, line.unitPriceUsd, { formula: `ROUNDUP(D${row}*E${row},1)`, result: line.totalUsd }];
    const digits = (String(line.unitPriceUsd).split('.')[1] || '').length;
    contract.getCell(row, 5).numFmt = `"$"#,##0.${'0'.repeat(Math.max(1, digits))}`;
    for (let col = 1; col <= 6; col += 1) {
      const cell = contract.getCell(row, col); const value = cell.value?.result ?? cell.value;
      invoice.getCell(row, col).value = ref('合同', cell.address, value);
    }
    invoice.getCell(row, 5).numFmt = contract.getCell(row, 5).numFmt;
    packing.getRow(row).values = [index + 1, line.productName, line.hsCode, line.specification, line.boxes, line.grossWeight, line.netWeight, line.volume, line.quantity, line.unit, line.declaration, line.origin];
  });
  for (const sheet of [contract, invoice]) {
    sheet.getCell(`D${totalRow}`).value = null;
    sheet.getCell(`F${totalRow}`).value = { formula: `SUM(F9:F${totalRow - 1})`, result: packet.summary.totalUsd };
    sheet.getCell(`A${44 + extra}`).value = ref('合同', 'B5', contract.getCell('B5').value);
    sheet.getCell(`D${44 + extra}`).value = ref('合同', 'B6', packet.buyerName);
  }
  for (const [col, key] of [['E', 'boxes'], ['F', 'grossWeight'], ['G', 'netWeight'], ['H', 'volume']]) packing.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}9:${col}${totalRow - 1})`, result: packet.summary[key] };
  packing.getCell(`A${27 + extra}`).value = ref('合同', 'B5', contract.getCell('B5').value);
  packing.getCell(`E${27 + extra}`).value = ref('合同', 'B6', packet.buyerName);
  addCustomsPreentrySheet(workbook, packet);
  workbook.calcProperties.fullCalcOnLoad = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const generateExcelPacket = async (buffer, options = {}, dependencies = {}) => {
  const profile = dependencies.profile || await loadProfile();
  const result = await prepareExcelPacket(buffer, options, { ...dependencies, profile, useDatabase: dependencies.useDatabase ?? !dependencies.profile });
  if (!result.packet?.ready) throw createError(result.packet?.issues.find((issue) => issue.severity === 'error')?.message || '请选择本票合同号', 400);
  const output = await buildTemplatePacket(result.packet, Buffer.from(profile.templateBase64, 'base64'));
  if (!dependencies.profile) await saveManualQuotes(result.packet);
  return { ...result, buffer: output, filename: `出口四单+${result.packet.contractNo}.xlsx` };
};

// shortcut: 逐文件读取人工报价，历史达到数千票时迁移到已有数据库索引。
const readConfirmedQuotes = async (directory = path.dirname(profilePath())) => {
  const names = (await fs.readdir(directory)).filter((name) => /^quotes-[a-f0-9]{64}\.json$/.test(name));
  const quotes = [];
  for (const name of names) {
    const file = path.join(directory, name); const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.size > 1024 * 1024) throw createError('历史报价存储权限或大小无效', 503);
    const rows = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!Array.isArray(rows) || rows.length > 500 || rows.some((row) => !row.productName || !row.specification || !(row.unitPriceUsd > 0) || !Number.isFinite(row.unitPriceUsd))) throw createError('历史报价格式无效', 503);
    quotes.push(...rows.map((row) => ({ ...row, confirmed: true })));
  }
  return quotes;
};

const saveManualQuotes = async (packet, directory = path.dirname(profilePath())) => {
  const quotes = packet.lines.filter((line) => line.pricingSource === 'manual').map((line) => ({
    productName: line.productName, specification: line.specification, unitPriceUsd: line.unitPriceUsd,
    contractNo: packet.contractNo, storeName: line.storeName || '',
  }));
  if (!quotes.length) return;
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw createError('历史报价目录权限无效', 503);
  const hash = crypto.createHash('sha256').update(JSON.stringify(quotes)).digest('hex');
  const file = path.join(directory, `quotes-${hash}.json`);
  const temporary = path.join(directory, `quotes-${crypto.randomUUID()}.tmp`);
  const confirmedAt = new Date().toISOString();
  try {
    await fs.writeFile(temporary, JSON.stringify(quotes.map((quote) => ({ ...quote, date: confirmedAt }))), { mode: 0o600, flag: 'wx' });
    // 完整写入后原子发布；重复下载不产生重复历史，也不覆盖既有记录。
    await fs.link(temporary, file).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  } finally { await fs.rm(temporary, { force: true }); }
};

const installProfile = async (profile) => {
  const file = profilePath(); const root = path.dirname(path.dirname(file));
  await fs.mkdir(root, { recursive: true });
  const directory = path.dirname(file);
  await fs.mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(directory) !== path.join(await fs.realpath(root), 'export-packet')) throw createError('四单模板存储路径无效', 400);
  await fs.chmod(directory, 0o700);
  try {
    const previous = await fs.lstat(file);
    if (!previous.isFile() || previous.isSymbolicLink()) throw createError('四单模板文件路径无效', 400);
    await fs.copyFile(file, `${file}.${Date.now()}.bak`);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(profile), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
};

module.exports = { readConfirmedQuotes, saveManualQuotes, MAX_FILE_BYTES, readCell, loadWorkbook, profilePath, loadProfile, installProfile, templateSheets, parseShipmentWorkbook, prepareExcelPacket, buildTemplatePacket, generateExcelPacket, todayInShanghai, fetchCurrentRefundVersion };
