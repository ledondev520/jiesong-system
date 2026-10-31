/**
 * Input: PUT /system/configs/:key 的值，key 为 companyName / companyAddress / companyPhone / companyTaxId / companyBankInfo
 * Output: 规范化后的文本（空串 = 清空，打印端不印该行）；非法输入抛 400
 * Pos: 卖方公司信息（设置 > 公司信息）的写入校验；报价/PI 卖方块读同样三个 SystemConfig 键（quoteExportService），不另建键
 * Note: 不含任何默认的真实公司/银行数据——未配置的键为空。companyBankInfo 为 Restricted（仅 ADMIN/FINANCE 可经 GET /configs 读取，审计日志不记录其值）。
 */
const { createError } = require('../middleware/errorHandler');

const COMPANY_NAME_KEY = 'companyName';
const COMPANY_ADDRESS_KEY = 'companyAddress';
const COMPANY_BANK_KEY = 'companyBankInfo';
const COMPANY_PHONE_KEY = 'companyPhone';
const COMPANY_TAX_ID_KEY = 'companyTaxId';
// 旧的「我方开票抬头信息」多行文本：只读别名（并入公司信息，J35），不再允许写入
const LEGACY_INVOICE_TITLE_KEY = 'invoiceTitleInfo';

const RULES = {
  [COMPANY_NAME_KEY]: { label: '公司名称', max: 200, multiline: false },
  [COMPANY_ADDRESS_KEY]: { label: '公司地址', max: 500, multiline: true },
  [COMPANY_BANK_KEY]: { label: '银行资料', max: 1000, multiline: true },
  [COMPANY_PHONE_KEY]: { label: '公司电话', max: 50, multiline: false },
  [COMPANY_TAX_ID_KEY]: { label: '纳税人识别号', max: 50, multiline: false, pattern: /^[A-Za-z0-9 -]*$/, patternMessage: '只能包含字母、数字、空格和连字符' },
};
// 控制字符一律拒绝；多行字段只允许换行（\r\n 归一为 \n），不允许制表符等
const CONTROL = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const MAX_LINES = 12;

const isCompanyConfigKey = (key) => Object.hasOwn(RULES, key);
const isLegacyInvoiceTitleKey = (key) => key === LEGACY_INVOICE_TITLE_KEY;

/** 返回规范化文本；key 不是公司信息键时原样返回（调用方先判断 isCompanyConfigKey） */
const validateCompanyConfigValue = (key, value) => {
  const rule = RULES[key];
  if (!rule) return value;
  if (typeof value !== 'string') throw createError(`${rule.label}必须是文本`, 400);
  const normalized = value.replace(/\r\n?/g, '\n');
  if (CONTROL.test(normalized)) throw createError(`${rule.label}含有不允许的控制字符`, 400);
  if (!rule.multiline && normalized.includes('\n')) throw createError(`${rule.label}只能是一行`, 400);
  const lines = normalized.split('\n').map((line) => line.replace(/ +/g, ' ').trim());
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  while (lines.length && lines[0] === '') lines.shift();
  const text = lines.join('\n');
  if (rule.pattern && !rule.pattern.test(text)) throw createError(`${rule.label}${rule.patternMessage}`, 400);
  if (text.length > rule.max) throw createError(`${rule.label}不能超过 ${rule.max} 个字符`, 400);
  if (lines.length > MAX_LINES) throw createError(`${rule.label}最多 ${MAX_LINES} 行`, 400);
  return text;
};

module.exports = {
  COMPANY_NAME_KEY, COMPANY_ADDRESS_KEY, COMPANY_BANK_KEY, COMPANY_PHONE_KEY, COMPANY_TAX_ID_KEY, LEGACY_INVOICE_TITLE_KEY,
  isCompanyConfigKey, isLegacyInvoiceTitleKey, validateCompanyConfigValue,
};
