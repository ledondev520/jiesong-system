/**
 * Input: 每次出货的报关商品行、采购/票面事实、归档三单和当前准备度
 * Output: 自动核验的出货清单、绑定材料版本的确认归档、全量月度准备工作簿
 * Pos: 复用现有准备、发票核验和 fileService；不创建正式申报或修改退税金额
 */
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { getExportReadiness } = require('./exportReadinessService');
const { buildTaxRefundPreparation, buildTaxRefundPreparationWorkbook } = require('./taxRefundPreparationService');
const { normalizeInvoiceNumbers } = require('./purchaseInvoiceService');
const { verifyShipmentInvoices } = require('./invoiceVerificationService');
const { buildShipmentInvoiceRows } = require('./taxRefundWorkbenchService');
const fileService = require('./fileService');
const { isJiesongOwnedPackingItem } = require('./salesContractAmount');
const { EXPORT_PACKET_DESCRIPTION, buildPackingSourceVersion } = require('./exportPacketService');

const CONFIRM_PREFIX = '退税出货清单确认:';
const submitted = new Set(['APPLIED', 'APPROVED', 'REFUNDED']);
const aliases = value => [value, value?.replace(/^CG/i, 'PO'), value?.replace(/^PO/i, 'CG')].filter(Boolean);
const monthOf = value => value && !Number.isNaN(new Date(value).getTime())
  ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date(value)).slice(0, 7) : null;
const validateMonth = month => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw createError('申报月份必须为 YYYY-MM', 400);
  return month;
};
const sourceInclude = {
  packingItems: { include: { product: { select: { id: true, customsName: true, unit: true, hsCode: true, declaration: true } } }, orderBy: { createdAt: 'asc' } },
  customsDeclarations: { include: { items: true }, orderBy: { createdAt: 'asc' } },
  taxRefunds: true, forexVerifications: true,
  packingListChecks: { include: { file: true }, orderBy: { checkedAt: 'desc' } },
  files: { orderBy: { uploadedAt: 'desc' } },
};
const publicFile = file => file ? { id: file.id, fileName: file.fileName, uploadedAt: file.uploadedAt } : null;

