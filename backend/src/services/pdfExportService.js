/**
 * Input: Sales contracts / 系统导出数据
 * Output: PDF 报表 Buffer 与文件名
 *
 * Notes:
 * - Keep dependencies small and deterministic.
 * - Logo / stamp are optional; fallback vector graphics are rendered when files missing.
 */

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const prisma = require('../utils/prisma');
const { calculateTaxSummary } = require('./taxCalculationEngine');

const DEFAULT_LOGO_PATH = path.join(__dirname, '../../assets/pdf-logo.png');
const DEFAULT_STAMP_PATH = path.join(__dirname, '../../assets/pdf-stamp.png');
const DEFAULT_PDF_MIME = 'application/pdf';

const formatDate = (value) => {
  const d = value ? new Date(value) : new Date();
  return d.toISOString().slice(0, 10);
};

const formatMoney = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0.00';
  }
  return num.toFixed(2);
};

const safeText = (value, fallback = '-') => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  return String(value);
};

const toFilenameDate = () => formatDate();

const loadImageBuffer = (candidatePath) => {
  if (!candidatePath) {
    return null;
  }
  try {
    if (!fs.existsSync(candidatePath)) {
      return null;
    }
    return fs.readFileSync(candidatePath);
  } catch {
    return null;
  }
};

const collectPdfBuffer = (writer) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    writer.on('data', (chunk) => chunks.push(chunk));
    writer.on('error', reject);
    writer.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    writer.end();
  });
};

const drawFallbackLogo = (doc, x, y, width, height) => {
  doc.save();
  doc.roundedRect(x, y, width, height, 4).fillOpacity(0.04).fill('#1F5DAB');
  doc.lineWidth(1).strokeColor('#1F5DAB').stroke();
  doc.fillOpacity(1);
  doc.fillColor('#1F5DAB');
  doc.fontSize(14).text('LOGO', x, y + height / 2 - 8, {
    width,
    align: 'center',
  });
  doc.restore();
  doc.fillColor('black');
};

const drawFallbackStamp = (doc, x, y, width, height) => {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const radius = Math.min(width, height) / 2 - 4;

  doc.save();
  doc.translate(centerX, centerY);
  doc.rotate(-12);
  doc.translate(-centerX, -centerY);
  doc.lineWidth(2);
  doc.circle(centerX, centerY, radius);
  doc.strokeColor('#B61A1A').stroke();
  doc.fontSize(14);
  doc.fillColor('#B61A1A');
  doc.text('STAMP', x, centerY - 8, {
    width,
    align: 'center',
  });
  doc.restore();
  doc.fillColor('black');
};

const drawImageOrFallback = (doc, imageBuffer, x, y, width, height, type) => {
  try {
    if (imageBuffer && imageBuffer.length > 0) {
      doc.image(imageBuffer, x, y, {
        fit: [width, height],
      });
      return;
    }
  } catch {
    // keep behavior stable; fallback drawing is deterministic.
  }

  if (type === 'stamp') {
    drawFallbackStamp(doc, x, y, width, height);
    return;
  }

  drawFallbackLogo(doc, x, y, width, height);
};

const addDocumentHeader = (doc, title) => {
  const marginX = doc.page.margins.left;
  const marginRight = doc.page.width - doc.page.margins.right;
  const topY = doc.y;
  const panelW = 120;
  const panelH = 56;
  const gap = 14;

  const logoPath = process.env.EXPORT_PDF_LOGO_PATH || DEFAULT_LOGO_PATH;
  const stampPath = process.env.EXPORT_PDF_STAMP_PATH || DEFAULT_STAMP_PATH;
  const logoBuffer = loadImageBuffer(logoPath);
  const stampBuffer = loadImageBuffer(stampPath);

  drawImageOrFallback(doc, logoBuffer, marginX, topY, panelW, panelH, 'logo');
  drawImageOrFallback(doc, stampBuffer, marginRight - panelW, topY, panelW, panelH, 'stamp');

  doc.font('Helvetica-Bold').fontSize(24);
  doc.fillColor('#1F2D3D');
  doc.text(title, marginX + panelW + gap, topY + 16, {
    align: 'center',
    width: marginRight - marginX - panelW * 2 - gap * 2,
  });
  doc.font('Helvetica').fontSize(10);
  doc.fillColor('#546B82');
  doc.text('Jie Song Import & Export Report', marginX + panelW + gap, topY + 40, {
    align: 'center',
    width: marginRight - marginX - panelW * 2 - gap * 2,
  });
  doc.fillColor('black');
  doc.moveTo(marginX, topY + panelH + 8);
  doc.lineTo(marginRight, topY + panelH + 8);
  doc.strokeColor('#BFC6D0').lineWidth(0.8).stroke();
  doc.moveDown(2);
};

