/**
 * Input: Excel/CSV 文件 buffer、银行类型/发票类型
 * Output: 解析后的银行流水/发票记录、导入结果
 * Pos: 财务数据导入服务，处理银行对账单和发票解析
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
  invNo: ['发票号码', '发票号', '数电票号码', '电子发票号码', '发票编号', 'No', 'no', '发票号码(20位)'],
  invCode: ['发票代码', '代码', '发票代码(12位)'],
  seller: ['销方名称', '销售方名称', '卖方名称', '销售方', '销方'],
  sellerTaxId: ['销方识别号', '销售方纳税人识别号', '销方税号', '销售方税号'],
  buyer: ['购方名称', '购买方名称', '买方名称', '购买方', '购方'],
  buyerTaxId: ['购方识别号', '购买方纳税人识别号', '购方税号', '购买方税号'],
  invDate: ['开票日期', '日期', '开票时间'],
  itemName: ['货物或应税劳务名称', '商品名称', '项目名称', '货物名称', '名称', '货物或应税劳务、服务名称'],
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
  taxClassCode: ['税收分类编码', '分类编码'],
};

// ==================== 辅助函数 ====================

function findCol(headers, candidates) {
  for (const c of candidates) {
    const idx = headers.findIndex((h) => h && String(h).trim() === c);
    if (idx !== -1) return idx;
  }
  return -1;
}

function normalizeHeaders(sheet) {
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const headers = [];
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const cell = sheet[xlsx.utils.encode_cell({ r: range.s.r, c: C })];
    headers.push(cell ? String(cell.v).trim() : '');
  }
  return headers;
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
  const headers = normalizeHeaders(sheet);

  const colMap = {};
  for (const [key, candidates] of Object.entries(INVOICE_COLS)) {
    colMap[key] = findCol(headers, candidates);
  }

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

    const sellerVal = colMap.seller !== -1 ? row[colMap.seller] : null;
    const seller = sellerVal ? String(sellerVal).trim() : '';
    if (!seller) {
      errors.push({ row: i + 2, reason: '缺少销方名称', data: row });
      continue;
    }

    const invDate = colMap.invDate !== -1 ? parseDateCell(row[colMap.invDate]) : null;
    if (!invDate) {
      errors.push({ row: i + 2, reason: '无法识别的开票日期', data: row });
      continue;
    }

    const amount = colMap.amount !== -1 ? parseAmountCell(row[colMap.amount]) : null;
    const tax = colMap.tax !== -1 ? parseAmountCell(row[colMap.tax]) : null;
    let total = colMap.total !== -1 ? parseAmountCell(row[colMap.total]) : null;
    if ((amount === null || amount === 0) && (total === null || total === 0)) {
      errors.push({ row: i + 2, reason: '金额无效', data: row });
      continue;
    }

    const computedAmount = amount !== null ? amount : (total !== null && tax !== null ? total - tax : 0);
    const computedTax = tax !== null ? tax : (total !== null && amount !== null ? total - amount : 0);
    const computedTotal = total !== null ? total : (computedAmount + computedTax);

    let taxRate = colMap.taxRate !== -1 ? String(row[colMap.taxRate] || '').trim() || null : null;
    if (!taxRate && computedAmount > 0 && computedTax > 0) {
      const rate = Math.round((computedTax / computedAmount) * 100);
      taxRate = `${rate}%`;
    }

    const record = {
      invNo: colMap.invNo !== -1 ? String(row[colMap.invNo] || '').trim() || null : null,
      invCode: colMap.invCode !== -1 ? String(row[colMap.invCode] || '').trim() || null : null,
      seller,
      sellerTaxId: colMap.sellerTaxId !== -1 ? String(row[colMap.sellerTaxId] || '').trim() || null : null,
      buyer: colMap.buyer !== -1 ? String(row[colMap.buyer] || '').trim() || null : null,
      buyerTaxId: colMap.buyerTaxId !== -1 ? String(row[colMap.buyerTaxId] || '').trim() || null : null,
      invDate,
      invDateFull: invDate,
      itemName: colMap.itemName !== -1 ? String(row[colMap.itemName] || '').trim() || null : null,
      spec: colMap.spec !== -1 ? String(row[colMap.spec] || '').trim() || null : null,
      unit: colMap.unit !== -1 ? String(row[colMap.unit] || '').trim() || null : null,
      qty: colMap.qty !== -1 ? parseQtyCell(row[colMap.qty]) : null,
      unitPrice: colMap.unitPrice !== -1 ? parseAmountCell(row[colMap.unitPrice]) : null,
      amount: computedAmount,
      taxRate,
      tax: computedTax,
      total: computedTotal,
      invoiceType: colMap.invoiceType !== -1 ? String(row[colMap.invoiceType] || '').trim() || null : null,
      status: colMap.status !== -1 ? String(row[colMap.status] || '').trim() || '正常' : '正常',
      isPositive: colMap.isPositive !== -1 ? String(row[colMap.isPositive] || '').trim() || '是' : '是',
      riskLevel: colMap.riskLevel !== -1 ? String(row[colMap.riskLevel] || '').trim() || null : null,
      issuer: colMap.issuer !== -1 ? String(row[colMap.issuer] || '').trim() || null : null,
      remark: colMap.remark !== -1 ? String(row[colMap.remark] || '').trim() || null : null,
      taxClassCode: colMap.taxClassCode !== -1 ? String(row[colMap.taxClassCode] || '').trim() || null : null,
    };

    // 发票类型筛选（进项/销项）
    if (invoiceType && invoiceType !== 'all') {
      const isInput = record.buyer && record.buyer.includes(COMPANY_NAME);
      const isOutput = record.seller && record.seller.includes(COMPANY_NAME);
      if (invoiceType === 'input' && !isInput) continue;
      if (invoiceType === 'output' && !isOutput) continue;
    }

    records.push(record);
  }

  return { records, errors, previewMapping, totalRows: rows.length };
}

// ==================== 去重与导入 ====================

async function importBankTransactions(records, fileName, importedBy) {
  if (!records || records.length === 0) {
    return { success: 0, failed: 0, skipped: 0, batchId: null, errors: [] };
  }

  const existingTxns = await prisma.bankTransaction.findMany({
    select: { txnId: true, txnDate: true, amount: true, counterpart: true },
    take: 50000,
  });
  const existingKeys = new Set();
  for (const t of existingTxns) {
    if (t.txnId) existingKeys.add(`txn:${t.txnId}`);
    existingKeys.add(`combo:${t.txnDate}|${t.amount}|${t.counterpart || ''}`);
  }

  const deduped = [];
  const dupeErrors = [];
  for (const r of records) {
    const key1 = r.txnId ? `txn:${r.txnId}` : null;
    const key2 = `combo:${r.txnDate}|${r.amount}|${r.counterpart || ''}`;
    if (key1 && existingKeys.has(key1)) {
      dupeErrors.push({ reason: `重复流水号: ${r.txnId}`, data: r });
      continue;
    }
    if (existingKeys.has(key2)) {
      dupeErrors.push({ reason: `重复记录: ${r.txnDate} ${r.amount} ${r.counterpart || ''}`, data: r });
      continue;
    }
    deduped.push(r);
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
