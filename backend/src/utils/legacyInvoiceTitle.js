/**
 * Input: the legacy 「我方开票抬头信息」text and the canonical company key names
 * Output: FIELD_KEYS (identity field → SystemConfig key) and parseLegacyInvoiceTitle (labelled lines → identity fields)
 * Pos: dependency-light helper (no config/.env) shared by sellerIdentityService and the one-off migration script (J35)
 */
const {
  COMPANY_NAME_KEY, COMPANY_ADDRESS_KEY, COMPANY_BANK_KEY, COMPANY_PHONE_KEY, COMPANY_TAX_ID_KEY,
} = require('./companyConfig');

const FIELD_KEYS = {
  name: COMPANY_NAME_KEY, address: COMPANY_ADDRESS_KEY, phone: COMPANY_PHONE_KEY, taxId: COMPANY_TAX_ID_KEY, bank: COMPANY_BANK_KEY,
};

// 旧文本每行形如「标签：内容」；只认下列标签，其余行忽略（原文仍保留在别名里）。
const LEGACY_LABELS = [
  ['name', /^(?:公司)?名称$/],
  ['taxId', /^(?:纳税人识别号|税号)$/],
  ['address', /^(?:地址电话|地址)$/],
  ['phone', /^(?:电话|联系电话)$/],
  ['bank', /^(?:开户行及账号|开户行|银行账号|银行)$/],
];

/** 解析旧「我方开票抬头信息」文本；识别不了的行不猜测。 */
const parseLegacyInvoiceTitle = (text) => {
  const parsed = {};
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^：:]{1,12})\s*[：:]\s*(.+?)\s*$/);
    if (!match) continue;
    const entry = LEGACY_LABELS.find(([, pattern]) => pattern.test(match[1].trim()));
    if (entry && !parsed[entry[0]]) parsed[entry[0]] = match[2];
  }
  return parsed;
};


module.exports = { FIELD_KEYS, parseLegacyInvoiceTitle };
