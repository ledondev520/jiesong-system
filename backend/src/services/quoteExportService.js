/**
 * Input: a quote id (loaded with items, products, stores, customer)
 * Output: a streamed Quotation / Proforma Invoice workbook (exceljs) or a print-friendly HTML view; nothing is stored
 * Pos: docs/redesign/UX-REDESIGN-2026.md §6.2 — the 外销合同 sheet layout with a Ship-to Store column and per-store subtotals.
 * Never printed: costs, markups, cost suppliers/contracts, manual-price flags. Both outputs are built from buildQuoteDocument only.
 * shortcut: seller prints DEFAULT_SELLER_NAME only (no address/bank), until 设置 > 公司信息 exists and the owner confirms bank details (Q9).
 */
const ExcelJS = require('exceljs');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { DEFAULT_SELLER_NAME, applyTitle, styleTable, configureSheet } = require('./exportPacketService');

const SHANGHAI_OFFSET_MS = 8 * 3600 * 1000;
const COLUMNS = ['No.', 'Description', 'Specification', 'HS Code', 'Quantity', 'Unit', 'Unit Price (USD)', 'Amount (USD)', 'Ship-to Store', 'Remarks'];

const day = (date) => (date ? new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10) : '-');
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Plain document model; the only place quote fields are chosen for printing. */
const buildQuoteDocument = (quote, sellerName = DEFAULT_SELLER_NAME) => {
  const isPi = ['ACCEPTED', 'CONVERTED'].includes(quote.status);
  const label = (item) => item.store?.code || item.store?.name || '-';
  const sorted = [...quote.items].sort((a, b) => label(a).localeCompare(label(b)) || a.sortOrder - b.sortOrder);
  const groups = [];
  for (const item of sorted) {
    const key = label(item);
    if (!groups.length || groups.at(-1).store !== key) groups.push({ store: key, lines: [] });
    groups.at(-1).lines.push({
      description: item.product?.customsName || '', specification: item.specification || '', hsCode: item.product?.hsCode || '',
      quantity: item.quantity, unit: item.unit || '', unitPrice: item.unitPrice, amount: round2(item.unitPrice * item.quantity),
      store: key, remarks: item.note || '',
    });
  }
  let number = 0;
  for (const group of groups) {
    group.lines.forEach((line) => { number += 1; line.index = number; });
    group.quantity = group.lines.reduce((sum, line) => sum + line.quantity, 0);
    group.amount = round2(group.lines.reduce((sum, line) => sum + line.amount, 0));
  }
  const ports = [...new Set(sorted.map((item) => item.store?.port?.name).filter(Boolean))];
  return {
    title: isPi ? 'PROFORMA INVOICE / 形式发票' : 'QUOTATION / 报价单',
    quoteNo: quote.quoteNo,
    header: [
      ['Seller', sellerName, isPi ? 'PI No.' : 'Quote No.', quote.quoteNo],
      ['Buyer', quote.customer?.legalName || quote.customer?.name || '-', 'Date', day(quote.sentAt || quote.createdAt)],
      ['Destination', ports.join(', ') || '-', 'Trade Term', [quote.incoterm, quote.portOfLoading].filter(Boolean).join(' ')],
      ['Currency', quote.currency, 'Valid Until', day(quote.validUntil)],
    ],
    paymentTerms: quote.paymentTerms || '-',
    groups,
    totalQuantity: groups.reduce((sum, group) => sum + group.quantity, 0),
    totalAmount: round2(groups.reduce((sum, group) => sum + group.amount, 0)),
  };
};

