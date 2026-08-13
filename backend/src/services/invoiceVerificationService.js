/**
 * Input: 出货汇总候选行、按发票号码取得的发票记录
 * Output: 发票级销方、金额、品名、状态一致性核验结果与统计
 * Pos: 出口退税发票只读核验 Module；不修改发票、合同或退税记录
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const VALID_INVOICE_NUMBER_LENGTHS = new Set([8, 20]);

function cleanText(value) {
  if (value == null) return null;
  const text = String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u3000/g, ' ')
    .trim();
  if (!text || ['#N/A', '#VALUE!', '#NAME?'].includes(text)) return null;
  return text;
}

function normalizeInvoiceNumber(value) {
  return String(cleanText(value) || '').replace(/\s+/g, '');
}

function isValidInvoiceNumber(value) {
  const normalized = normalizeInvoiceNumber(value);
  return /^\d+$/.test(normalized) && VALID_INVOICE_NUMBER_LENGTHS.has(normalized.length);
}

function normalizeCompany(value) {
  return String(cleanText(value) || '')
    .toLocaleLowerCase('zh-CN')
    .replace(/[\s·•，,。；;：:（）()【】\[\]“”"'‘’]/g, '');
}

function normalizeItem(value) {
  let text = String(cleanText(value) || '').toLocaleLowerCase('zh-CN');
  // 税务清单常以“*税收分类*商品名”表示，分类段不是商品本体。
  text = text.replace(/^\*[^*]+\*/, '');
  return text.replace(/[\s·•，,。；;：:（）()【】\[\]{}\/\\\-_+*&×x]/g, '');
}