const addSectionTitle = (doc, title) => {
  doc.moveDown(0.7);
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#1F2D3D');
  doc.text(title);
  doc.fillColor('black');
  doc.font('Helvetica');
  doc.moveDown(0.2);
};

const addKVSection = (doc, rows) => {
  rows.forEach(([label, value]) => {
    doc.font('Helvetica-Bold').fontSize(10).text(`${label}:`, { continued: true });
    doc.font('Helvetica').text(` ${safeText(value)}`);
    doc.moveDown(0.15);
  });
  doc.moveDown(0.35);
};

const addParagraphList = (doc, title, items, formatter) => {
  addSectionTitle(doc, title);
  if (!items.length) {
    doc.fontSize(10).text('（暂无）');
    return;
  }

  items.forEach((item, index) => {
    doc.fontSize(10).text(`${index + 1}. ${formatter(item)}`);
  });
};

const addCsvLikeTable = (doc, headers, rows) => {
  addSectionTitle(doc, 'Data');
  if (!headers.length) {
    doc.text('（无可展示字段）');
    return;
  }

  const safeHeaders = headers.map((h) => safeText(h));
  const safeRows = rows.map((row) => row.map((cell) => safeText(cell)));
  const allRows = [safeHeaders, ...safeRows];
  const maxColumns = Math.max(...allRows.map((row) => row.length));

  doc.font('Courier');
  doc.fontSize(9);
  doc.fillColor('#2D3A45');

  const separator = safeHeaders.map(() => '-').join(' | ');
  doc.font('Helvetica-Bold').text(safeHeaders.join(' | '));
  doc.font('Helvetica');
  doc.fillColor('#5C6F80');
  doc.text(separator);
  doc.fillColor('black');

  if (!safeRows.length) {
    doc.text('（暂无数据）');
    return;
  }

  for (const row of safeRows) {
    const normalized = [...row];
    while (normalized.length < maxColumns) {
      normalized.push('-');
    }
    doc.text(normalized.join(' | '));
  }
};

const exportSalesContractPdf = async (contractId) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id: contractId },
    include: {
      port: true,
      items: {
        include: {
          product: true,
          store: true,
        },
      },
      packingItems: {
        include: {
          product: true,
          store: true,
        },
      },
    },
  });

  if (!contract) {
    throw new Error(`合同不存在: ${contractId}`);
  }

  const statusLabelMap = {
    DRAFT: '草稿',
    CONFIRMED: '已确认',
    PACKING: '装柜中',
    SHIPPED: '已发运',
    ARRIVED: '已到达',
    COMPLETED: '已完成',
    CANCELLED: '已取消',
  };

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
  });

  addDocumentHeader(doc, 'Sales Contract PDF');
  addSectionTitle(doc, 'Contract Info');
  addKVSection(doc, [
    ['Contract No.', contract.contractNo],
    ['Status', statusLabelMap[contract.status] || contract.status],
    ['Port', contract.port?.name || '-'],
    ['Signed At', contract.signedAt ? formatDate(contract.signedAt) : '-'],
    ['Exchange Rate', formatMoney(contract.exchangeRate)],
    ['Total Amount (USD)', formatMoney(contract.totalAmount)],
    ['Received Amount (USD)', formatMoney(contract.receivedAmount)],
    ['Outstanding (USD)', formatMoney((contract.totalAmount || 0) - (contract.receivedAmount || 0))],
    ['Total Boxes', contract.totalBoxes || 0],
    ['Gross Weight (kg)', formatMoney(contract.grossWeight || 0)],
    ['Net Weight (kg)', formatMoney(contract.netWeight || 0)],
    ['Volume (CBM)', formatMoney(contract.volume || 0)],
    ['Shipped At', contract.shippedAt ? formatDate(contract.shippedAt) : '-'],
    ['Estimated Arrival', contract.estimatedArrival ? formatDate(contract.estimatedArrival) : '-'],
    ['Customs Broker', contract.customsBroker || '-'],
    ['Fumigated', contract.isFumigated ? 'Yes' : 'No'],
    ['Tax Refund', contract.hasTaxRefund ? 'Yes' : 'No'],
    ['Note', contract.note || '-'],
  ]);

  addParagraphList(doc, 'Items', contract.items || [], (item, idx) => {
    const storeName = item.store?.name || '-';
    const productName = item.product?.customsName || '-';
    const spec = item.specification || item.product?.specification || '-';
    return `${productName} | Spec:${safeText(spec)} | Qty:${formatMoney(item.quantity)} ${safeText(item.unit || item.product?.unit)} | Unit Price:${formatMoney(item.sellingPrice)} | Store:${storeName}`;
  });

  doc.moveDown(0.6);
  addParagraphList(doc, 'Packing List', contract.packingItems || [], (item) => {
    const storeName = item.store?.name || '-';
    const productName = item.product?.customsName || '-';
    return `${productName} | Boxes:${safeText(item.boxes)} | Qty:${formatMoney(item.quantity)} ${safeText(item.unit)} | Weight:${formatMoney(item.grossWeight)}kg / ${formatMoney(item.netWeight)}kg | Volume:${formatMoney(item.volume)} | Store:${storeName}`;
  });

  const taxResult = calculateTaxSummary(contract);
  doc.moveDown(0.6);
  addSectionTitle(doc, 'Tax Summary');
  addKVSection(doc, [
    ['Estimated Refund (CNY)', formatMoney(taxResult.summary.totalRefundAmountCny)],
    ['Refund Base (CNY)', formatMoney(taxResult.summary.totalRefundBaseCny)],
    ['Non-refundable Tax (CNY)', formatMoney(taxResult.summary.totalNonRefundableTaxCny)],
    ['Matched Lines', `${taxResult.summary.matchedLineCount}/${taxResult.summary.lineCount}`],
    ['Pending Review Lines', taxResult.summary.fallbackLineCount],
  ]);

  addParagraphList(doc, 'Tax Lines', taxResult.lines || [], (line) => {
    return `${line.productName} | HS:${safeText(line.hsCode)} | Refund:${formatMoney(line.estimatedRefundCny)} CNY | Non-refundable:${formatMoney(line.nonRefundableTaxCny)} CNY | ${line.hsDescription}`;
  });

  doc.moveDown(1);
  doc.fontSize(8).fillColor('#6F7F8E');
  doc.text(`Exported at: ${formatDate(new Date())}`);
  doc.fillColor('black');

  const buffer = await collectPdfBuffer(doc);
  return {
    buffer,
    filename: `${contract.contractNo}_sales_contract_${toFilenameDate()}.pdf`,
    contentType: DEFAULT_PDF_MIME,
  };
};