const buildShipmentPreparation = ({ salesContract, purchases = [], declaration = null, invoiceRecords = [], exportReadiness = {}, invoiceUsages = {}, invoiceAllocations = {} }) => {
  const scopeIssues = [];
  const allDeclarations = (salesContract.customsDeclarations || []).filter(x => x.status !== 'VOID');
  const declaredIds = new Set((declaration?.items || []).map(x => x.packingItemId).filter(Boolean));
  // ponytail: 无明确商品行关联的分批出货先阻断；需要拆分时补实际 packingItemId，不猜金额份额。
  const packingItems = (salesContract.packingItems || []).filter(x => isJiesongOwnedPackingItem(x)
    && (!declaration || allDeclarations.length <= 1 || declaredIds.has(x.id)));
  if (declaration && allDeclarations.length > 1 && (declaration.items || []).some(x => !x.packingItemId)) scopeIssues.push('分批出货的报关商品行尚未明确关联装箱明细');
  const nos = new Set(packingItems.flatMap(x => aliases(x.purchaseContractNo)));
  const linkedPurchases = purchases.filter(x => nos.has(x.contractNo));
  const contract = { ...salesContract, packingItems, customsDeclarations: declaration ? [declaration] : [], taxRefunds: (salesContract.taxRefunds || []).filter(x => !declaration || x.customsDeclarationId === declaration.id) };
  const preparation = buildTaxRefundPreparation({ salesContract: contract, packingSourceSalesContract: salesContract, purchases: linkedPurchases, exportReadiness });
  const purchaseMap = new Map(linkedPurchases.flatMap(x => aliases(x.contractNo).map(no => [no, x])));
  const invoiceVerification = verifyShipmentInvoices({ shipmentRows: buildShipmentInvoiceRows(contract, purchaseMap), invoiceRecords });
  for (const result of invoiceVerification.results) {
    if ((invoiceUsages[result.invoiceNo] || []).length > 1 && !invoiceAllocations[result.invoiceNo]?.verified) scopeIssues.push(`发票 ${result.invoiceNo} 涉及多次出货，总数量/金额尚未守恒，需补齐实际份额`);
  }
  for (const result of invoiceVerification.results) {
    if (invoiceAllocations[result.invoiceNo]?.verified) {
      result.issues = result.issues.filter(issue => issue !== '价税合计与源表采购金额不一致');
      result.checks.total = true;
    }
    const actual = invoiceRecords.find(x => x.invNo === result.invoiceNo);
    const owners = linkedPurchases.filter(x => normalizeInvoiceNumbers(x.invoiceNo).includes(result.invoiceNo));
    if (actual && (owners.length !== 1 || actual.sellerTaxId !== owners[0]?.supplier?.taxId)) result.issues.push('发票销方税号与关联采购合同不一致');
    if (actual && Math.abs(Number(actual.amount) + Number(actual.tax) - Number(actual.total)) > 0.02) result.issues.push('发票金额、税额与价税合计不一致');
    if (actual && (!Number.isFinite(Number(actual.amount)) || Number(actual.amount) <= 0)) result.issues.push('发票不含税金额缺失或无效');
    const rateText = String(actual?.taxRate ?? '').trim();
    const parsedRate = Number(rateText.replace('%', ''));
    const rate = !rateText.includes('%') && parsedRate > 0 && parsedRate < 1 ? parsedRate * 100 : parsedRate;
    if (actual && (!Number.isFinite(rate) || rate !== Number(owners[0]?.taxRate))) result.issues.push('发票征税率与采购合同不一致');
    if (actual && (!actual.invDate || Number.isNaN(new Date(actual.invDate).getTime()))) result.issues.push('发票开票日期缺失或无效');
    if (actual && !/专用/.test(actual.invoiceType || '')) result.issues.push('进货凭证票种尚未核实为增值税专用发票');
    const rows = packingItems.filter(x => normalizeInvoiceNumbers(x.invoiceNo || purchaseMap.get(x.purchaseContractNo)?.invoiceNo).includes(result.invoiceNo));
    result.allocatedQuantity = rows.reduce((sum, x) => sum + Number(x.quantity || 0), 0);
    result.allocatedGrossAmount = result.expectedTotal;
    if (actual && actual.qty != null && (Number(actual.qty) !== (invoiceAllocations[result.invoiceNo]?.verified ? invoiceAllocations[result.invoiceNo].quantity : result.allocatedQuantity)
      || !rows.every(x => !actual.unit || x.unit === actual.unit))) result.issues.push('发票数量/单位与本次出货份额不一致');
    if (result.status !== 'MISSING') result.status = result.issues.length ? 'REVIEW' : 'PASS';
  }
  invoiceVerification.summary.pass = invoiceVerification.results.filter(x => x.status === 'PASS').length;
  invoiceVerification.summary.review = invoiceVerification.results.filter(x => x.status === 'REVIEW').length;
  for (const item of declaration?.items || []) {
    const matches = packingItems.filter(x => item.packingItemId ? x.id === item.packingItemId : x.productId === item.productId);
    if (matches.length !== 1 || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0
      || Number(item.quantity) !== Number(matches[0]?.quantity) || item.unit !== matches[0]?.unit) {
      scopeIssues.push(`${item.customsName || '报关商品'} 的数量/单位或出货行关联需补齐`);
    }
    if ((declaration.currency || 'USD') === 'USD' && matches.length === 1 && item.totalPrice != null
      && matches[0].totalPrice != null && Math.abs(Number(item.totalPrice) - Number(matches[0].totalPrice)) > 0.02) {
      scopeIssues.push(`${item.customsName || '报关商品'} 的报关金额与本次商业发票金额有差异，需核对成交价或运保费依据`);
    }
  }
  if (!['SHIPPED', 'ARRIVED', 'COMPLETED'].includes(salesContract.status) || !salesContract.shippedAt) scopeIssues.push('尚未登记本次发运');
  if (!declaration || declaration.status !== 'RELEASED' || !monthOf(declaration.exportDate)) scopeIssues.push('缺少已放行报关单或出口日期');
  if (!packingItems.length || packingItems.some(x => !purchaseMap.has(x.purchaseContractNo))) scopeIssues.push('本次出货尚未完整关联采购来源');
  const packet = (salesContract.files || []).find(x => x.category === 'SYSTEM_GENERATED_XLSX'
    && String(x.description || '').startsWith(EXPORT_PACKET_DESCRIPTION));
  const packetCurrent = /^[a-f0-9]{64}$/.test(packet?.checksum || '')
    && packet?.description === `${EXPORT_PACKET_DESCRIPTION}:${buildPackingSourceVersion(salesContract.packingItems || [])}`;
  const signed = (salesContract.files || []).find(x => x.category === 'SIGNED_CONTRACT');
  preparation.checklist.unshift({ id: 'export-packet', category: '出货资料', requirement: 'required', label: '本次外销合同、商业发票、装箱单', status: packetCurrent ? 'ready' : 'missing', evidence: packet?.fileName || null, message: packetCurrent ? '三单版本与当前出货明细一致；签署件另行登记' : packet ? '三单版本需更新，请在出口三单工作台重新确认生成' : '请在出口三单工作台确认并生成三单' });
  preparation.checklist.push({ id: 'sales-signed-contract', category: '备案单证', requirement: 'post_submission', label: '外销签署合同', status: signed ? 'ready' : 'review', evidence: signed?.fileName || null, message: signed ? '外销签署件已归档' : '需补外销签署件；系统生成版本不代表已签署' });
  if (!signed) preparation.warnings.push('需补外销签署件；系统生成版本不代表已签署');
  const invoiceCheck = preparation.checklist.find(x => x.id === 'invoice-portal-verification');
  invoiceCheck.label = '进项发票台账自动核验';
  invoiceCheck.status = invoiceVerification.results.length > 0 && invoiceVerification.results.every(x => x.status === 'PASS') ? 'ready' : 'missing';
  invoiceCheck.message = invoiceCheck.status === 'ready' ? '销方、税号、品名、金额和状态一致；税局用途状态仍需线上核对'
    : invoiceVerification.results.flatMap(x => x.issues.map(issue => `${x.invoiceNo || '缺票号'}：${issue}`)).join('；') || '缺少可核验的进项发票';
  const materialBlockers = [...new Set([...scopeIssues, ...preparation.checklist.filter(x => !['export-detail-form', 'purchase-detail-form'].includes(x.id)
    && (x.requirement === 'required' || x.id === invoiceCheck.id) && x.status !== 'ready').map(x => x.message)])];
  // 确认仅绑定实际资料与核验结果，排除确认文件本身，重复读取不会让版本失效。
  const sourceVersion = crypto.createHash('sha256').update(JSON.stringify({
    id: salesContract.id, shippedAt: salesContract.shippedAt, declaration, packingItems,
    purchases: linkedPurchases, packet: publicFile(packet), signed: publicFile(signed),
    files: (salesContract.files || []).filter(x => !String(x.description || '').startsWith(CONFIRM_PREFIX)),
    checks: salesContract.packingListChecks || [], invoices: invoiceVerification.results,
    invoiceFacts: invoiceRecords.filter(x => invoiceVerification.results.some(result => result.invoiceNo === x.invNo)).map(x => ({
      invNo: x.invNo, taxRate: x.taxRate, qty: x.qty, unit: x.unit, invoiceType: x.invoiceType, buyerTaxId: x.buyerTaxId,
    })),
    readiness: { ready: exportReadiness.taxRefundReady, lines: exportReadiness.lines, issues: exportReadiness.issues },
    materialBlockers,
    allocations: invoiceVerification.results.map(x => ({ invoiceNo: x.invoiceNo,
      usages: [...(invoiceUsages[x.invoiceNo] || [])].sort(), allocation: invoiceAllocations[x.invoiceNo] })),
  })).digest('hex');
  const confirmationDescription = `${CONFIRM_PREFIX}${declaration?.id || 'pending'}:${sourceVersion}`;
  const confirmedFile = (salesContract.files || []).find(x => x.category === 'SYSTEM_GENERATED_XLSX'
    && /^[a-f0-9]{64}$/.test(x.checksum || '') && x.description === confirmationDescription);
  const hasPrevious = (salesContract.files || []).some(x => String(x.description || '').startsWith(`${CONFIRM_PREFIX}${declaration?.id || 'pending'}:`));
  return { ...preparation, shipmentKey: `${salesContract.id}:${declaration?.id || 'pending'}`, customsDeclarationId: declaration?.id || null,
    declarationNo: declaration?.declarationNo || null, declarationStatus: declaration?.status || null, shippedAt: salesContract.shippedAt, contractStatus: salesContract.status, exportDate: declaration?.exportDate || null,
    materialReady: materialBlockers.length === 0, materialBlockers, invoiceVerification,
    documentFiles: [packet, signed].filter(Boolean).map(publicFile),
    sourceVersion, confirmationDescription, confirmedFile: publicFile(confirmedFile),
    confirmationStatus: confirmedFile ? 'CONFIRMED' : hasPrevious ? 'CHANGED' : 'PENDING',
    declarations: allDeclarations.map(x => ({ id: x.id, declarationNo: x.declarationNo, exportDate: x.exportDate })),
  };
};

