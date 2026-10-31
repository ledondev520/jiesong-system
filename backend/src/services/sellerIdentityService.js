/**
 * Input: SystemConfig rows companyName / companyAddress / companyPhone / companyTaxId / companyBankInfo (canonical) and the legacy
 *        invoiceTitleInfo text (read-only alias)
 * Output: ONE seller identity {name, address, phone, taxId, bank, legacyFilled} plus the composed 开票抬头 text
 * Pos: single source of truth for every seller-info reader (quotation/PI export, 催票 text, settings page prefill). Canonical keys win
 *      field by field; the legacy invoiceTitleInfo only fills fields that are still empty, so old data is never lost. Writes go to the
 *      canonical keys only (configController refuses invoiceTitleInfo). companyBankInfo (and any legacy text, which may contain bank
 *      lines) is Restricted: callers pass includeBank=false for roles other than ADMIN/FINANCE.
 */
const prisma = require('../utils/prisma');
const { normalizeConfigValueForResponse } = require('../utils/secretCrypto');
const { LEGACY_INVOICE_TITLE_KEY } = require('../utils/companyConfig');
const { FIELD_KEYS, parseLegacyInvoiceTitle } = require('../utils/legacyInvoiceTitle');

const asText = (key, raw) => {
  const value = normalizeConfigValueForResponse(key, raw);
  return typeof value === 'string' ? value.trim() : '';
};

/** 催票等文本用的开票抬头：由统一的卖方信息生成；全部为空时才回退旧文本原文。 */
const composeInvoiceTitleText = (identity, legacyText = '') => {
  const lines = [];
  if (identity.name) lines.push(`公司名称：${identity.name}`);
  if (identity.taxId) lines.push(`纳税人识别号：${identity.taxId}`);
  const addressPhone = [identity.address, identity.phone].filter(Boolean).join(' ');
  if (addressPhone) lines.push(`地址电话：${addressPhone.replace(/\n/g, ' ')}`);
  if (identity.bank) lines.push(`开户行及账号：${identity.bank.replace(/\n/g, ' ')}`);
  return lines.length ? lines.join('\n') : String(legacyText || '').trim();
};

/**
 * @param {{ includeBank?: boolean, db?: object }} options includeBank=false drops bank data (incl. legacy bank lines and raw legacy text)
 */
const loadSellerIdentity = async ({ includeBank = false, db = prisma } = {}) => {
  const keys = [...Object.values(FIELD_KEYS), LEGACY_INVOICE_TITLE_KEY];
  const rows = await db.systemConfig.findMany({ where: { key: { in: keys } }, select: { key: true, value: true } });
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const legacyText = byKey[LEGACY_INVOICE_TITLE_KEY] === undefined ? '' : asText(LEGACY_INVOICE_TITLE_KEY, byKey[LEGACY_INVOICE_TITLE_KEY]);
  const legacy = parseLegacyInvoiceTitle(legacyText);
  const identity = {};
  const legacyFilled = [];
  for (const [field, key] of Object.entries(FIELD_KEYS)) {
    const canonical = byKey[key] === undefined ? '' : asText(key, byKey[key]);
    if (canonical) identity[field] = canonical;
    else if (legacy[field]) { identity[field] = legacy[field]; legacyFilled.push(field); }
    else identity[field] = '';
  }
  if (!includeBank) {
    identity.bank = '';
    const index = legacyFilled.indexOf('bank');
    if (index >= 0) legacyFilled.splice(index, 1);
  }
  return {
    ...identity,
    legacyFilled,
    // 旧原文可能含银行行：无银行权限时不返回原文，只用统一字段生成抬头
    invoiceTitleText: composeInvoiceTitleText(identity, includeBank ? legacyText : ''),
  };
};

module.exports = { FIELD_KEYS, parseLegacyInvoiceTitle, composeInvoiceTitleText, loadSellerIdentity };