const buildQuoteWorkbook = async (doc) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '捷淞进销存系统';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('外销合同');
  configureSheet(sheet);
  applyTitle(sheet, doc.title, doc.quoteNo);
  doc.header.forEach((values, offset) => {
    const row = 4 + offset;
    sheet.getCell(row, 1).value = values[0];
    sheet.mergeCells(row, 2, row, 5);
    sheet.getCell(row, 2).value = values[1];
    sheet.getCell(row, 6).value = values[2];
    sheet.mergeCells(row, 7, row, 10);
    sheet.getCell(row, 7).value = values[3];
  });
  sheet.getCell(8, 1).value = 'Payment Terms';
  sheet.mergeCells(8, 2, 8, 10);
  sheet.getCell(8, 2).value = doc.paymentTerms;
  for (let row = 4; row <= 8; row += 1) {
    [1, 6].forEach((column) => { if (row < 8 || column === 1) sheet.getCell(row, column).font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E3A5F' } }; });
  }
  sheet.getRow(9).values = COLUMNS;
  let row = 10;
  const summaryRows = [];
  const summary = (label, quantity, amount) => {
    sheet.mergeCells(row, 1, row, 4);
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 5).value = quantity;
    sheet.getCell(row, 8).value = amount;
    summaryRows.push(row);
    row += 1;
  };
  for (const group of doc.groups) {
    for (const line of group.lines) {
      sheet.getRow(row).values = [line.index, line.description, line.specification, line.hsCode, line.quantity, line.unit,
        line.unitPrice, line.amount, line.store, line.remarks];
      row += 1;
    }
    summary(`SUBTOTAL ${group.store}`, group.quantity, group.amount);
  }
  summary('TOTAL / 合计', doc.totalQuantity, doc.totalAmount);
  styleTable(sheet, 9, row - 1, 10);
  summaryRows.forEach((r) => [1, 5, 8].forEach((c) => { sheet.getCell(r, c).font = { name: 'Arial', size: 9, bold: true }; }));
  sheet.getColumn(7).numFmt = '#,##0.00';
  sheet.getColumn(8).numFmt = '#,##0.00';
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (value) => Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const buildQuoteHtml = (doc) => {
  const cell = (value, tag = 'td') => `<${tag}>${escapeHtml(value)}</${tag}>`;
  const lines = doc.groups.map((group) => group.lines.map((line) => `<tr>${[line.index, line.description, line.specification, line.hsCode,
    line.quantity, line.unit, money(line.unitPrice), money(line.amount), line.store, line.remarks].map((v) => cell(v)).join('')}</tr>`).join('')
    + `<tr class="sum"><td colspan="4">SUBTOTAL ${escapeHtml(group.store)}</td>${cell(group.quantity)}<td colspan="2"></td>${cell(money(group.amount))}<td colspan="2"></td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(doc.quoteNo)}</title><style>
body{font:12px Arial,sans-serif;margin:16px}h1{text-align:center;font-size:20px;margin:0}.no{text-align:center;color:#475569;margin:4px 0 12px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #b7c4ce;padding:4px;text-align:center}th{background:#1e3a5f;color:#fff}
.meta td{border:0;text-align:left}.sum td{font-weight:bold;background:#f1f5f9}@page{size:A4 landscape;margin:8mm}</style></head><body>
<h1>${escapeHtml(doc.title)}</h1><div class="no">${escapeHtml(doc.quoteNo)}</div>
<table class="meta">${doc.header.map((r) => `<tr><td><b>${escapeHtml(r[0])}</b></td>${cell(r[1])}<td><b>${escapeHtml(r[2])}</b></td>${cell(r[3])}</tr>`).join('')}
<tr><td><b>Payment Terms</b></td><td colspan="3">${escapeHtml(doc.paymentTerms)}</td></tr></table>
<table><thead><tr>${COLUMNS.map((c) => cell(c, 'th')).join('')}</tr></thead><tbody>${lines}
<tr class="sum"><td colspan="4">TOTAL / 合计</td>${cell(doc.totalQuantity)}<td colspan="2"></td>${cell(money(doc.totalAmount))}<td colspan="2"></td></tr></tbody></table></body></html>`;
};

const loadQuoteDocument = async (id) => {
  const quote = await prisma.quote.findUnique({ where: { id }, include: {
    items: { orderBy: { sortOrder: 'asc' }, include: {
      product: { select: { customsName: true, hsCode: true } },
      store: { select: { name: true, code: true, port: { select: { name: true } } } },
    } },
    customer: { select: { name: true, legalName: true } },
  } });
  if (!quote) throw createError('报价不存在', 404);
  return { quote, doc: buildQuoteDocument(quote) };
};

const exportQuoteXlsx = async (id) => {
  const { doc } = await loadQuoteDocument(id);
  return { fileName: `${doc.quoteNo}.xlsx`, buffer: await buildQuoteWorkbook(doc) };
};

const renderQuoteHtml = async (id) => buildQuoteHtml((await loadQuoteDocument(id)).doc);

module.exports = { buildQuoteDocument, buildQuoteWorkbook, buildQuoteHtml, exportQuoteXlsx, renderQuoteHtml };