const loadEvidence = async (contracts, prismaClient) => {
  const contractNos = [...new Set(contracts.flatMap(x => (x.packingItems || []).flatMap(p => aliases(p.purchaseContractNo))))];
  const purchases = contractNos.length ? await prismaClient.purchaseContract.findMany({ where: { contractNo: { in: contractNos } }, include: { supplier: { select: { id: true, name: true, taxId: true } }, items: { include: { product: { select: { id: true, customsName: true, unit: true } } } }, files: true } }) : [];
  const invoiceNumbers = [...new Set([...purchases.map(x => x.invoiceNo), ...contracts.flatMap(x => (x.packingItems || []).map(p => p.invoiceNo))].flatMap(normalizeInvoiceNumbers))];
  const invoiceRecords = invoiceNumbers.length ? await prismaClient.invoiceRecord.findMany({ where: { invNo: { in: invoiceNumbers } }, orderBy: [{ invNo: 'asc' }, { invDate: 'desc' }] }) : [];
  const invoiceUsages = {};
  const allocationRows = [];
  const allocationFacts = {};
  const purchaseMap = new Map(purchases.flatMap(x => aliases(x.contractNo).map(no => [no, x])));
  for (const contract of contracts) {
    const declarations = (contract.customsDeclarations || []).filter(x => x.status !== 'VOID');
    for (const declaration of declarations.length ? declarations : [null]) {
      const ids = new Set((declaration?.items || []).map(x => x.packingItemId).filter(Boolean));
      const packingItems = (contract.packingItems || []).filter(x => isJiesongOwnedPackingItem(x) && (!declaration || declarations.length <= 1 || ids.has(x.id)));
      allocationRows.push(...buildShipmentInvoiceRows({ ...contract, packingItems }, purchaseMap));
      for (const row of packingItems) {
        for (const no of normalizeInvoiceNumbers(row.invoiceNo || purchaseMap.get(row.purchaseContractNo)?.invoiceNo)) {
          const facts = allocationFacts[no] ||= [];
          facts.push({ quantity: Number(row.quantity), unit: row.unit, explicit: Number(row.purchaseCost) > 0 && normalizeInvoiceNumbers(row.invoiceNo || purchaseMap.get(row.purchaseContractNo)?.invoiceNo).length === 1 });
          const keys = invoiceUsages[no] ||= [];
          const key = `${contract.id}:${declaration?.id || 'pending'}`;
          if (!keys.includes(key)) keys.push(key);
        }
      }
    }
  }
  const pooled = verifyShipmentInvoices({ shipmentRows: allocationRows, invoiceRecords });
  const invoiceAllocations = {};
  for (const result of pooled.results) {
    const facts = allocationFacts[result.invoiceNo] || [];
    const actual = invoiceRecords.find(x => x.invNo === result.invoiceNo);
    const quantity = facts.reduce((sum, x) => sum + x.quantity, 0);
    invoiceAllocations[result.invoiceNo] = { quantity, verified: result.status === 'PASS' && facts.every(x => x.explicit && Number.isFinite(x.quantity) && x.quantity > 0 && actual?.unit && actual.unit === x.unit)
      && actual?.qty != null && quantity === Number(actual.qty) };
  }
  return { purchases, invoiceRecords, invoiceUsages, invoiceAllocations };
};

