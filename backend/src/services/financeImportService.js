/**
 * Input: Excel/CSV 文件 buffer、银行类型/发票类型
 * Output: 解析后的银行流水/发票记录、导入结果
 * Pos: 财务数据导入服务，处理银行对账单和发票清单解析（含标题行和发票多明细聚合）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const xlsx = require('xlsx');
const prisma = require('../utils/prisma');

const COMPANY_NAME = '上海捷淞国际物流有限公司';

// ==================== 银行模板列映射 ====================

const BANK_TEMPLATES = {
  ICBC: {
    dateCols: ['交易日期', '日期'],
    timeCols: ['交易时间', '时间'],
    incomeCols: ['收入', '收入金额', '贷方发生额', '贷方金额', '贷方'],
    expenseCols: ['支出', '支出金额', '借方发生额', '借方金额', '借方'],
    balanceCols: ['余额', '账户余额'],
    counterpartCols: ['对方户名', '对方账户名称', '对方名称', '交易对手'],
    summaryCols: ['摘要', '用途', '备注'],
    txnTypeCols: ['交易类型', '业务类型'],
    txnIdCols: ['交易流水号', '流水号', '交易序号'],
    payerCols: ['付方名称', '付款方'],
    payeeCols: ['收方名称', '收款方'],
  },
  CCB: {
    dateCols: ['交易日期', '日期'],
    timeCols: ['交易时间', '时间'],
    incomeCols: ['收入', '收入金额', '贷方发生额', '存入金额', '贷方'],
    expenseCols: ['支出', '支出金额', '借方发生额', '支出金额', '借方'],
    balanceCols: ['余额', '账户余额', '账户余额(元)'],
    counterpartCols: ['对方户名', '对方账户名称', '对方名称', '交易对手', '对方账号户名'],
    summaryCols: ['摘要', '用途', '备注', '摘要说明'],
    txnTypeCols: ['交易类型', '业务类型', '交易类别'],
    txnIdCols: ['交易流水号', '流水号', '交易序号', '凭证号'],
    payerCols: ['付方名称', '付款方', '付款人'],
    payeeCols: ['收方名称', '收款方', '收款人'],
  },
  GENERIC: {
    dateCols: ['交易日期', '日期', 'date', 'Date', '交易时间'],
    timeCols: ['交易时间', '时间', 'time', 'Time'],
    incomeCols: ['收入', '收入金额', '贷方发生额', '贷方金额', 'income', 'credit', '存入', '贷方', '收入(元)'],
    expenseCols: ['支出', '支出金额', '借方发生额', '借方金额', 'expense', 'debit', '支出', '借方', '支出(元)'],
    balanceCols: ['余额', '账户余额', 'balance', 'Balance', '余额(元)'],
    counterpartCols: ['对方户名', '对方账户名称', '对方名称', '交易对手', 'counterpart', '对方', '交易对方'],
    summaryCols: ['摘要', '用途', '备注', 'summary', '用途摘要'],
    txnTypeCols: ['交易类型', '业务类型', 'txnType', 'Type', '业务种类'],
    txnIdCols: ['交易流水号', '流水号', '交易序号', 'txnId', 'No', '编号', '交易单号'],
    payerCols: ['付方名称', '付款方', 'payer', '付款人', '转出方'],
    payeeCols: ['收方名称', '收款方', 'payee', '收款人', '转入方'],
  },
};

// ==================== 发票模板列映射 ====================

const INVOICE_COLS = {
  // 税务平台全量导出会同时保留空的“发票号码”和实际有值的“数电发票号码”，数电列必须优先。
  invNo: ['数电发票号码', '数电票号码', '电子发票号码', '发票号码(20位)', '发票号码', '发票号', '发票编号', 'No', 'no'],
  invCode: ['发票代码', '代码', '发票代码(12位)'],
  seller: ['销方名称', '销售方名称', '卖方名称', '销售方', '销方'],
  sellerTaxId: ['销方识别号', '销售方纳税人识别号', '销方税号', '销售方税号'],
  buyer: ['购方名称', '购买方名称', '买方名称', '购买方', '购方'],
  buyerTaxId: ['购方识别号', '购买方纳税人识别号', '购方税号', '购买方税号'],
  invDate: ['开票日期', '日期', '开票时间'],
  itemName: ['货物或应税劳务名称', '商品名称', '项目名称', '开票项目', '货物名称', '名称', '货物或应税劳务、服务名称'],
  spec: ['规格型号', '规格', '型号'],
  unit: ['单位', '计量单位'],
  qty: ['数量', 'Qty', 'qty'],
  unitPrice: ['单价', 'UnitPrice', '单价(元)'],
  amount: ['金额', '不含税金额', '销售额', '金额(元)'],
  taxRate: ['税率', 'TaxRate', '税率(%)'],
  tax: ['税额', 'Tax', '税额(元)'],
  total: ['价税合计', '合计', 'Total', '总金额', '价税合计(元)'],
  invoiceType: ['发票种类', '发票票种', '票种', '类型', '发票类型'],
  status: ['发票状态', '状态'],
  isPositive: ['是否正数发票', '正数发票', '正负', '正负数'],
  riskLevel: ['发票风险等级', '风险等级'],
  issuer: ['开票人', '开票员'],
  remark: ['备注', '备注信息'],
  taxClassCode: ['税收分类编码', '税收编码', '分类编码'],
};

// ==================== 辅助函数 ====================

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h && String(h).trim() === c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeHeaders(sheet, rowIndex) {
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const headerRow = rowIndex === undefined ? range.s.r : rowIndex;
  const headers = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cell = sheet[xlsx.utils.encode_cell({ r: headerRow, c: C })];
    headers.push(cell ? String(cell.v).trim() : '');
  }
  return headers;
}

function findInvoiceHeaderRow(sheet) {
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const lastRow = Math.min(range.e.r, range.s.r + 19);
  let best = { row: range.s.r, score: -1 };

  for (let row = range.s.r; row <= lastRow; row++) {
    const headers = normalizeHeaders(sheet, row);
    const hasSeller = findCol(headers, INVOICE_COLS.seller) !== -1;
    const hasBuyer = findCol(headers, INVOICE_COLS.buyer) !== -1;
    const hasDate = findCol(headers, INVOICE_COLS.invDate) !== -1;
    const hasAmount = findCol(headers, INVOICE_COLS.amount) !== -1 || findCol(headers, INVOICE_COLS.total) !== -1;
    const score = Object.values(INVOICE_COLS).reduce(
      (matched, candidates) => matched + (findCol(headers, candidates) !== -1 ? 1 : 0),
      0
    );

    if ((hasSeller || hasBuyer) && hasDate && hasAmount && score > best.score) {
      best = { row, score };
    }
  }

  return best.row;
}

function parseDateCell(value) {
  if (!value) return null;
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(value).trim();
  const m1 = s.match(/^(\d{4})[-/\.\s年](\d{1,2})[-/\.\s月](\d{1,2})/);
  if (m1) return `${m1[1]}-${String(m1[2]).padStart(2, '0')}-${String(m1[3]).padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})[-/\.\s月](\d{1,2})[-/\.\s日](\d{4})/);
  if (m2) return `${m2[3]}-${String(m2[1]).padStart(2, '0')}-${String(m2[2]).padStart(2, '0')}`;
  const m3 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m3) return `${m3[1]}-${m3[2]}-${m3[3]}`;
  return null;
}

function parseAmountCell(value) {
  if (typeof value === 'number') return value;
  if (!value && value !== 0) return null;
  const cleaned = String(value).replace(/[,，]/g, '').replace(/[¥￥$€£\s]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function parseQtyCell(value) {
  const num = parseAmountCell(value);
  if (num === null) return null;
  return Number.isInteger(num) ? num : num;
}

function textCell(row, colIndex) {
  if (colIndex === -1) return null;
  const value = row[colIndex];
  if (value === null || value === undefined) return null;
  return String(value).trim() || null;
}

function roundMoney(value) {
  return Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
}

function normalizeBankCurrency(value) {
  return String(value || 'CNY').trim().toUpperCase() || 'CNY';
}

function normalizeMaskedAccount(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const suffix = normalized.replace(/\D/g, '').slice(-4);
  return suffix ? `****${suffix}` : null;
}

function buildBankLegacyKey(record) {
  return [
    normalizeBankCurrency(record.currency),
    record.txnDate || '',
    Number(record.amount || 0).toFixed(2),
    String(record.counterpart || '').trim(),
  ].join('|');
}

function buildBankPreciseKey(record) {
  return [
    buildBankLegacyKey(record),
    normalizeMaskedAccount(record.accountNoMasked) || '',
    record.balance === null || record.balance === undefined ? '' : Number(record.balance).toFixed(2),
    String(record.summary || '').trim(),
    String(record.txnId || '').trim(),
  ].join('|');
}

function appendUniqueText(current, incoming) {
  if (!incoming) return current || null;
  const values = current ? current.split('；') : [];
  if (!values.includes(incoming)) values.push(incoming);
  return values.join('；');
}

function mergeInvoiceRecord(target, incoming) {
  target.itemName = appendUniqueText(target.itemName, incoming.itemName);
  target.spec = appendUniqueText(target.spec, incoming.spec);
  target.unit = appendUniqueText(target.unit, incoming.unit);
  target.taxClassCode = appendUniqueText(target.taxClassCode, incoming.taxClassCode);
  target.taxRate = appendUniqueText(target.taxRate, incoming.taxRate);
  target.remark = appendUniqueText(target.remark, incoming.remark);
  target.amount = roundMoney(target.amount + incoming.amount);
  target.tax = roundMoney(target.tax + incoming.tax);
  target.total = roundMoney(target.total + incoming.total);
  target.qty = null;
  target.unitPrice = null;
}

// ==================== 银行对账单解析 ====================

function parseBankStatement(buffer, bankType) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const headers = normalizeHeaders(sheet);
  const template = BANK_TEMPLATES[bankType] || BANK_TEMPLATES.GENERIC;

  const colMap = {
    date: findCol(headers, template.dateCols),
    time: findCol(headers, template.timeCols),
    income: findCol(headers, template.incomeCols),
    expense: findCol(headers, template.expenseCols),
    balance: findCol(headers, template.balanceCols),
    counterpart: findCol(headers, template.counterpartCols),
    summary: findCol(headers, template.summaryCols),
    txnType: findCol(headers, template.txnTypeCols),
    txnId: findCol(headers, template.txnIdCols),
    payer: findCol(headers, template.payerCols),
    payee: findCol(headers, template.payeeCols),
  };

  const previewMapping = {};
  for (const [key, idx] of Object.entries(colMap)) {
    if (idx !== -1) previewMapping[key] = headers[idx];
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: 1 });
  const records = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c && c !== 0)) continue;

    const dateVal = colMap.date !== -1 ? row[colMap.date] : null;
    const txnDate = parseDateCell(dateVal);
    if (!txnDate) {
      errors.push({ row: i + 2, reason: '无法识别的交易日期', data: row });
      continue;
    }

    const income = colMap.income !== -1 ? parseAmountCell(row[colMap.income]) : null;
    const expense = colMap.expense !== -1 ? parseAmountCell(row[colMap.expense]) : null;

    let amount = 0;
    let direction = 'IN';
    if (income !== null && income > 0) {
      amount = income;
      direction = 'IN';
    } else if (expense !== null && expense > 0) {
      amount = -expense;
      direction = 'OUT';
    } else {
      const rawAmount = colMap.income !== -1 ? parseAmountCell(row[colMap.income]) : null;
      if (rawAmount !== null && rawAmount !== 0) {
        amount = rawAmount;
        direction = rawAmount > 0 ? 'IN' : 'OUT';
      } else {
        const rawExpense = colMap.expense !== -1 ? parseAmountCell(row[colMap.expense]) : null;
        if (rawExpense !== null && rawExpense !== 0) {
          amount = rawExpense;
          direction = rawExpense > 0 ? 'IN' : 'OUT';
        }
      }
    }

    if (amount === 0) {
      errors.push({ row: i + 2, reason: '金额为0或无法解析', data: row });
      continue;
    }

    const counterpart = colMap.counterpart !== -1 ? String(row[colMap.counterpart] || '').trim() || null : null;
    const summary = colMap.summary !== -1 ? String(row[colMap.summary] || '').trim() || null : null;
    const txnType = colMap.txnType !== -1 ? String(row[colMap.txnType] || '').trim() || null : null;
    const txnId = colMap.txnId !== -1 ? String(row[colMap.txnId] || '').trim() || null : null;
    const balance = colMap.balance !== -1 ? parseAmountCell(row[colMap.balance]) : null;
    const payer = colMap.payer !== -1 ? String(row[colMap.payer] || '').trim() || null : null;
    const payee = colMap.payee !== -1 ? String(row[colMap.payee] || '').trim() || null : null;

    const timeVal = colMap.time !== -1 ? row[colMap.time] : null;
    let txnTime = txnDate;
    if (timeVal) {
      if (timeVal instanceof Date) {
        const h = String(timeVal.getHours()).padStart(2, '0');
        const m = String(timeVal.getMinutes()).padStart(2, '0');
        const s = String(timeVal.getSeconds()).padStart(2, '0');
        txnTime = `${txnDate} ${h}:${m}:${s}`;
      } else {
        const t = String(timeVal).trim();
        txnTime = t.includes(':') ? `${txnDate} ${t}` : txnDate;
      }
    }

    records.push({
      txnTime,
      txnDate,
      amount,
      payer,
      payee,
      summary,
      txnType,
      txnId,
      balance,
      counterpart,
      direction,
    });
  }

  return { records, errors, previewMapping, totalRows: rows.length };
}

// ==================== 发票解析 ====================

function parseInvoices(buffer, invoiceType) {
  const workbook = xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const headerRowIndex = findInvoiceHeaderRow(sheet);
  const headers = normalizeHeaders(sheet, headerRowIndex);

  const colMap = {};
  for (const [key, candidates] of Object.entries(INVOICE_COLS)) {
    colMap[key] = findCol(headers, candidates);
  }

  const previewMapping = {};
  for (const [key, idx] of Object.entries(colMap)) {
    if (idx !== -1) previewMapping[key] = headers[idx];
  }

  const sequenceCol = findCol(headers, ['序号']);
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, range: headerRowIndex + 1 });
  const records = [];
  const errors = [];
  const invoiceRecordMap = new Map();
  const implicitInputBuyer = invoiceType === 'input' && colMap.buyer === -1 && colMap.seller !== -1;
  let currentInputRecord = null;

  function parseInvoiceRow(row, sourceRow) {
    const seller = textCell(row, colMap.seller) || '';
    if (!seller) {
      errors.push({ row: sourceRow, reason: '缺少销方名称', data: row });
      return null;
    }

    const invDate = colMap.invDate !== -1 ? parseDateCell(row[colMap.invDate]) : null;
    if (!invDate) {
      errors.push({ row: sourceRow, reason: '无法识别的开票日期', data: row });
      return null;
    }

    const amount = colMap.amount !== -1 ? parseAmountCell(row[colMap.amount]) : null;
    const tax = colMap.tax !== -1 ? parseAmountCell(row[colMap.tax]) : null;
    const total = colMap.total !== -1 ? parseAmountCell(row[colMap.total]) : null;
    if ((amount === null || amount === 0) && (total === null || total === 0)) {
      errors.push({ row: sourceRow, reason: '金额无效', data: row });
      return null;
    }

    const computedAmount = amount !== null ? amount : (total !== null && tax !== null ? total - tax : 0);
    const computedTax = tax !== null ? tax : (total !== null && amount !== null ? total - amount : 0);
    const computedTotal = total !== null ? total : (computedAmount + computedTax);

    let taxRate = textCell(row, colMap.taxRate);
    if (!taxRate && computedAmount > 0 && computedTax > 0) {
      const rate = Math.round((computedTax / computedAmount) * 100);
      taxRate = `${rate}%`;
    }

    return {
      invNo: textCell(row, colMap.invNo),
      invCode: textCell(row, colMap.invCode),
      seller,
      sellerTaxId: textCell(row, colMap.sellerTaxId),
      buyer: implicitInputBuyer ? COMPANY_NAME : textCell(row, colMap.buyer),
      buyerTaxId: textCell(row, colMap.buyerTaxId),
      invDate,
      invDateFull: invDate,
      itemName: textCell(row, colMap.itemName),
      spec: textCell(row, colMap.spec),
      unit: textCell(row, colMap.unit),
      qty: colMap.qty !== -1 ? parseQtyCell(row[colMap.qty]) : null,
      unitPrice: colMap.unitPrice !== -1 ? parseAmountCell(row[colMap.unitPrice]) : null,
      amount: roundMoney(computedAmount),
      taxRate,
      tax: roundMoney(computedTax),
      total: roundMoney(computedTotal),
      invoiceType: textCell(row, colMap.invoiceType),
      status: textCell(row, colMap.status) || '正常',
      isPositive: textCell(row, colMap.isPositive) || '是',
      riskLevel: textCell(row, colMap.riskLevel),
      issuer: textCell(row, colMap.issuer),
      remark: textCell(row, colMap.remark),
      taxClassCode: textCell(row, colMap.taxClassCode),
    };
  }

  function appendInvoiceDetail(record, row) {
    const itemName = textCell(row, colMap.itemName);
    const spec = textCell(row, colMap.spec);
    const unit = textCell(row, colMap.unit);
    const taxClassCode = textCell(row, colMap.taxClassCode);
    const amount = colMap.amount !== -1 ? parseAmountCell(row[colMap.amount]) : null;
    const tax = colMap.tax !== -1 ? parseAmountCell(row[colMap.tax]) : null;
    const total = colMap.total !== -1 ? parseAmountCell(row[colMap.total]) : null;
    const computedAmount = amount !== null ? amount : (total !== null && tax !== null ? total - tax : 0);
    const computedTax = tax !== null ? tax : (total !== null && amount !== null ? total - amount : 0);
    const computedTotal = total !== null ? total : (computedAmount + computedTax);

    record.itemName = appendUniqueText(record.itemName, itemName);
    record.spec = appendUniqueText(record.spec, spec);
    record.unit = appendUniqueText(record.unit, unit);
    record.taxClassCode = appendUniqueText(record.taxClassCode, taxClassCode);
    record.taxRate = appendUniqueText(record.taxRate, textCell(row, colMap.taxRate));
    record.amount = roundMoney(record.amount + computedAmount);
    record.tax = roundMoney(record.tax + computedTax);
    record.total = roundMoney(record.total + computedTotal);
    record.qty = null;
    record.unitPrice = null;
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => !c && c !== 0)) continue;
    const sourceRow = headerRowIndex + i + 2;
    const sequence = textCell(row, sequenceCol);
    if (sequence && /^(合计|总计|小计|说明)/.test(sequence)) continue;
    // 税务导出清单尾部还有按票种统计的小表；真实发票序号只允许纯数字。
    if (implicitInputBuyer && sequence && !/^\d+$/.test(sequence)) continue;

    if (implicitInputBuyer && !textCell(row, colMap.invNo)) {
      const hasDetail = Boolean(
        textCell(row, colMap.itemName) ||
        textCell(row, colMap.spec) ||
        textCell(row, colMap.taxClassCode) ||
        (colMap.qty !== -1 && parseQtyCell(row[colMap.qty]) !== null)
      );
      if (currentInputRecord && hasDetail) appendInvoiceDetail(currentInputRecord, row);
      continue;
    }

    const record = parseInvoiceRow(row, sourceRow);
    if (!record) continue;

    // 发票类型筛选（进项/销项）
    if (invoiceType && invoiceType !== 'all') {
      const isInput = record.buyer && record.buyer.includes(COMPANY_NAME);
      const isOutput = record.seller && record.seller.includes(COMPANY_NAME);
      if (invoiceType === 'input' && !isInput) continue;
      if (invoiceType === 'output' && !isOutput) continue;
    }

    const invoiceKey = record.invNo ? `${record.invCode || ''}|${record.invNo}` : null;
    const existingRecord = invoiceKey ? invoiceRecordMap.get(invoiceKey) : null;
    if (existingRecord) {
      mergeInvoiceRecord(existingRecord, record);
      currentInputRecord = implicitInputBuyer ? existingRecord : null;
      continue;
    }

    records.push(record);
    if (invoiceKey) invoiceRecordMap.set(invoiceKey, record);
    currentInputRecord = implicitInputBuyer ? record : null;
  }

  return {
    records,
    errors,
    previewMapping,
    totalRows: rows.length,
    headerRow: headerRowIndex + 1,
  };
}

// ==================== 去重与导入 ====================

async function importBankTransactions(records, fileName, importedBy) {
  if (!records || records.length === 0) {
    return { success: 0, failed: 0, skipped: 0, batchId: null, errors: [] };
  }

  const existingTxns = await prisma.bankTransaction.findMany({
    select: {
      txnId: true,
      txnDate: true,
      amount: true,
      counterpart: true,
      balance: true,
      summary: true,
      currency: true,
      accountNoMasked: true,
    },
    take: 50000,
  });
  const existingPreciseKeys = new Set();
  const legacyKeysWithoutAccount = new Set();
  for (const t of existingTxns) {
    existingPreciseKeys.add(buildBankPreciseKey(t));
    if (!normalizeMaskedAccount(t.accountNoMasked)) {
      legacyKeysWithoutAccount.add(buildBankLegacyKey(t));
    }
  }

  const deduped = [];
  const dupeErrors = [];
  const seenPreciseKeys = new Set();
  const seenLegacyKeysWithoutAccount = new Set();
  for (const r of records) {
    const normalized = {
      ...r,
      bankName: String(r.bankName || '').trim() || null,
      accountNoMasked: normalizeMaskedAccount(r.accountNoMasked),
      currency: normalizeBankCurrency(r.currency),
    };
    const preciseKey = buildBankPreciseKey(normalized);
    const legacyKey = buildBankLegacyKey(normalized);
    const duplicateByPrecise = existingPreciseKeys.has(preciseKey) || seenPreciseKeys.has(preciseKey);
    const duplicateByLegacy = legacyKeysWithoutAccount.has(legacyKey)
      || seenLegacyKeysWithoutAccount.has(legacyKey);

    if (duplicateByPrecise || duplicateByLegacy) {
      dupeErrors.push({
        reason: '重复银行流水',
        data: { txnDate: normalized.txnDate, currency: normalized.currency, accountNoMasked: normalized.accountNoMasked },
      });
      continue;
    }

    deduped.push(normalized);
    seenPreciseKeys.add(preciseKey);
    if (!normalized.accountNoMasked) seenLegacyKeysWithoutAccount.add(legacyKey);
  }

  if (deduped.length === 0) {
    return { success: 0, failed: 0, skipped: records.length, batchId: null, errors: dupeErrors };
  }

  const dates = deduped.map((r) => r.txnDate).filter(Boolean).sort();
  const dataStartDate = dates[0] || null;
  const dataEndDate = dates[dates.length - 1] || null;

  const batch = await prisma.financeDataBatch.create({
    data: {
      type: 'BANK_FLOW',
      fileName: fileName || 'bank_import.xlsx',
      recordCount: deduped.length,
      dataStartDate,
      dataEndDate,
    },
  });

  const BATCH_SIZE = 50;
  let createdCount = 0;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const chunk = deduped.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, batchId: batch.id }));
    const result = await prisma.bankTransaction.createMany({ data: chunk });
    createdCount += result.count;
  }

  return {
    success: createdCount,
    failed: 0,
    skipped: records.length - deduped.length,
    batchId: batch.id,
    errors: dupeErrors,
  };
}

async function importInvoiceRecords(records, fileName, importedBy) {
  if (!records || records.length === 0) {
    return { success: 0, failed: 0, skipped: 0, batchId: null, errors: [] };
  }

  const existingInvs = await prisma.invoiceRecord.findMany({
    select: { invCode: true, invNo: true },
    take: 50000,
  });
  const existingKeys = new Set();
  for (const inv of existingInvs) {
    const key = `${inv.invCode || ''}|${inv.invNo || ''}`;
    if (key !== '|') existingKeys.add(key);
  }

  const deduped = [];
  const dupeErrors = [];
  for (const r of records) {
    const key = `${r.invCode || ''}|${r.invNo || ''}`;
    if (key !== '|' && existingKeys.has(key)) {
      dupeErrors.push({ reason: `重复发票: ${r.invCode || ''} ${r.invNo || ''}`, data: r });
      continue;
    }
    deduped.push(r);
  }

  if (deduped.length === 0) {
    return { success: 0, failed: 0, skipped: records.length, batchId: null, errors: dupeErrors };
  }

  const dates = deduped.map((r) => r.invDate).filter(Boolean).sort();
  const dataStartDate = dates[0] || null;
  const dataEndDate = dates[dates.length - 1] || null;

  const batch = await prisma.financeDataBatch.create({
    data: {
      type: 'INVOICE',
      fileName: fileName || 'invoice_import.xlsx',
      recordCount: deduped.length,
      dataStartDate,
      dataEndDate,
    },
  });

  const BATCH_SIZE = 30;
  let createdCount = 0;
  for (let i = 0; i < deduped.length; i += BATCH_SIZE) {
    const chunk = deduped.slice(i, i + BATCH_SIZE).map((r) => ({ ...r, batchId: batch.id }));
    const result = await prisma.invoiceRecord.createMany({ data: chunk });
    createdCount += result.count;
  }

  return {
    success: createdCount,
    failed: 0,
    skipped: records.length - deduped.length,
    batchId: batch.id,
    errors: dupeErrors,
  };
}

module.exports = {
  parseBankStatement,
  parseInvoices,
  importBankTransactions,
  importInvoiceRecords,
};