const exportSystemDataRows = async (type, query = {}) => {
  switch (type) {
    case 'suppliers': {
      const suppliers = await prisma.supplier.findMany({
        include: { aliases: true },
        orderBy: { name: 'asc' },
      });
      return {
        title: 'Suppliers',
        headers: ['ID', 'Name', 'ShortName', 'Contact', 'Phone', 'Email', 'Address', 'Bank', 'QualityIssue', 'Aliases'],
        rows: suppliers.map((item) => [
          item.id,
          item.name,
          item.shortName || '',
          item.contactName || '',
          item.contactPhone || '',
          item.contactEmail || '',
          item.address || '',
          item.bankAccount || '',
          item.hasQualityIssue ? 'Yes' : 'No',
          item.aliases.map((alias) => alias.alias).join('; '),
        ]),
        filename: `suppliers_${toFilenameDate()}.pdf`,
      };
    }
    case 'stores': {
      const stores = await prisma.store.findMany({
        include: { port: true },
        orderBy: { name: 'asc' },
      });
      return {
        title: 'Stores',
        headers: ['ID', 'Name', 'Port', 'Contact', 'Phone', 'Email', 'Address'],
        rows: stores.map((item) => [
          item.id,
          item.name,
          item.port?.name || '',
          item.contactName || '',
          item.contactPhone || '',
          item.contactEmail || '',
          item.address || '',
        ]),
        filename: `stores_${toFilenameDate()}.pdf`,
      };
    }
    case 'products': {
      const products = await prisma.product.findMany({
        include: { category: true },
        orderBy: { customsName: 'asc' },
      });
      return {
        title: 'Products',
        headers: ['ID', 'Customs Name', 'Description', 'Specification', 'Unit', 'Category'],
        rows: products.map((item) => [
          item.id,
          item.customsName,
          item.description || '',
          item.specification || '',
          item.unit || '',
          item.category?.name || '',
        ]),
        filename: `products_${toFilenameDate()}.pdf`,
      };
    }
    case 'purchases': {
      const contracts = await prisma.purchaseContract.findMany({
        include: {
          supplier: true,
          items: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return {
        title: 'Purchases',
        headers: ['Contract No.', 'Supplier', 'Total', 'Received', 'Outstanding', 'Status', 'Signed At', 'Expected', 'Invoice'],
        rows: contracts.map((item) => [
          item.contractNo,
          item.supplier?.name || '',
          formatMoney(item.totalAmount),
          formatMoney(item.paidAmount),
          formatMoney((item.totalAmount || 0) - (item.paidAmount || 0)),
          item.status || '',
          item.signedAt ? formatDate(item.signedAt) : '',
          item.expectedDate ? formatDate(item.expectedDate) : '',
          item.invoiceNo || '',
        ]),
        filename: `purchases_${toFilenameDate()}.pdf`,
      };
    }
    case 'sales': {
      const contracts = await prisma.salesContract.findMany({
        include: {
          items: { include: { product: true, store: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return {
        title: 'Sales Contracts',
        headers: ['Contract No.', 'Total', 'Received', 'Outstanding', 'Exchange Rate', 'Status', 'Signed At'],
        rows: contracts.map((item) => [
          item.contractNo,
          formatMoney(item.totalAmount),
          formatMoney(item.receivedAmount),
          formatMoney((item.totalAmount || 0) - (item.receivedAmount || 0)),
          formatMoney(item.exchangeRate),
          item.status || '',
          item.signedAt ? formatDate(item.signedAt) : '',
        ]),
        filename: `sales_${toFilenameDate()}.pdf`,
      };
    }
    case 'containers': {
      const contracts = await prisma.salesContract.findMany({
        include: {
          port: true,
          packingItems: { include: { product: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return {
        title: 'Containers',
        headers: ['Container No.', 'Port', 'Status', 'Boxes', 'Gross(kg)', 'Net(kg)', 'Volume(CBM)', 'Shipped At', 'Arrival', 'Customs Broker', 'Fumigated', 'Tax Refund'],
        rows: contracts.map((item) => [
          item.contractNo,
          item.port?.name || '',
          item.status || '',
          safeText(item.totalBoxes, '0'),
          formatMoney(item.grossWeight || 0),
          formatMoney(item.netWeight || 0),
          formatMoney(item.volume || 0),
          item.shippedAt ? formatDate(item.shippedAt) : '',
          item.estimatedArrival ? formatDate(item.estimatedArrival) : '',
          item.customsBroker || '',
          item.isFumigated ? 'Yes' : 'No',
          item.hasTaxRefund ? 'Yes' : 'No',
        ]),
        filename: `containers_${toFilenameDate()}.pdf`,
      };
    }
    case 'inventory': {
      const inventories = await prisma.inventory.findMany({
        include: {
          product: true,
          salesContract: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      return {
        title: 'Inventory',
        headers: ['ID', 'Product', 'Quantity', 'Unit', 'Status', 'Container', 'Inbound At', 'Outbound At'],
        rows: inventories.map((item) => [
          item.id,
          item.product?.customsName || '',
          safeText(item.quantity, '0'),
          item.unit || '',
          item.status || '',
          item.salesContract?.contractNo || '',
          item.inboundAt ? formatDate(item.inboundAt) : '',
          item.outboundAt ? formatDate(item.outboundAt) : '',
        ]),
        filename: `inventory_${toFilenameDate()}.pdf`,
      };
    }
    case 'payments': {
      const payments = await prisma.payment.findMany({
        include: {
          purchaseContract: { include: { supplier: true } },
          salesContract: true,
        },
        orderBy: { paymentDate: 'desc' },
      });
      return {
        title: 'Payments',
        headers: ['ID', 'Type', 'Amount', 'Currency', 'Method', 'Payment Date', 'Contract', 'Note'],
        rows: payments.map((item) => [
          item.id,
          item.type === 'PAYABLE' ? 'Payable' : 'Receivable',
          formatMoney(item.amount),
          item.currency || '',
          item.paymentMethod || '',
          formatDate(item.paymentDate),
          item.purchaseContract?.contractNo || item.salesContract?.contractNo || '',
          item.note || '',
        ]),
        filename: `payments_${toFilenameDate()}.pdf`,
      };
    }
    default:
      throw new Error(`不支持的导出类型: ${type}`);
  }
};

const exportSystemDataPdf = async (type, query = {}) => {
  const { title, headers, rows, filename } = await exportSystemDataRows(type, query);
  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
  });

  addDocumentHeader(doc, `${title} PDF`);
  addSectionTitle(doc, title);
  addCsvLikeTable(doc, headers, rows);

  doc.moveDown(0.8);
  doc.fontSize(8).fillColor('#6F7F8E');
  doc.text(`Exported at: ${formatDate(new Date())}`);
  doc.fillColor('black');

  const buffer = await collectPdfBuffer(doc);
  return { buffer, filename, contentType: DEFAULT_PDF_MIME };
};

module.exports = {
  exportSalesContractPdf,
  exportSystemDataPdf,
};
