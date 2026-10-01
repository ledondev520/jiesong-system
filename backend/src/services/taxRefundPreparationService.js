/**
 * Input: 出口合同、报关/收汇/退税事实、关联采购发票与当前出口准备度
 * Output: 2026 现行规则下的退税材料清单、期限与 Excel；签署件及运输凭证按实际类型核验
 * Pos: 出口专项单发票阶段与退税阶段之间的材料准备 Module
 */

const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { getExportReadiness } = require('./exportReadinessService');
const {
  buildPurchaseInvoicePreparation,
  normalizeInvoiceNumbers,
} = require('./purchaseInvoiceService');

const OFFICIAL_RULES = Object.freeze({
  effectiveFrom: '2026-01-01',
  policyDocument: '财政部 税务总局公告2026年第11号',
  managementDocument: '国家税务总局公告2026年第5号',
  filingRule: '报关出口次月起至次年4月30日前的各增值税纳税申报期；超过该常规期限时，按36个月补充申报规则并提供收汇材料人工复核',
  externalTradeMaterials: '外贸企业出口退税出口明细申报表、外贸企业出口退税进货明细申报表、出口货物报关单、增值税专用发票或海关进口增值税专用缴款书及附送资料',
  filingArchiveRule: '申报后15日内整理备案单证目录；购销合同、运输单据和委托报关资料可纸质、影像或数字化留存，通常保存10年',
  collectionRule: '一般出口货物应在报关出口之日的次年4月30日前收汇；特殊情形按视同收汇及举证材料规则处理',
  internalReminderDisclaimer: '次月5日仅为本系统内部准备节点，不是法定申报截止日；最终提交以主管税务机关、电子税务局和当期申报期为准',
  sources: Object.freeze({
    policy: 'https://fgk.chinatax.gov.cn/zcfgk/c102416/c5247437/content.html',
    management: 'https://shanghai.chinatax.gov.cn/zzzb/zcwj/202602/t479288.html',
    interpretation: 'https://shanghai.chinatax.gov.cn/tax/zcfw/zcjd/202602/t479289.html',
  }),
});

const normalizeText = (value) => String(value || '').replace(/\s+/g, '').toLowerCase();
const normalizeContractNo = (value) => String(value || '').replace(/\s+/g, '').toUpperCase();
const unique = (values) => Array.from(new Set(values.filter(Boolean)));
const toIsoDate = (date) => date.toISOString().slice(0, 10);

const toValidDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildDeadlines = (value) => {
  const date = toValidDate(value);
  if (!date) {
    return {
      basisDate: null,
      filingStart: null,
      internalPrepareOn: null,
      primaryFilingEnd: null,
      collectionDeadline: null,
      supplementaryWindowEnd: null,
      filingArchiveDueRule: '实际申报后15日内',
      retentionYears: 10,
    };
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const filingStart = new Date(Date.UTC(year, month + 1, 1));
  const internalPrepareOn = new Date(Date.UTC(year, month + 1, 5));
  const primaryFilingEnd = new Date(Date.UTC(year + 1, 3, 30));
  const supplementaryWindowEnd = new Date(Date.UTC(year, month + 36, day));
  return {
    basisDate: toIsoDate(date),
    filingStart: toIsoDate(filingStart),
    internalPrepareOn: toIsoDate(internalPrepareOn),
    primaryFilingEnd: toIsoDate(primaryFilingEnd),
    collectionDeadline: toIsoDate(primaryFilingEnd),
    supplementaryWindowEnd: toIsoDate(supplementaryWindowEnd),
    filingArchiveDueRule: '实际申报后15日内',
    retentionYears: 10,
  };
};

const latestByDate = (items, fields) => [...(items || [])].sort((left, right) => {
  const leftValue = fields.map((field) => toValidDate(left?.[field])?.getTime() || 0).find(Boolean) || 0;
  const rightValue = fields.map((field) => toValidDate(right?.[field])?.getTime() || 0).find(Boolean) || 0;
  return rightValue - leftValue;
})[0] || null;

const findInvoiceMatchIssues = (declaration, purchases) => {
  if (!declaration) return [{ message: '缺少出口货物报关单，无法核对商品名称和计量单位' }];
  const declarationItems = declaration.items || [];
  if (declarationItems.length === 0) return [{ message: '报关单没有商品明细，无法核对购进凭证' }];

  const purchaseItems = purchases.flatMap((purchase) => purchase.items || []);
  return declarationItems.flatMap((item) => {
    const candidates = purchaseItems.filter((purchaseItem) => purchaseItem.productId === item.productId);
    if (candidates.length === 0) {
      return [{ message: `${item.customsName || '未知商品'} 未找到关联采购明细` }];
    }
    const matched = candidates.some((candidate) => {
      const purchaseName = candidate.product?.customsName || '';
      const purchaseUnit = candidate.unit || candidate.product?.unit || '';
      return normalizeText(purchaseName) === normalizeText(item.customsName)
        && normalizeText(purchaseUnit) === normalizeText(item.unit);
    });
    return matched ? [] : [{
      message: `${item.customsName || '未知商品'} 的报关品名/单位与采购开票清单不一致`,
    }];
  });
};

const hasSignedPurchaseArchive = (purchase) => (purchase.files || []).some((file) => (
  file.category === 'SIGNED_CONTRACT'
));

const hasCustomsEntrustmentEvidence = (salesContract) => (salesContract.files || []).some((file) => (
  /委托报关|代理报关|报关服务|代理服务费/.test(file.fileName || '')
));

const makeChecklistItem = (id, label, category, requirement, status, evidence, message) => ({
  id,
  label,
  category,
  requirement,
  status,
  evidence,
  message,
});

const contractNoAliases = (value) => unique([
  normalizeContractNo(value),
  normalizeContractNo(value).replace(/^PO/, 'CG'),
  normalizeContractNo(value).replace(/^CG/, 'PO'),
]);

const hasPassedTaxRecord = (records, contractNo, invoiceNumber) => {
  const aliases = contractNoAliases(contractNo);
  return (records || []).some((record) => (
    record.match_status === 'passed'
    && aliases.includes(normalizeContractNo(record.relation_no))
    && (() => {
      try {
        return normalizeInvoiceNumbers(record.invoice_no).includes(invoiceNumber);
      } catch {
        return false;
      }
    })()
  ));
};

const buildTaxRefundPreparation = ({ salesContract, purchases = [], exportReadiness = null, packingSourceSalesContract = salesContract } = {}) => {
  if (!salesContract) throw createError('出口合同不存在', 404);
  const declaration = latestByDate(
    (salesContract.customsDeclarations || []).filter((item) => item.status !== 'VOID'),
    ['exportDate', 'declaredAt', 'createdAt'],
  );
  const taxRefund = latestByDate(salesContract.taxRefunds || [], ['createdAt', 'appliedAt']);
  const latestPackingCheck = latestByDate(salesContract.packingListChecks || [], ['checkedAt', 'createdAt']);
  const invoicePreparations = purchases.map((purchase) => buildPurchaseInvoicePreparation(purchase));
  const invoiceLinks = invoicePreparations.map((item, index) => ({
    purchaseContractId: item.purchaseContractId,
    purchaseContractNo: item.request.contractNo,
    supplierName: item.request.supplierName,
    supplierTaxId: item.request.supplierTaxId,
    invoiceNumbers: item.invoiceNumbers,
    invoiceFileCount: item.invoiceFiles.length,
    invoiceFileRequired: false,
    taxRate: item.amounts.taxRate,
    netAmount: item.amounts.netAmount,
    taxAmount: item.amounts.taxAmount,
    grossAmount: item.amounts.grossAmount,
    issues: item.issues,
    sourceContractNo: purchases[index]?.contractNo,
  }));
  const allInvoiceNumbersReady = invoiceLinks.length > 0
    && invoiceLinks.every((item) => item.invoiceNumbers.length > 0);
  const supplierTaxIdsReady = invoiceLinks.length > 0
    && invoiceLinks.every((item) => Boolean(String(item.supplierTaxId || '').trim()));
  const invoiceOwners = new Map();
  invoiceLinks.forEach((item) => {
    item.invoiceNumbers.forEach((invoiceNumber) => {
      if (!invoiceOwners.has(invoiceNumber)) invoiceOwners.set(invoiceNumber, new Set());
      invoiceOwners.get(invoiceNumber).add(item.purchaseContractId);
    });
  });
  const duplicateInvoiceNumbers = Array.from(invoiceOwners.entries())
    .filter(([, ownerIds]) => ownerIds.size > 1)
    .map(([invoiceNumber]) => invoiceNumber);
  const taxRecords = salesContract.taxRefunds || [];
  const taxRecordsReady = allInvoiceNumbersReady
    && duplicateInvoiceNumbers.length === 0
    && invoiceLinks.every((item) => (
    item.invoiceNumbers.every((invoiceNumber) => (
      hasPassedTaxRecord(taxRecords, item.sourceContractNo, invoiceNumber)
    ))
    ));
  const invoiceMatchIssues = findInvoiceMatchIssues(declaration, purchases);
  let packingComparison;
  try { packingComparison = latestPackingCheck?.comparison || JSON.parse(latestPackingCheck?.resultJson || 'null'); } catch { packingComparison = null; }
  const packingSource = packingSourceSalesContract || salesContract;
  const snapshotItems = packingComparison?.items || [];
  const packingSnapshotCurrent = snapshotItems.length > 0
    ? snapshotItems.length === (packingSource.packingItems || []).length
      && (packingSource.packingItems || []).every((item) => {
        const old = snapshotItems.find((row) => row.packingItemId === item.id);
        return old && Number(old.quantity?.expected || 0) === Number(item.quantity || 0)
          && Number(old.boxes?.expected || 0) === Number(item.boxes || 0)
          && (!old.productName || normalizeText(old.productName) === normalizeText(item.product?.customsName));
      })
      && (packingComparison.fields || []).filter((field) => ['totalBoxes', 'grossWeight', 'netWeight', 'volume'].includes(field.key))
        .every((field) => Number(field.expected || 0) === Number(packingSource[field.key] || 0))
    : Boolean(toValidDate(latestPackingCheck?.reviewedAt || latestPackingCheck?.checkedAt))
      && (packingSource.packingItems || []).every((item) => !item.updatedAt
        || new Date(item.updatedAt) <= new Date(latestPackingCheck.reviewedAt || latestPackingCheck.checkedAt));
  const packingCheckPassed = ['PASSED', 'APPROVED'].includes(latestPackingCheck?.status) && packingSnapshotCurrent;
  const purchaseArchivesReady = purchases.length > 0 && purchases.every(hasSignedPurchaseArchive);
  const packingCheckFileIds = new Set((salesContract.packingListChecks || []).map((check) => check.file?.id).filter(Boolean));
  const transportFile = (salesContract.files || []).find((file) => (
    file.category === 'CARRIER_DOCUMENT'
    && !packingCheckFileIds.has(file.id)
    && /提单|运单|bill[\s_-]*of[\s_-]*lading|\bb[\/_-]?l\b|waybill/i.test(`${file.fileName || ''} ${file.description || ''}`)
    && !/装箱单|packing[\s_-]*list/i.test(`${file.fileName || ''} ${file.description || ''}`)
  ));
  const collectionReady = (Number(salesContract.receivedAmount) > 0
    && Number(salesContract.receivedAmount) >= Number(salesContract.totalAmount || 0) - 0.01)
    || (salesContract.forexVerifications || []).some((item) => item.status === 'VERIFIED');
  const taxEvidenceReady = Boolean(exportReadiness?.taxRefundReady);
  const exportIssues = (exportReadiness?.issues || [])
    .filter((issue) => issue.severity === 'error' || !issue.severity)
    .map((issue) => issue.message)
    .filter(Boolean);
  const hasTaxDraft = taxRecords.length > 0;
  const entrusted = Boolean(String(salesContract.customsBroker || '').trim());

  const checklist = [
    makeChecklistItem(
      'export-detail-form',
      '外贸企业出口退税出口明细申报表',
      '申报资料',
      'required',
      hasTaxDraft ? 'ready' : 'missing',
      hasTaxDraft ? `系统退税记录 ${taxRefund.id}` : null,
      hasTaxDraft ? '已建立退税准备记录' : '尚未建立出口退税准备记录',
    ),
    makeChecklistItem(
      'purchase-detail-form',
      '外贸企业出口退税进货明细申报表',
      '申报资料',
      'required',
      hasTaxDraft && taxRecordsReady ? 'ready' : 'missing',
      taxRecordsReady ? `关联 ${invoiceLinks.length} 份采购合同` : null,
      taxRecordsReady
        ? '采购合同、发票号码与退税记录关联校验已通过'
        : duplicateInvoiceNumbers.length > 0
          ? `发票号 ${duplicateInvoiceNumbers.join('、')} 被关联到多个采购合同，存在重复申报风险`
          : '退税记录尚未覆盖全部采购发票，或关联校验未通过',
    ),
    makeChecklistItem(
      'customs-declaration',
      '出口货物报关单',
      '申报凭证',
      'required',
      declaration ? 'ready' : 'missing',
      declaration?.declarationNo || null,
      declaration ? '已关联当前出口报关记录' : '缺少出口货物报关单',
    ),
    makeChecklistItem(
      'supplier-invoices',
      '增值税专用发票（购进凭证）',
      '申报凭证',
      'required',
      allInvoiceNumbersReady ? 'ready' : 'missing',
      allInvoiceNumbersReady ? invoiceLinks.flatMap((item) => item.invoiceNumbers).join('、') : null,
      allInvoiceNumbersReady
        ? '发票号码已按采购合同登记；文件附件为选填留档，正式申报仍需核对电子发票信息'
        : '仍有采购合同未登记供应商发票号码',
    ),
    makeChecklistItem(
      'supplier-tax-identifiers',
      '供货方纳税人识别号',
      '申报凭证',
      'required',
      supplierTaxIdsReady ? 'ready' : 'missing',
      supplierTaxIdsReady ? `已覆盖 ${invoiceLinks.length} 家关联供货方` : null,
      supplierTaxIdsReady ? '供货方税号已留存' : '关联供应商缺少纳税人识别号，无法完整形成进货明细',
    ),
    makeChecklistItem(
      'name-unit-match',
      '报关单与购进凭证品名、计量单位核对',
      '系统校验',
      'required',
      invoiceMatchIssues.length === 0 ? 'ready' : 'missing',
      invoiceMatchIssues.length === 0 ? `已核对 ${declaration?.items?.length || 0} 条报关明细` : null,
      invoiceMatchIssues.length === 0 ? '品名和计量单位一致' : invoiceMatchIssues.map((item) => item.message).join('；'),
    ),
    makeChecklistItem(
      'tax-rate-evidence',
      '当前 HS、采购税率与出口退税率证据',
      '系统校验',
      'required',
      taxEvidenceReady ? 'ready' : 'missing',
      taxEvidenceReady ? '当前出口准备度校验通过' : null,
      taxEvidenceReady ? '当前税则与采购专票估算口径完整' : (exportIssues.join('；') || '当前税则或采购专票口径未齐'),
    ),
    makeChecklistItem(
      'document-consistency',
      '船司装箱单与系统装箱数据核对',
      '系统校验',
      'required',
      packingCheckPassed ? 'ready' : 'missing',
      latestPackingCheck?.file?.fileName || null,
      packingCheckPassed ? '船司核对结果与当前出货明细一致' : '船司装箱单未通过核对或出货明细已变化，请重新核对',
    ),
    makeChecklistItem(
      'purchase-contracts',
      '采购签署合同（备案单证）',
      '备案单证',
      'post_submission',
      purchaseArchivesReady ? 'ready' : 'review',
      purchaseArchivesReady ? `已归档 ${purchases.length} 份采购合同` : null,
      purchaseArchivesReady ? '供应商盖章件已归档' : '申报后15日内整理备案目录前需补齐购销合同证据',
    ),
    makeChecklistItem(
      'transport-documents',
      '出口运输单据（备案单证）',
      '备案单证',
      'post_submission',
      transportFile ? 'ready' : 'review',
      transportFile?.fileName || null,
      transportFile ? '提单/运单已留存' : '需补提单或运单；船司装箱单不能代替运输凭证',
    ),
    makeChecklistItem(
      'customs-entrustment',
      '委托报关协议及服务费凭证（如适用）',
      '备案单证',
      'conditional',
      !entrusted ? 'not_applicable' : hasCustomsEntrustmentEvidence(salesContract) ? 'ready' : 'review',
      !entrusted ? '当前未登记委托报关行' : salesContract.customsBroker,
      !entrusted ? '当前无委托报关条件' : hasCustomsEntrustmentEvidence(salesContract)
        ? '委托报关证据已留存'
        : '已登记报关行，请人工确认委托报关协议和服务费凭证',
    ),
    makeChecklistItem(
      'invoice-portal-verification',
      '电子发票票面信息复核',
      '申报复核',
      'conditional',
      'review',
      '正式提交前',
      '系统留存号码和采购预期明细；开票日期、票面金额及税务电子信息仍需在电子税务局或申报工具中匹配复核',
    ),
    makeChecklistItem(
      'collection-materials',
      '收汇材料或视同收汇举证（按情形）',
      '收汇材料',
      'conditional',
      collectionReady ? 'ready' : 'review',
      collectionReady ? '已收款或核销记录已验证' : null,
      collectionReady ? '当前收汇事实已登记' : '需持续跟踪收汇；通常应在报关出口次年4月30日前完成',
    ),
    makeChecklistItem(
      'filing-catalog',
      '出口退（免）税备案单证目录',
      '备案单证',
      'post_submission',
      ['APPLIED', 'APPROVED', 'REFUNDED'].includes(taxRefund?.status) ? 'review' : 'not_applicable',
      null,
      ['APPLIED', 'APPROVED', 'REFUNDED'].includes(taxRefund?.status)
        ? '请在实际申报后15日内制作目录并按规定留存10年'
        : '实际申报后启动15日备案整理节点',
    ),
  ];

  const blockers = checklist
    .filter((item) => item.requirement === 'required' && item.status !== 'ready')
    .map((item) => item.message || `${item.label}未齐`);
  const warnings = checklist
    .filter((item) => item.requirement !== 'required' && item.status === 'review')
    .map((item) => item.message)
    .filter(Boolean);
  const basisDate = declaration?.exportDate || salesContract.shippedAt;

  return {
    salesContractId: salesContract.id,
    contractNo: salesContract.contractNo,
    preparationReady: blockers.length === 0,
    collectionReady,
    checklist,
    blockers,
    warnings,
    invoiceLinks,
    deadlines: buildDeadlines(basisDate),
    officialRules: OFFICIAL_RULES,
    disclaimer: '本清单用于内部材料准备和风险提示，不替代主管税务机关审核，不代表已完成正式申报。',
  };
};

const getPurchaseContracts = async (salesContract, prismaClient) => {
  const contractNos = unique((salesContract.packingItems || []).map((item) => item.purchaseContractNo));
  const aliases = unique(contractNos.flatMap((contractNo) => [
    contractNo,
    contractNo?.replace(/^PO/, 'CG'),
    contractNo?.replace(/^CG/, 'PO'),
  ]));
  if (aliases.length === 0) return [];
  const purchases = await prismaClient.purchaseContract.findMany({
    where: { contractNo: { in: aliases } },
    include: {
      supplier: { select: { id: true, name: true, taxId: true } },
      items: {
        include: { product: { select: { id: true, customsName: true, unit: true } } },
        orderBy: { createdAt: 'asc' },
      },
      files: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  const map = new Map();
  purchases.forEach((purchase) => {
    map.set(purchase.contractNo, purchase);
    map.set(purchase.contractNo.replace(/^PO/, 'CG'), purchase);
    map.set(purchase.contractNo.replace(/^CG/, 'PO'), purchase);
  });
  return contractNos.map((contractNo) => map.get(contractNo)).filter(Boolean);
};

const getTaxRefundPreparation = async (
  salesContractId,
  { prismaClient = prisma, readinessLoader = getExportReadiness } = {},
) => {
  const salesContract = await prismaClient.salesContract.findUnique({
    where: { id: salesContractId },
    include: {
      packingItems: {
        include: { product: { select: { id: true, customsName: true, unit: true } } },
        orderBy: { createdAt: 'asc' },
      },
      customsDeclarations: {
        include: { items: true },
        orderBy: [{ exportDate: 'desc' }, { createdAt: 'desc' }],
      },
      forexVerifications: true,
      taxRefunds: { orderBy: { createdAt: 'desc' } },
      packingListChecks: {
        take: 1,
        orderBy: [{ checkedAt: 'desc' }, { createdAt: 'desc' }],
        include: { file: true },
      },
      files: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!salesContract) throw createError('出口合同不存在', 404);
  const purchases = await getPurchaseContracts(salesContract, prismaClient);
  let exportReadiness;
  try {
    exportReadiness = await readinessLoader(salesContractId);
  } catch (error) {
    exportReadiness = {
      taxRefundReady: false,
      issues: [{ severity: 'error', message: error?.message || '出口退税准备度校验失败' }],
    };
  }
  return buildTaxRefundPreparation({ salesContract, purchases, exportReadiness });
};

const styleHeader = (row) => {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
};

const buildTaxRefundPreparationWorkbook = async (preparation) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞出口专项单系统';
  workbook.created = new Date();

  const checklistSheet = workbook.addWorksheet('准备清单');
  checklistSheet.columns = [
    { header: '分类', key: 'category', width: 14 },
    { header: '材料/校验项', key: 'label', width: 36 },
    { header: '要求', key: 'requirement', width: 16 },
    { header: '状态', key: 'status', width: 14 },
    { header: '证据', key: 'evidence', width: 32 },
    { header: '说明', key: 'message', width: 60 },
  ];
  styleHeader(checklistSheet.getRow(1));
  preparation.checklist.forEach((item) => checklistSheet.addRow(item));
  checklistSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const invoiceSheet = workbook.addWorksheet('关联发票');
  invoiceSheet.columns = [
    { header: '采购合同', key: 'purchaseContractNo', width: 18 },
    { header: '供应商', key: 'supplierName', width: 24 },
    { header: '供货方税号', key: 'supplierTaxId', width: 24 },
    { header: '税率(%)', key: 'taxRate', width: 12 },
    { header: '发票号码', key: 'invoiceNumbers', width: 40 },
    { header: '不含税金额', key: 'netAmount', width: 16 },
    { header: '税额', key: 'taxAmount', width: 16 },
    { header: '价税合计', key: 'grossAmount', width: 16 },
    { header: '附件数(选填)', key: 'invoiceFileCount', width: 16 },
  ];
  styleHeader(invoiceSheet.getRow(1));
  preparation.invoiceLinks.forEach((item) => invoiceSheet.addRow({
    ...item,
    invoiceNumbers: item.invoiceNumbers.join('、'),
  }));

  const ruleSheet = workbook.addWorksheet('规则口径');
  ruleSheet.columns = [
    { header: '项目', key: 'label', width: 26 },
    { header: '当前口径', key: 'value', width: 100 },
  ];
  styleHeader(ruleSheet.getRow(1));
  [
    ['政策公告', preparation.officialRules.policyDocument],
    ['管理办法', preparation.officialRules.managementDocument],
    ['生效日期', preparation.officialRules.effectiveFrom],
    ['常规申报口径', preparation.officialRules.filingRule],
    ['申报资料', preparation.officialRules.externalTradeMaterials],
    ['备案单证', preparation.officialRules.filingArchiveRule],
    ['收汇要求', preparation.officialRules.collectionRule],
    ['内部提醒声明', preparation.officialRules.internalReminderDisclaimer],
    ['政策来源', Object.values(preparation.officialRules.sources).join('\n')],
    ['系统声明', preparation.disclaimer],
  ].forEach(([label, value]) => ruleSheet.addRow({ label, value }));
  ruleSheet.getColumn(2).alignment = { wrapText: true, vertical: 'top' };

  if (preparation.shipmentKey) {
    const sourceSheet = workbook.addWorksheet('出货关联');
    sourceSheet.addRows([
      ['出口专项单', preparation.contractNo], ['报关单', preparation.declarationNo || '待补'],
      ['资料版本', preparation.sourceVersion], ['确认状态', preparation.confirmationStatus],
      ['关联资料', (preparation.documentFiles || []).map((file) => file.fileName).join('、')],
      ['自动核验', preparation.materialReady ? '通过' : preparation.materialBlockers.join('；')],
      ['说明', '本清单为内部准备归档；确认不代表税局用途确认或正式受理。'],
    ]);
    sourceSheet.columns = [{ width: 18 }, { width: 90 }];
    const verification = workbook.addWorksheet('发票核验');
    verification.addRow(['发票号', '核验状态', '销方', '销方税号', '开票日期', '票面不含税金额', '票面税额', '票面价税合计', '差异', '本次数量', '本次价税合计']);
    for (const item of preparation.invoiceVerification.results) verification.addRow([
      item.invoiceNo, item.status, item.actualSeller, item.actualSellerTaxId, item.actualDate,
      item.actualAmountExTax, item.actualTax, item.actualTotal, item.issues.join('；'), item.allocatedQuantity, item.allocatedGrossAmount,
    ]);
    verification.columns = Array.from({ length: 11 }, () => ({ width: 22 }));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

const exportTaxRefundPreparation = async (salesContractId, options = {}) => {
  const preparation = await getTaxRefundPreparation(salesContractId, options);
  return {
    preparation,
    buffer: await buildTaxRefundPreparationWorkbook(preparation),
    fileName: `出口退税材料准备清单-${preparation.contractNo}.xlsx`,
  };
};

module.exports = {
  OFFICIAL_RULES,
  buildDeadlines,
  buildTaxRefundPreparation,
  buildTaxRefundPreparationWorkbook,
  exportTaxRefundPreparation,
  getTaxRefundPreparation,
};
