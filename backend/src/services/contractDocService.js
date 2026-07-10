/**
 * Input: 固定 DOCX 模板、采购合同、供应商与全部采购明细
 * Output: 同一价税口径的 Word/PDF 购销合同 Buffer 与安全文件名
 * Pos: 采购合同正式文档生成 Module
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const PDFDocument = require('pdfkit');
const {
  summarizePurchaseAmounts,
} = require('./purchaseAmountService');

const DEFAULT_TEMPLATE_PATH = path.join(__dirname, '../../templates/购销合同模板.docx');
const getTemplatePath = () => process.env.CONTRACT_DOC_TEMPLATE_PATH || DEFAULT_TEMPLATE_PATH;

const PDF_FONT_CANDIDATES = [
  path.join(__dirname, '../../assets/fonts/NotoSansSC-Regular.otf'),
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/System/Library/Fonts/STHeiti Light.ttc',
  'C:\\Windows\\Fonts\\msyh.ttc',
];

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const formatNumber = (value) => toNumber(value).toLocaleString('zh-CN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const xmlEscape = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const replacePlaceholders = (xml, values) => Object.entries(values).reduce(
  (result, [key, value]) => result.split(`{{${key}}}`).join(xmlEscape(value)),
  xml,
);

const numberToChinese = (value) => {
  const amount = Math.round(Math.max(0, toNumber(value)) * 100);
  if (amount === 0) return '零元整';
  const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const units = ['', '拾', '佰', '仟'];
  const bigUnits = ['', '万', '亿', '兆'];
  const integer = Math.floor(amount / 100);
  const jiao = Math.floor((amount % 100) / 10);
  const fen = amount % 10;
  let text = '';

  if (integer > 0) {
    const sections = [];
    let remaining = integer;
    while (remaining > 0) {
      sections.push(remaining % 10000);
      remaining = Math.floor(remaining / 10000);
    }
    let pendingZero = false;
    for (let sectionIndex = sections.length - 1; sectionIndex >= 0; sectionIndex -= 1) {
      const section = sections[sectionIndex];
      if (section === 0) {
        pendingZero = text.length > 0;
        continue;
      }
      if (pendingZero || (text && section < 1000)) text += '零';
      pendingZero = false;
      let sectionText = '';
      let sectionZero = false;
      for (let unitIndex = 3; unitIndex >= 0; unitIndex -= 1) {
        const divisor = 10 ** unitIndex;
        const digit = Math.floor(section / divisor) % 10;
        if (digit === 0) {
          if (sectionText) sectionZero = true;
        } else {
          if (sectionZero) sectionText += '零';
          sectionText += `${digits[digit]}${units[unitIndex]}`;
          sectionZero = false;
        }
      }
      text += sectionText + bigUnits[sectionIndex];
    }
    text += '元';
  }

  if (jiao > 0) text += `${digits[jiao]}角`;
  if (fen > 0) text += `${digits[fen]}分`;
  if (jiao === 0 && fen === 0) text += '整';
  return text;
};

const generateContractNo = (purchaseContractNo) => {
  if (!purchaseContractNo) return 'CG000000';
  if (purchaseContractNo.startsWith('PO')) return purchaseContractNo.replace(/^PO/, 'CG');
  if (purchaseContractNo.startsWith('CG')) return purchaseContractNo;
  return `CG${purchaseContractNo}`;
};

const getShanghaiDateParts = (value) => {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(safeDate).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    iso: `${parts.year}-${parts.month}-${parts.day}`,
  };
};

const buildPurchaseContractView = (purchaseContract, options = {}) => {
  const sourceItems = purchaseContract.items || [];
  const amounts = summarizePurchaseAmounts({
    items: sourceItems,
    taxRate: purchaseContract.taxRate,
    totalAmount: purchaseContract.totalAmount,
    paidAmount: purchaseContract.paidAmount,
  });
  const signDate = getShanghaiDateParts(purchaseContract.signedAt);
  const supplier = purchaseContract.supplier || {};
  const items = sourceItems.map((item, index) => {
    const line = amounts.lines[index];
    const product = item.product || {};
    return {
      productName: product.customsName || product.name || '未填写商品',
      specification: item.specification || product.specification || '',
      unit: item.unit || product.unit || '件',
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
      netAmount: line?.netAmount || 0,
      taxRate: amounts.taxRate,
      taxAmount: line?.actualTaxAmount ?? line?.taxAmount ?? 0,
      grossAmount: line?.grossAmount || 0,
    };
  });

  return {
    contractNo: generateContractNo(purchaseContract.contractNo),
    signDate: signDate.iso,
    signYear: signDate.year,
    signMonth: String(Number(signDate.month)),
    signDay: String(Number(signDate.day)),
    supplier,
    items,
    amounts,
    storeName: options.storeName || purchaseContract.storeName || '【店铺名称】',
    deliveryAddress: options.deliveryAddress || '【收货地址】',
    deliveryContact: options.deliveryContact || '【联系人】',
    depositRate: Math.max(0, Math.min(100, toNumber(options.depositRate ?? 30))),
  };
};

const generatePurchaseContract = async (purchaseContract, options = {}) => {
  try {
    await fs.access(getTemplatePath());
  } catch {
    throw new Error('合同模板文件不存在，请先上传模板');
  }

  const zip = new AdmZip(getTemplatePath());
  const documentXml = zip.getEntry('word/document.xml');
  if (!documentXml) throw new Error('无效的 Word 文档模板');

  let xml = documentXml.getData().toString('utf8');
  const view = buildPurchaseContractView(purchaseContract, options);
  const itemRowPattern = /<w:tr(?:\s[^>]*)?>[\s\S]*?\{\{productName\}\}[\s\S]*?<\/w:tr>/;
  const itemRowMatch = xml.match(itemRowPattern);
  if (view.items.length > 0 && !itemRowMatch) {
    throw new Error('合同模板缺少包含 {{productName}} 的商品明细行');
  }

  if (itemRowMatch) {
    const rowTemplate = itemRowMatch[0];
    const itemRows = view.items.map((item) => replacePlaceholders(rowTemplate, {
      productName: item.specification ? `${item.productName}（${item.specification}）` : item.productName,
      unit: item.unit,
      quantity: formatNumber(item.quantity),
      unitPrice: formatNumber(item.unitPrice),
      amount: formatNumber(item.netAmount),
      taxRate: `${item.taxRate}%`,
      taxAmount: formatNumber(item.taxAmount),
      totalAmount: formatNumber(item.grossAmount),
    })).join('');
    xml = xml.replace(rowTemplate, itemRows);
  }

  xml = replacePlaceholders(xml, {
    contractNo: view.contractNo,
    signYear: view.signYear,
    signMonth: view.signMonth,
    signDay: view.signDay,
    supplierName: view.supplier.name || '【供应商名称】',
    supplierTaxId: view.supplier.taxId || '【税号】',
    supplierAddress: view.supplier.address || '【地址】',
    supplierBankName: [view.supplier.bankName, view.supplier.bankBranch].filter(Boolean).join(' ') || '【开户银行及支行】',
    supplierBankAccount: [
      `户名：${view.supplier.bankAccountName || view.supplier.name || '未填写'}`,
      view.supplier.bankAccount && `账号：${view.supplier.bankAccount}`,
      view.supplier.bankCode && `联行号：${view.supplier.bankCode}`,
    ].filter(Boolean).join('；'),
    supplierPhone: view.supplier.phone || view.supplier.contactPhone || '【电话】',
    storeName: view.storeName,
    deliveryAddress: view.deliveryAddress,
    deliveryContact: view.deliveryContact,
    depositRate: formatNumber(view.depositRate),
    totalAmount: formatNumber(view.amounts.grossAmount),
    totalAmountChinese: numberToChinese(view.amounts.grossAmount),
  });

  zip.updateFile('word/document.xml', Buffer.from(xml, 'utf8'));
  return zip.toBuffer();
};

const resolveContractPdfFontPath = (explicitPath) => {
  const candidates = [explicitPath, process.env.CONTRACT_PDF_FONT_PATH, ...PDF_FONT_CANDIDATES].filter(Boolean);
  const fontPath = candidates.find((candidate) => fsSync.existsSync(candidate));
  if (!fontPath) {
    throw new Error('未找到 PDF 中文字体，请配置 CONTRACT_PDF_FONT_PATH');
  }
  return fontPath;
};

const generatePurchaseContractPdf = async (purchaseContract, options = {}) => {
  const view = buildPurchaseContractView(purchaseContract, options);
  const fontPath = resolveContractPdfFontPath(options.fontPath);
  const documentDate = new Date(`${view.signDate}T00:00:00+08:00`);
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 40, bottom: 44, left: 42, right: 42 },
    info: {
      Title: `购销合同 ${view.contractNo}`,
      Author: '上海捷淞国际物流有限公司',
      CreationDate: documentDate,
      ModDate: documentDate,
    },
  });
  const chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  doc.registerFont('ContractChinese', fontPath);
  const font = () => doc.font('ContractChinese');
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  const ensureSpace = (height) => {
    if (doc.y + height <= pageBottom()) return;
    doc.addPage();
    font();
  };

  font().fontSize(22).text('购 销 合 同', { align: 'center', characterSpacing: 3 });
  doc.moveDown(0.5).fontSize(10);
  doc.text(`合同编号：${view.contractNo}`, { continued: true });
  doc.text(`签订日期：${view.signDate}`, { align: 'right' });
  doc.moveDown(0.5);
  doc.text(`甲方（购方）：上海捷淞国际物流有限公司`);
  doc.text(`乙方（供方）：${view.supplier.name || '未填写'}`);
  doc.text(`乙方税号：${view.supplier.taxId || '未填写'}`);
  doc.text(`乙方地址/电话：${view.supplier.address || '未填写'} / ${view.supplier.phone || view.supplier.contactPhone || '未填写'}`);
  doc.text(`乙方收款户名：${view.supplier.bankAccountName || view.supplier.name || '未填写'}`);
  doc.text(`乙方开户行/支行：${view.supplier.bankName || '未填写'} / ${view.supplier.bankBranch || '未填写'}`);
  doc.text(`乙方联行号/账号：${view.supplier.bankCode || '未填写'} / ${view.supplier.bankAccount || '未填写'}`);
  doc.moveDown(0.7).fontSize(12).text('一、产品清单及含税价格（人民币元）');
  doc.moveDown(0.35);

  const columns = [
    { label: '序', width: 24, align: 'center' },
    { label: '商品/规格', width: 142, align: 'left' },
    { label: '单位', width: 38, align: 'center' },
    { label: '数量', width: 50, align: 'right' },
    { label: '不含税单价', width: 72, align: 'right' },
    { label: '税率', width: 42, align: 'center' },
    { label: '含税金额', width: 92, align: 'right' },
  ];
  const tableX = doc.page.margins.left;

  const drawRow = (values, height, header = false) => {
    ensureSpace(height + 4);
    let x = tableX;
    const y = doc.y;
    columns.forEach((column, index) => {
      if (header) doc.save().rect(x, y, column.width, height).fill('#E8EEF4').restore();
      doc.rect(x, y, column.width, height).strokeColor('#9AA7B2').lineWidth(0.5).stroke();
      font().fillColor('#1F2933').fontSize(header ? 8.5 : 8.2).text(String(values[index] ?? ''), x + 3, y + 5, {
        width: column.width - 6,
        height: height - 8,
        align: column.align,
      });
      x += column.width;
    });
    doc.y = y + height;
  };

  const drawHeader = () => drawRow(columns.map((column) => column.label), 24, true);
  drawHeader();
  view.items.forEach((item, index) => {
    if (doc.y + 34 > pageBottom()) {
      doc.addPage();
      font();
      drawHeader();
    }
    const itemText = item.specification ? `${item.productName}\n${item.specification}` : item.productName;
    drawRow([
      index + 1,
      itemText,
      item.unit,
      formatNumber(item.quantity),
      formatNumber(item.unitPrice),
      `${item.taxRate}%`,
      formatNumber(item.grossAmount),
    ], item.specification ? 36 : 28);
  });

  ensureSpace(90);
  doc.moveDown(0.6).fontSize(10);
  doc.text(`不含税合计：¥${formatNumber(view.amounts.netAmount)}`);
  doc.text(`其中税额：¥${formatNumber(view.amounts.taxAmount)}（发票税率 ${view.amounts.taxRate}%）`);
  doc.text(`价税合计：¥${formatNumber(view.amounts.grossAmount)}（${numberToChinese(view.amounts.grossAmount)}）`);
  doc.moveDown(0.8).fontSize(12).text('二、付款、交付与发票');
  doc.moveDown(0.25).fontSize(9.5);
  doc.text(`1. 合同生效后，甲方按约支付 ${formatNumber(view.depositRate)}% 定金，余款按双方约定在发货前或验收节点支付。`);
  doc.text(`2. 收货信息：${view.storeName}；${view.deliveryAddress}；联系人：${view.deliveryContact}。`);
  doc.text(`3. 乙方应按上述品名、规格、数量交付，并开具税率为 ${view.amounts.taxRate}% 的增值税专用发票。`);
  doc.text('4. 到货后甲方核对箱件、数量和外观；质量争议以合同、确认资料、照片和双方书面记录为依据。');
  doc.text('5. 未尽事项由双方书面协商；协商不成的，按合同签订地有管辖权的人民法院处理。');
  doc.moveDown(1.2);
  ensureSpace(70);
  const signatureY = doc.y;
  font().fontSize(10).text('甲方（盖章）：上海捷淞国际物流有限公司', doc.page.margins.left, signatureY, { width: 245 });
  doc.text(`乙方（盖章）：${view.supplier.name || ''}`, doc.page.margins.left + 260, signatureY, { width: 245 });
  doc.text(`日期：${view.signDate}`, doc.page.margins.left, signatureY + 42, { width: 245 });
  doc.text(`日期：${view.signDate}`, doc.page.margins.left + 260, signatureY + 42, { width: 245 });
  doc.end();
  return completed;
};

const generateFilename = (purchaseContract, storeName) => {
  const contractNo = generateContractNo(purchaseContract.contractNo);
  const firstItem = purchaseContract.items?.[0] || {};
  const productName = firstItem.product?.customsName || firstItem.product?.name || '商品';
  const itemSuffix = (purchaseContract.items?.length || 0) > 1 ? `等${purchaseContract.items.length}项` : '';
  return `购销合同${contractNo}-${storeName || purchaseContract.storeName || '店铺'}-${productName}${itemSuffix}.docx`;
};

const generatePdfFilename = (purchaseContract) => `购销合同${generateContractNo(purchaseContract.contractNo)}.pdf`;

const checkTemplateExists = async () => {
  try {
    await fs.access(getTemplatePath());
    return true;
  } catch {
    return false;
  }
};

const saveTemplate = async (buffer) => {
  const templatePath = getTemplatePath();
  await fs.mkdir(path.dirname(templatePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(templatePath, buffer, { mode: 0o600 });
};

const getTemplateInfo = async () => {
  try {
    const templatePath = getTemplatePath();
    const stat = await fs.stat(templatePath);
    return {
      exists: true,
      filename: path.basename(templatePath),
      size: stat.size,
      updatedAt: stat.mtime,
    };
  } catch {
    return { exists: false };
  }
};

const removeTemplate = async () => fs.unlink(getTemplatePath());

module.exports = {
  buildPurchaseContractView,
  checkTemplateExists,
  generateContractNo,
  generateFilename,
  generatePdfFilename,
  generatePurchaseContract,
  generatePurchaseContractPdf,
  getTemplateInfo,
  getTemplatePath,
  numberToChinese,
  removeTemplate,
  resolveContractPdfFontPath,
  saveTemplate,
};