function money(value) {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(/[,，¥￥]/g, '').trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

function itemMatches(expectedItems, actualItem) {
  const actualParts = String(actualItem || '')
    .split(/[|｜;；、\n]/)
    .map(normalizeItem)
    .filter(Boolean);
  return expectedItems.every((expected) => {
    const normalizedExpected = normalizeItem(expected);
    if (!normalizedExpected) return false;
    return actualParts.some((actual) => (
      actual === normalizedExpected
      || actual.includes(normalizedExpected)
      || normalizedExpected.includes(actual)
    ));
  });
}

function groupShipmentsByInvoice(shipmentRows) {
  const groups = new Map();
  for (const row of shipmentRows) {
    const invoiceNo = normalizeInvoiceNumber(row.invoiceNo);
    const key = invoiceNo || `__MISSING__${row.sourceRow}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function groupRecordsByInvoice(invoiceRecords) {
  const groups = new Map();
  const seen = new Set();
  for (const record of invoiceRecords) {
    const invoiceNo = normalizeInvoiceNumber(record.invNo);
    if (!invoiceNo) continue;
    const identity = [
      invoiceNo,
      normalizeCompany(record.seller),
      money(record.total),
      cleanText(record.invDate),
      normalizeItem(record.itemName),
    ].join('|');
    if (seen.has(identity)) {
      const existing = groups.get(invoiceNo)?.find((item) => item.__identity === identity);
      if (existing && record.lookupSource) {
        existing.lookupSources = unique([...(existing.lookupSources || []), record.lookupSource]);
      }
      continue;
    }
    seen.add(identity);
    if (!groups.has(invoiceNo)) groups.set(invoiceNo, []);
    groups.get(invoiceNo).push({
      ...record,
      __identity: identity,
      lookupSources: unique([record.lookupSource]),
    });
  }
  return groups;
}

function compareInvoiceGroup(invoiceNo, shipmentRows, actualRecords, amountTolerance) {
  const sourceRows = shipmentRows.map((row) => row.sourceRow);
  const contracts = unique(shipmentRows.map((row) => cleanText(row.contractNo)));
  const expectedSellers = unique(shipmentRows.map((row) => cleanText(row.expectedSeller)));
  const missingExpectedSeller = shipmentRows.some((row) => !cleanText(row.expectedSeller));
  const expectedItems = unique(shipmentRows.map((row) => cleanText(row.itemName)));
  const expectedSupplements = unique(shipmentRows.map((row) => cleanText(row.supplement)));
  const expectedTotals = shipmentRows.map((row) => money(row.expectedTotal));
  const expectedTotal = expectedTotals.every((value) => value != null)
    ? Number(expectedTotals.reduce((sum, value) => sum + value, 0).toFixed(2))
    : null;
  const issues = [];

  if (!invoiceNo) issues.push('源表缺少发票号码');
  else if (!isValidInvoiceNumber(invoiceNo)) issues.push(`发票号码格式异常（${invoiceNo.length}位）`);
  if (missingExpectedSeller) issues.push('源表缺少厂家/预期销方');
  if (expectedSellers.length > 1) issues.push('同一发票号码对应多个预期销方');
  if (expectedTotal == null) issues.push('源表采购金额缺失或无法识别');

  if (actualRecords.length === 0) {
    issues.push('当前发票数据源未查到该号码');
    return {
      status: 'MISSING',
      sourceRows,
      contracts,
      invoiceNo: invoiceNo || null,
      invoiceNumberValid: Boolean(invoiceNo) && isValidInvoiceNumber(invoiceNo),
      expectedSellers,
      expectedItems,
      expectedSupplements,
      expectedTotal,
      found: false,
      actualSeller: null,
      actualSellerTaxId: null,
      actualDate: null,
      actualItems: null,
      actualSpec: null,
      actualQty: null,
      actualAmountExTax: null,
      actualTax: null,
      actualTotal: null,
      actualStatus: null,
      actualIsPositive: null,
      lookupSources: [],
      checks: { seller: null, total: null, item: null, normal: null, positive: null },
      issues,
    };
  }

  if (actualRecords.length > 1) issues.push('同一发票号码查到多条不同发票记录');
  const actual = actualRecords[0];
  const sellerMatch = expectedSellers.length === 1
    && normalizeCompany(expectedSellers[0]) === normalizeCompany(actual.seller);
  const totalMatch = expectedTotal != null
    && money(actual.total) != null
    && Math.abs(expectedTotal - money(actual.total)) <= amountTolerance;
  const itemMatch = expectedItems.length > 0 && itemMatches(expectedItems, actual.itemName);
  const normalMatch = cleanText(actual.status) === '正常';
  const positiveMatch = cleanText(actual.isPositive) === '是';

  if (!sellerMatch) issues.push('销方名称与源表厂家不一致');
  if (!totalMatch) issues.push('价税合计与源表采购金额不一致');
  if (!itemMatch) issues.push('发票品名未覆盖源表报关品名');
  if (!normalMatch) issues.push('发票状态不是正常');
  if (!positiveMatch) issues.push('不是正数发票');

  return {
    status: issues.length === 0 ? 'PASS' : 'REVIEW',
    sourceRows,
    contracts,
    invoiceNo,
    invoiceNumberValid: isValidInvoiceNumber(invoiceNo),
    expectedSellers,
    expectedItems,
    expectedSupplements,
    expectedTotal,
    found: true,
    actualSeller: cleanText(actual.seller),
    actualSellerTaxId: cleanText(actual.sellerTaxId),
    actualDate: cleanText(actual.invDate),
    actualItems: cleanText(actual.itemName),
    actualSpec: cleanText(actual.spec),
    actualQty: actual.qty == null ? null : Number(actual.qty),
    actualAmountExTax: money(actual.amount),
    actualTax: money(actual.tax),
    actualTotal: money(actual.total),
    actualStatus: cleanText(actual.status),
    actualIsPositive: cleanText(actual.isPositive),
    lookupSources: unique(actual.lookupSources || [actual.lookupSource]),
    checks: {
      seller: sellerMatch,
      total: totalMatch,
      item: itemMatch,
      normal: normalMatch,
      positive: positiveMatch,
    },
    issues,
  };
}

function verifyShipmentInvoices({ shipmentRows, invoiceRecords, amountTolerance = 0.02 }) {
  if (!Array.isArray(shipmentRows)) throw new TypeError('shipmentRows 必须是数组');
  if (!Array.isArray(invoiceRecords)) throw new TypeError('invoiceRecords 必须是数组');
  const shipmentGroups = groupShipmentsByInvoice(shipmentRows);
  const recordGroups = groupRecordsByInvoice(invoiceRecords);
  const results = [];
  for (const [key, rows] of shipmentGroups.entries()) {
    const invoiceNo = key.startsWith('__MISSING__') ? '' : key;
    results.push(compareInvoiceGroup(
      invoiceNo,
      rows,
      recordGroups.get(invoiceNo) || [],
      amountTolerance,
    ));
  }
  results.sort((left, right) => {
    const byContract = String(left.contracts[0] || '').localeCompare(String(right.contracts[0] || ''));
    if (byContract !== 0) return byContract;
    return Number(left.sourceRows[0] || 0) - Number(right.sourceRows[0] || 0);
  });
  return {
    summary: {
      shipmentRows: shipmentRows.length,
      uniqueInvoices: results.length,
      found: results.filter((result) => result.found).length,
      pass: results.filter((result) => result.status === 'PASS').length,
      review: results.filter((result) => result.status === 'REVIEW').length,
      missing: results.filter((result) => result.status === 'MISSING').length,
      invalidInvoiceNumber: results.filter((result) => result.invoiceNo && !result.invoiceNumberValid).length,
    },
    results,
  };
}

module.exports = {
  cleanText,
  isValidInvoiceNumber,
  normalizeCompany,
  normalizeInvoiceNumber,
  normalizeItem,
  verifyShipmentInvoices,
};