const getShipmentPreparation = async (salesContractId, customsDeclarationId, { prismaClient = prisma, readinessLoader = getExportReadiness } = {}) => {
  const salesContract = await prismaClient.salesContract.findUnique({ where: { id: salesContractId }, include: sourceInclude });
  if (!salesContract) throw createError('出口合同不存在', 404);
  const declarations = (salesContract.customsDeclarations || []).filter(x => x.status !== 'VOID');
  const declaration = customsDeclarationId ? declarations.find(x => x.id === customsDeclarationId) : declarations[0];
  if (customsDeclarationId && !declaration) throw createError('报关单不属于当前出货', 404);
  const related = await prismaClient.salesContract.findMany({ where: { status: { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] } }, include: sourceInclude });
  const evidence = await loadEvidence(related.some(x => x.id === salesContract.id) ? related : [...related, salesContract], prismaClient);
  const exportReadiness = await readinessLoader(salesContractId);
  return buildShipmentPreparation({ salesContract, declaration, ...evidence, exportReadiness });
};

const listShipmentPreparations = async ({ filingMonth } = {}, { prismaClient = prisma, readinessLoader = getExportReadiness } = {}) => {
  validateMonth(filingMonth);
  const contracts = await prismaClient.salesContract.findMany({ where: { status: { in: ['SHIPPED', 'ARRIVED', 'COMPLETED'] } }, include: sourceInclude, orderBy: [{ shippedAt: 'asc' }, { contractNo: 'asc' }] });
  const evidence = await loadEvidence(contracts, prismaClient);
  const items = [];
  for (const salesContract of contracts) {
    if (salesContract.hasTaxRefund === false || !(salesContract.packingItems || []).some(isJiesongOwnedPackingItem)) continue;
    const declarations = (salesContract.customsDeclarations || []).filter(x => x.status !== 'VOID');
    const pending = (declarations.length ? declarations : [null]).filter(declaration => (
      !declaration || !(salesContract.taxRefunds || []).some(x => x.customsDeclarationId === declaration.id && submitted.has(x.status))
    )).filter(declaration => { const month = monthOf(declaration?.exportDate || salesContract.shippedAt); return !month || month < filingMonth; });
    if (!pending.length) continue;
    // ponytail: 复用每合同一次的准备度加载；月度规模变大时再批量加载税率，不新增缓存层。
    const exportReadiness = await readinessLoader(salesContract.id);
    for (const declaration of pending) items.push(buildShipmentPreparation({ salesContract, declaration, ...evidence, exportReadiness }));
  }
  return items;
};

const confirmShipmentPreparation = async (salesContractId, input = {}, options = {}) => {
  if (!input.customsDeclarationId || !/^[a-f0-9]{64}$/.test(input.sourceVersion || '')) throw createError('材料已有变化，请刷新清单后确认', 409);
  const preparation = await getShipmentPreparation(salesContractId, input.customsDeclarationId, options);
  if (preparation.sourceVersion !== input.sourceVersion) throw createError('材料已有变化，请刷新清单后确认', 409);
  if (!preparation.materialReady) throw createError(`出货资料仍有 ${preparation.materialBlockers.length} 项差异，请刷新清单补齐后确认`, 409);
  if (preparation.confirmedFile) return { preparation, file: preparation.confirmedFile };
  const buffer = await buildTaxRefundPreparationWorkbook({ ...preparation, confirmationStatus: 'CONFIRMED' });
  const file = await fileService.archiveGeneratedFile({ contractId: salesContractId, contractType: fileService.CONTRACT_TYPE.SALES,
    buffer, fileName: `退税出货清单-${preparation.contractNo}-${preparation.declarationNo}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    category: fileService.CONTRACT_FILE_CATEGORY.SYSTEM_GENERATED_XLSX, description: preparation.confirmationDescription, prismaClient: options.prismaClient || prisma });
  return { preparation: { ...preparation, confirmedFile: publicFile(file), confirmationStatus: 'CONFIRMED' }, file: publicFile(file) };
};

const buildMonthlyPreparationWorkbook = async (filingMonth, items) => {
  validateMonth(filingMonth);
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('月度准备清单');
  sheet.columns = ['申报月份', '出口专项单', '报关单', '出口日期', '关联采购合同', '进项发票号码', '三单/签署件', '自动核验', '待补事项', '确认状态', '归档清单'].map(header => ({ header, width: 24 }));
  for (const item of items) sheet.addRow([filingMonth, item.contractNo, item.declarationNo || '待补', item.deadlines.basisDate,
    item.invoiceLinks.map(x => x.purchaseContractNo).join('、'), item.invoiceLinks.flatMap(x => x.invoiceNumbers).join('、'), item.documentFiles.map(x => x.fileName).join('、'),
    item.materialReady ? '通过' : '待补件/差异', [...item.materialBlockers, ...item.warnings].join('；'), item.confirmationStatus === 'CONFIRMED' ? '已确认' : item.confirmationStatus === 'CHANGED' ? '资料变化需重新确认' : '待确认', item.confirmedFile?.fileName || '']);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };
  const notes = wb.addWorksheet('说明');
  notes.addRow(['本工作簿是内部出货准备汇总，包含历史待申报及缺件业务；不是官方申报导入模板，不代表税局已受理。']);
  return Buffer.from(await wb.xlsx.writeBuffer());
};

module.exports = { buildShipmentPreparation, getShipmentPreparation, listShipmentPreparations, confirmShipmentPreparation, buildMonthlyPreparationWorkbook };
