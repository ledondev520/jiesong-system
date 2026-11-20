/**
 * Input: 已人工核验的 cases（每票：进货发票明细、出口 17 列、关单证据、退税文库记录、进货 17 列预填值）、
 *        申报年月/批次/购方税号、可选 overrides（分摊指定）与 used（历史正式占用台账）、as-of 日期
 * Output: buildDeclarationPlan → plan（entries/pending/excluded/warnings/balances/totals，formal_submission 恒为 false）；
 *         purchaseRowValues/exportRowValues → 官方样表 17 列展示串；renderDeclarationWorkbook → 官方版式 xlsx Buffer；
 *         writeDeclarationFiles → 两份官方版式 xlsx + plan.json + 核对结果.md（受限目录，拒绝覆盖）
 * Pos: 出口退税「进货明细申报表 / 出口明细申报表」离线生成引擎；承接 Codex 技能 export-tax-draft 的 build 流程，
 *      JSON 字段与错误码保持兼容；纯本地计算，不连数据库、不联网、不触达税局，不代表已录入/自检/正式申报
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const path = require('node:path');
const ExcelJS = require('exceljs');

// ---------------------------------------------------------------------------
// 官方样表常量（来源：税局进货/出口明细申报表样表；表头、Sheet 名、版式均按样表逐项固定）
// ---------------------------------------------------------------------------

/** 进货明细申报表 17 列表头（官方样表原文：供货方纳税号、出口商品名称、征税率%、退税率%） */
const PURCHASE_HEADERS = Object.freeze([
  '申报年月', '申报批次', '序号', '关联号', '税种', '供货方纳税号', '进货凭证号', '开票日期',
  '出口商品代码', '出口商品名称', '计量单位', '数量', '计税金额', '征税率%', '退税率%', '可退税额', '备注',
]);
/** 出口明细申报表 17 列表头（官方样表原文） */
const EXPORT_HEADERS = Object.freeze([
  '申报年月', '申报批次', '序号', '关联号', '退税额', '出口发票号', '出口货物报关单号', '代理出口货物证明号',
  '出口日期', '出口商品代码', '出口商品名称', '计量单位', '出口数量', '美元离岸价', '申报商品代码',
  '退（免）税业务类型', '备注',
]);
const PURCHASE_SHEET_NAME = '数据'; // 进货样表工作表名
const EXPORT_SHEET_NAME = 'Sheet1'; // 出口样表工作表名
const BLANK_CELL = ' '; // 官方样表的空值是单个空格，而不是空单元格
const VAT_TAX_TYPE = 'V'; // 官方样表税种列取值

const SONG_FONT = Object.freeze({ name: '宋体', family: 3, charset: 134 });
const THIN = Object.freeze({ style: 'thin' });
const FULL_BORDER = Object.freeze({ top: THIN, left: THIN, bottom: THIN, right: THIN });
const RIGHT_BOTTOM_BORDER = Object.freeze({ right: THIN, bottom: THIN });

/**
 * 两张样表的版式（宋体、文本格式 @、边框、列宽、行高）；数值为样表实测值，不得凭感觉调整。
 * - 进货样表：表头与数据行同一样式（宋体 12、四边细线、列宽 16.62、行高 17.6）
 * - 出口样表：表头居中（宋体，B–F 列 11 号、其余 12 号）、数据行宋体 11 仅右/下细线；表头行高 19.35、数据行 13.5
 */
const TABLE_SPECS = Object.freeze({
  purchase: {
    sheetName: PURCHASE_SHEET_NAME,
    headers: PURCHASE_HEADERS,
    columnWidths: Array(17).fill(16.62),
    header: { height: 17.6, fontSizes: Array(17).fill(12), alignment: null, border: FULL_BORDER },
    body: { height: 17.6, fontSize: 12, alignment: null, border: FULL_BORDER },
  },
  export: {
    sheetName: EXPORT_SHEET_NAME,
    headers: EXPORT_HEADERS,
    columnWidths: [14.62, 12.62, 12.62, 20.75, 20.75, 35.12, 26.12, 20.38, 13.88, 13.75, 26.88, 13.75, 13.12, 13.12, 13.12, 20.38, 13.12],
    header: {
      height: 19.35,
      fontSizes: [12, 11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12],
      alignment: { horizontal: 'center', vertical: 'middle' },
      border: FULL_BORDER,
    },
    body: { height: 13.5, fontSize: 11, alignment: { vertical: 'middle' }, border: RIGHT_BOTTOM_BORDER },
  },
});

const COMMON_OVERRIDE_FIELDS = new Set(['fraction', 'quantity', 'reason']); // overrides 允许的字段
const MAX_DECIMAL_DIGITS = 60; // 单个数字允许的最大有效位数，防止恶意超长输入
const MAX_DECIMAL_EXPONENT = 60; // 科学计数法指数上限

// ---------------------------------------------------------------------------
// 精确十进制（BigInt 定点；等价于 Python Decimal 在本流程用到的子集）
// ---------------------------------------------------------------------------

const pow10 = (exponent) => 10n ** BigInt(exponent);

/**
 * 职责：把数字文本/数值解析为精确十进制 { n, s }（值 = n / 10^s，s ≥ 0）。
 * 思路：与 Python dec() 一致——去掉千分位逗号与百分号后严格匹配数字文法；保留小数位数（5.00 的 s 为 2）；
 *      空值、NaN/Infinity、文法错误、超长位数/指数一律抛错（fail closed），不做静默猜测。
 * @param {unknown} value 数字文本或 number（如 '13%'、'1,234.50000'、47988.35）
 * @returns {{n: bigint, s: number}} 精确十进制
 * @throws {Error} 缺少数字 / 非法数字 / 数字超出支持范围
 */
function parseDecimal(value) {
  // 0. 空值与非有限数
  if (value === null || value === undefined) throw new Error('缺少数字');
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('数字必须有限');
  const text = String(value).replace(/,/g, '').replace(/%/g, '').trim();
  if (text === '') throw new Error('缺少数字');
  // 1. 文法匹配：[符号]整数[.小数][e指数]，至少一位数字
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
  if (!match || ((match[2] || '') === '' && (match[3] || '') === '')) {
    throw new Error(`非法数字：${preview(value)}`);
  }
  const [, sign, integerPart, fractionPart = '', exponentText] = match;
  const exponent = exponentText ? Number.parseInt(exponentText, 10) : 0;
  if (integerPart.length + fractionPart.length > MAX_DECIMAL_DIGITS || Math.abs(exponent) > MAX_DECIMAL_EXPONENT) {
    throw new Error('数字超出支持范围');
  }
  // 2. 组装 n/s；负的小数位数折算回整数
  let n = BigInt(`${integerPart || '0'}${fractionPart}`);
  let s = fractionPart.length - exponent;
  if (s < 0) {
    n *= pow10(-s);
    s = 0;
  }
  return { n: sign === '-' ? -n : n, s };
}

/** 职责：尝试解析十进制，失败返回 null（用于“先收集错误码再决定是否抛错”的位置）。 */
function tryParseDecimal(value) {
  try {
    return parseDecimal(value);
  } catch {
    return null;
  }
}

/** 职责：把两个十进制对齐到同一小数位。@returns {[bigint, bigint, number]} 对齐后的 [a.n, b.n, scale] */
function alignDecimals(a, b) {
  const s = Math.max(a.s, b.s);
  return [a.n * pow10(s - a.s), b.n * pow10(s - b.s), s];
}
const addDecimal = (a, b) => { const [x, y, s] = alignDecimals(a, b); return { n: x + y, s }; };
const subDecimal = (a, b) => { const [x, y, s] = alignDecimals(a, b); return { n: x - y, s }; };
const compareDecimal = (a, b) => { const [x, y] = alignDecimals(a, b); return x < y ? -1 : (x > y ? 1 : 0); };
const sumDecimals = (values, start) => values.reduce(addDecimal, start);

/**
 * 职责：整数除法并按指定模式舍入（den > 0）。
 * 思路：对绝对值做商/余数比较，再恢复符号；HALF_UP 为“远离 0 的四舍五入”，HALF_EVEN 为银行家舍入。
 * @param {bigint} num 被除数
 * @param {bigint} den 除数（必须 > 0）
 * @param {'HALF_UP'|'HALF_EVEN'} mode 舍入模式
 * @returns {bigint} 舍入后的商
 */
function roundDivide(num, den, mode) {
  const negative = num < 0n;
  const abs = negative ? -num : num;
  let quotient = abs / den;
  const twiceRemainder = (abs % den) * 2n;
  if (twiceRemainder > den || (twiceRemainder === den && (mode === 'HALF_UP' || quotient % 2n === 1n))) quotient += 1n;
  return negative ? -quotient : quotient;
}

/**
 * 职责：把十进制舍入到固定小数位。
 * @param {{n: bigint, s: number}} value 十进制
 * @param {number} places 目标小数位
 * @param {'HALF_UP'|'HALF_EVEN'} [mode='HALF_UP'] 舍入模式（金额用 HALF_UP，与 Python money() 一致）
 * @returns {{n: bigint, s: number}} 小数位恰为 places 的十进制
 */
function quantizeDecimal(value, places, mode = 'HALF_UP') {
  if (value.s <= places) return { n: value.n * pow10(places - value.s), s: places };
  return { n: roundDivide(value.n, pow10(value.s - places), mode), s: places };
}

/**
 * 职责：精确计算 (Π factors) / divisor 并舍入到 places 位（先不丢精度，最后一次舍入）。
 * @param {Array<{n: bigint, s: number}>} factors 乘数列表
 * @param {{n: bigint, s: number}} divisor 除数（不得为 0）
 * @param {number} places 目标小数位
 * @param {'HALF_UP'|'HALF_EVEN'} [mode='HALF_UP'] 舍入模式
 * @returns {{n: bigint, s: number}} 舍入后的十进制
 * @throws {Error} 除数为 0
 */
function mulDivQuantize(factors, divisor, places, mode = 'HALF_UP') {
  if (divisor.n === 0n) throw new Error('除数不能为零');
  const numerator = factors.reduce((acc, factor) => acc * factor.n, 1n);
  const numeratorScale = factors.reduce((acc, factor) => acc + factor.s, 0);
  let scaledNumerator = numerator * pow10(divisor.s + places);
  let denominator = divisor.n * pow10(numeratorScale);
  if (denominator < 0n) {
    scaledNumerator = -scaledNumerator;
    denominator = -denominator;
  }
  return { n: roundDivide(scaledNumerator, denominator, mode), s: places };
}

/** 职责：金额 = 先解析再按分四舍五入（HALF_UP），对应 Python money()。 */
const toMoney = (value) => quantizeDecimal(parseDecimal(value), 2, 'HALF_UP');

/** 职责：按十进制自身小数位输出纯文本（等价 Python str(Decimal) 的常规情形，不输出科学计数法）。 */
function decimalToString(value) {
  const negative = value.n < 0n;
  let digits = (negative ? -value.n : value.n).toString();
  if (value.s > 0) {
    digits = digits.padStart(value.s + 1, '0');
    digits = `${digits.slice(0, -value.s)}.${digits.slice(-value.s)}`;
  }
  return negative ? `-${digits}` : digits;
}

/** 职责：舍入到固定小数位并输出文本，对应 Python format(x, '.2f') / '.5f'（默认银行家舍入，与 Python 一致）。 */
const decimalToFixed = (value, places, mode = 'HALF_EVEN') => decimalToString(quantizeDecimal(value, places, mode));

/** 职责：给整数部分加千分位逗号（样表数量/金额的显示格式）。 */
function withThousands(text) {
  const [integerPart, fractionPart] = text.split('.');
  const grouped = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fractionPart === undefined ? grouped : `${grouped}.${fractionPart}`;
}

/** 职责：数量显示串，千分位 + 5 位小数（格式示例：1,234.00000）。 */
const formatQuantityDisplay = (value) => withThousands(decimalToFixed(value, 5));
/** 职责：金额显示串，千分位 + 2 位小数（格式示例：12,345.67）。 */
const formatMoneyDisplay = (value) => withThousands(decimalToFixed(value, 2));
/** 职责：税率显示串，去掉多余的尾随 0（样表：13、9，而不是 13.00）。 */
function formatRateDisplay(value) {
  const text = decimalToString(value);
  return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
}

// ---------------------------------------------------------------------------
// 文本/日期/容错工具
// ---------------------------------------------------------------------------

/** 职责：错误信息里的标识符预览——只保留首尾字符，避免把完整票号/税号写进日志。 */
function preview(value) {
  const text = String(value);
  return text.length <= 8 ? `${text.slice(0, 2)}…(${text.length}位)` : `${text.slice(0, 3)}…${text.slice(-3)}(${text.length}位)`;
}

/** 职责：等价 Python dict.get(key, default)：键存在即返回其值（含 null），否则返回默认值。 */
const getOr = (object, key, fallback) => (object && typeof object === 'object' && Object.hasOwn(object, key) ? object[key] : fallback);

/** 职责：等价 Python 真值判断（None/空串/0/空数组/空字典为假），用于保持与原脚本相同的分支。 */
function isFalsy(value) {
  if (value === null || value === undefined || value === false || value === 0 || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  return typeof value === 'object' && Object.keys(value).length === 0;
}

/**
 * 职责：校验“必须是完整文本”的标识符（申报年月、关联号、票号、关单号），拒绝 Excel 数值化/科学计数法。
 * @param {unknown} value 待校验值，必须是字符串
 * @param {string} pattern 完整匹配的正则片段（如 '\\d{17}'）
 * @param {string} label 错误信息中的字段名
 * @returns {string} 去掉首尾空白后的文本
 * @throws {Error} 非字符串或不匹配
 */
function identifier(value, pattern, label) {
  if (typeof value !== 'string' || !new RegExp(`^(?:${pattern})$`).test(value.trim())) {
    throw new Error(`${label}必须是完整文本，不能使用Excel数值或科学计数法：${value === undefined || value === null ? '缺失' : preview(value)}`);
  }
  return value.trim();
}

/**
 * 职责：把日期规范成 YYYY-MM-DD（接受 YYYYMMDD、带时间的前 10 位），并校验真实存在的日历日。
 * @param {unknown} value 日期文本
 * @param {string} [label='日期'] 错误信息中的字段名
 * @returns {string} YYYY-MM-DD
 * @throws {Error} 不是有效日期
 */
function isoDate(value, label = '日期') {
  let text = String(value ?? '').trim().slice(0, 10);
  if (/^\d{8}$/.test(text)) text = `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6)}`;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (match) {
    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (year >= 100 && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) return text;
  }
  throw new Error(`${label}不是有效日期：${preview(value ?? '')}`);
}

/** 职责：官方样表的空值规则——空/纯空白显示为单个空格，其余原样（保持文本，不 trim 有效内容）。 */
const displayText = (value) => {
  const text = value === undefined || value === null ? '' : String(value);
  return text.trim() === '' ? BLANK_CELL : text;
};

/** 职责：取必填字段，缺失或空白直接抛错并带上字段名（不写出半成品）。 */
function requiredField(object, key, label = key) {
  const value = getOr(object, key, undefined);
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`缺少${label}`);
  return value;
}

// ---------------------------------------------------------------------------
// 计划生成：逐票校验、归并、余额与汇总（对应原脚本 build）
// ---------------------------------------------------------------------------

/**
 * 职责：校验并规范化 build 的全局参数。
 * @param {object} options { period, batch, buyerTaxId, overrides, used, asOf }
 * @returns {{period: string, batch: string, buyer: string, overrides: object, used: Array, asOf: string}} 规范化结果
 * @throws {Error} 申报年月/批次/购方税号/as-of/overrides/used 非法
 */
function normalizeBuildOptions(options) {
  const period = identifier(options.period, '\\d{6}', '申报年月');
  const month = Number(period.slice(4));
  if (month < 1 || month > 12 || Number(period.slice(0, 4)) < 1) throw new Error(`申报年月不是有效年月：${period}`);
  const batch = identifier(options.batch, '\\d{3}', '批次');
  const buyer = String(options.buyerTaxId ?? '').trim();
  if (!buyer) throw new Error('必须指定本次购方税号');
  const asOf = isoDate(options.asOf, 'as-of 日期');
  const overrides = options.overrides ?? {};
  if (typeof overrides !== 'object' || Array.isArray(overrides) || overrides === null) throw new Error('overrides 必须是以关联号为键的对象');
  const used = options.used ?? [];
  if (!Array.isArray(used)) throw new Error('used 台账必须是数组');
  return { period, batch, buyer, overrides, used, asOf };
}

/**
 * 职责：校验一票 case 并产出“待核 / 可录入草稿”判定（单票逻辑，对应原脚本 build 循环体）。
 * 思路：
 *   1. 校验出口范围、关联号结构、完整进货凭证号、指定参数；
 *   2. 校验原票（票种/购方/状态）、17 列预填、文库代码/有效期/单位、征税分支、关单键、数量与分摊；
 *   3. 有错误码 → pending（只带错误码，不入草稿）；无错误 → 组装 entry（金额按分四舍五入，税额 = 金额 × 退税率）。
 * 数据缺陷（缺字段/非法数字/超额）直接抛错并带关联号上下文；业务不合格走错误码，由人工处理。
 * @param {object} c 单票 case
 * @param {number} index 在 cases 中的序号（用于关联号未知时定位）
 * @param {object} ctx 全局上下文 { period, batch, buyer, overrides, used, seen }
 * @returns {{excluded?: object, pending?: object, entry?: object, invoiceInfo?: object}} 判定结果
 * @throws {Error} 数据结构缺陷或重复关联号等不可继续的问题
 */
function evaluateCase(c, index, ctx) {
  const { period, batch, buyer, overrides, used, seen } = ctx;
  let where = `第 ${index + 1} 条记录`; // 错误信息定位；关联号确定后改用关联号
  try {
    // 1. 出口范围
    const ex = getOr(c, 'export', undefined);
    if (isFalsy(ex)) {
      return { excluded: { source_sequence: getOr(c, 'sequence', null), invoice: getOr(c, 'invoice', null), reason: getOr(c, 'state', '未列入出口范围') } };
    }
    // 1.1. 关联号：17 位完整文本，唯一，且前 9 位 = 申报年月 + 批次
    const association = identifier(getOr(ex, '关联号', undefined), '\\d{17}', '关联号');
    where = `关联号 ${association}`;
    if (seen.has(association)) throw new Error(`重复关联号：${association}`);
    seen.add(association);
    if (association.slice(0, 9) !== period + batch || getOr(ex, '申报年月', undefined) !== period || getOr(ex, '申报批次', undefined) !== batch) {
      throw new Error(`申报期、批次与关联号不一致：${association}；请先明确变更范围`);
    }
    // 1.2. 完整进货凭证号（18 或 20 位文本）
    const inv = identifier(getOr(c, 'invoice', undefined), '(?:\\d{20}|\\d{18})', '完整进货凭证号');
    // 1.3. 指定参数：只允许 fraction/quantity/reason，且必须写明原因
    const ov = Object.hasOwn(overrides, association) ? overrides[association] : {};
    if (ov === null || typeof ov !== 'object' || Array.isArray(ov)) throw new Error(`指定参数必须是对象：${association}`);
    if (Object.keys(ov).some((key) => !COMMON_OVERRIDE_FIELDS.has(key))) throw new Error(`不支持的覆盖字段：${association}`);
    const hasOverride = Object.keys(ov).length > 0;
    if (hasOverride && String(getOr(ov, 'reason', '')).trim() === '') {
      throw new Error('指定参数必须附带原因；文件本身不代表新的线上操作授权');
    }

    const errors = []; // 本票业务错误码
    const warnings = [...(getOr(c, 'issues', []) || [])]; // 本票保留的疑点/提示
    // 2. 原票明细：恰好 1 行才自动处理
    const details = getOr(getOr(c, 'invoice_values', {}), 'live_details', []) || [];
    if (details.length !== 1) {
      return { pending: { association, invoice: inv, errors: ['INVOICE_DETAIL'], warnings } };
    }
    const d = details[0];
    // 2.1. 票号、票种、购方、状态
    if (String(getOr(d, '数电发票号码', '') || getOr(d, '发票号码', '') || '') !== inv) errors.push('INVOICE_NUMBER_MISMATCH');
    if (!String(getOr(d, '发票票种', '')).includes('专用发票')) errors.push('INVOICE_TYPE');
    if (getOr(d, '购方识别号', undefined) !== buyer) errors.push('BUYER_MISMATCH');
    if (getOr(d, '发票状态', undefined) !== '正常' || getOr(d, '是否正数发票', undefined) !== '是') errors.push('INVOICE_STATUS');
    // 2.2. 进货 17 列预填值（已归并）
    let source = getOr(c, 'form_values', []);
    if (!Array.isArray(source) || source.length !== 17) {
      errors.push('FORM_FIELDS');
      source = Array(17).fill(null);
    }
    if (isFalsy(getOr(c, 'is_candidate', false)) && !hasOverride) errors.push('EXPLICIT_PENDING');
    // 2.3. 退税文库：代码、有效期、单位
    const rate = getOr(c, 'rate', {}) || {};
    const code = String(getOr(ex, '出口商品代码', '')).trim();
    if (getOr(rate, 'CODE', undefined) !== code) errors.push('RATE_CODE');
    const exportDate = isoDate(requiredField(ex, '出口日期'), '出口日期');
    const rateStart = getOr(rate, 'ST_DATE', undefined);
    const rateEnd = getOr(rate, 'END_DATE', undefined);
    if (isFalsy(rateStart) || isFalsy(rateEnd) || !(isoDate(rateStart, '文库起始日') <= exportDate && exportDate <= isoDate(rateEnd, '文库截止日'))) {
      errors.push('RATE_DATE');
    }
    if (getOr(rate, 'UNIT', undefined) !== getOr(ex, '计量单位', undefined)) errors.push('RATE_UNIT');
    if (source[8] !== code || source[10] !== getOr(ex, '计量单位', undefined)) errors.push('FORM_COMMODITY');
    if (typeof source[9] !== 'string' || source[9].trim() === '') errors.push('PURCHASE_NAME');
    // 2.4. 税率：征税率与文库退税率孰低；征税分支必须落在文库允许范围内
    const levy = parseDecimal(requiredField(d, '税率'));
    const libraryRate = parseDecimal(getOr(rate, 'TSL', 0));
    const refundRate = compareDecimal(levy, libraryRate) <= 0 ? levy : libraryRate;
    if (compareDecimal(refundRate, { n: 0n, s: 0 }) <= 0) errors.push('ZERO_REFUND_RATE');
    const allowedLevies = (String(getOr(rate, 'ZSSL_SET', '') ?? '').match(/\d+(?:\.\d+)?/g) || []).map(parseDecimal);
    if (allowedLevies.length === 0 || compareDecimal(levy, allowedLevies.reduce((max, v) => (compareDecimal(v, max) > 0 ? v : max))) > 0) {
      errors.push('RATE_LEVY_BRANCH');
    }
    // 2.5. 关单键：18 位关单号 + 3 位项号 = 21 位；日期与单位一致
    const declaration = identifier(getOr(ex, '出口货物报关单号', undefined), '\\d{21}', '关单号加项号');
    const customs = getOr(c, 'customs', {}) || {};
    if (isFalsy(customs)) {
      errors.push('CUSTOMS_EVIDENCE');
    } else if (String(getOr(customs, '出口报关单号', '') ?? '') + String(getOr(customs, '项号', '') ?? '').padStart(3, '0') !== declaration
      || isoDate(requiredField(customs, '出口日期', '关单出口日期'), '关单出口日期') !== exportDate) {
      errors.push('CUSTOMS_KEY');
    }
    if (!isFalsy(getOr(customs, '法定单位', undefined)) && customs['法定单位'] !== getOr(ex, '计量单位', undefined)) errors.push('CUSTOMS_UNIT');
    // 2.6. 金额与分摊：整票或按 fraction 比例；比例必须以原票数量为分母
    const fullNet = toMoney(requiredField(d, '金额'));
    const fullQty = parseDecimal(requiredField(d, '数量'));
    const fraction = getOr(ov, 'fraction', undefined);
    let allocatedQty = null; // 本次占用的原票单位数量；未知为 null（余数量未核实）
    let net = null; // 本次计税金额（分）
    if (!isFalsy(fraction)) {
      const numerator = parseDecimal(getOr(fraction, 'numerator', undefined));
      const denominator = parseDecimal(getOr(fraction, 'denominator', undefined));
      if (denominator.n <= 0n || !(numerator.n > 0n && compareDecimal(numerator, denominator) <= 0) || compareDecimal(denominator, fullQty) !== 0) {
        throw new Error(`分配分母应为原票数量，且0<分子<=分母：${association}`);
      }
      net = mulDivQuantize([fullNet, numerator], denominator, 2, 'HALF_UP');
      allocatedQty = numerator;
    } else if (source[12] !== null && source[12] !== undefined && String(source[12]).trim() !== '') {
      net = toMoney(source[12]);
      if (compareDecimal(net, fullNet) === 0) allocatedQty = fullQty;
    }
    const quantityRaw = Object.hasOwn(ov, 'quantity') ? ov.quantity : source[11];
    const exportFob = tryParseDecimal(getOr(ex, '美元离岸价', undefined)); // 美元离岸价；非法值在组装 entry 时抛错
    let quantity = null; // 本次申报数量（法定单位）
    if (quantityRaw === null || quantityRaw === undefined || String(quantityRaw).trim() === '' || net === null) {
      errors.push('MISSING_ALLOCATION');
    } else {
      quantity = parseDecimal(quantityRaw);
      if (quantity.n <= 0n || net.n <= 0n) errors.push('NON_POSITIVE_ALLOCATION');
      if (compareDecimal(quantity, parseDecimal(requiredField(ex, '出口数量'))) !== 0) errors.push('EXPORT_PURCHASE_QUANTITY');
      if (!isFalsy(getOr(customs, '法定出口数量', undefined)) && compareDecimal(quantity, parseDecimal(customs['法定出口数量'])) !== 0) errors.push('CUSTOMS_QUANTITY');
      // 2.6.1. 申报表只能显示 5 位数量/2 位离岸价；超出精度会被静默舍入，因此转待核
      if (compareDecimal(quantizeDecimal(quantity, 5), quantity) !== 0) errors.push('PRECISION');
    }
    if (exportFob && compareDecimal(quantizeDecimal(exportFob, 2), exportFob) !== 0) errors.push('PRECISION');
    // 2.7. 历史正式占用：同关联号已申报则拒绝重复
    if (used.some((u) => getOr(u, 'status', undefined) === 'submitted' && getOr(u, 'association', undefined) === association)) errors.push('ALREADY_SUBMITTED');
    if (hasOverride) warnings.push(`用户指定草稿参数：${ov.reason}`);
    // 3. 有业务错误码 → 待核，不入草稿
    if (errors.length > 0) {
      return { pending: { association, invoice: inv, errors: [...new Set(errors)].sort(), warnings } };
    }
    // 4. 组装可录入草稿
    if (!exportFob) throw new Error('美元离岸价不是有效数字');
    const exportInvoice = String(getOr(ex, '出口发票号', '') ?? '').trim();
    if (exportInvoice && !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(exportInvoice)) {
      warnings.push(`出口发票号含空格或冒号等非常规字符，请对照官方样表核对：${exportInvoice}`);
    }
    const exportSequenceText = String(requiredField(ex, '序号')).trim();
    if (!/^\d{1,8}$/.test(exportSequenceText)) throw new Error(`出口序号必须是不超过8位的整数文本：${exportSequenceText}`);
    const refund = mulDivQuantize([net, refundRate], { n: 100n, s: 0 }, 2, 'HALF_UP');
    const entry = {
      association,
      export_sequence: Number.parseInt(exportSequenceText, 10),
      source_sequence: getOr(c, 'sequence', null),
      invoice: inv,
      date: isoDate(requiredField(d, '开票日期'), '开票日期'),
      seller_tax: String(requiredField(d, '销方识别号')),
      code,
      name: source[9].trim(),
      unit: String(requiredField(ex, '计量单位')),
      quantity: decimalToFixed(quantity, 5),
      net: decimalToFixed(net, 2),
      levy_rate: decimalToString(levy),
      refund_rate: decimalToFixed(refundRate, 2),
      refund: decimalToFixed(refund, 2),
      period,
      batch,
      export: { ...ex },
      invoice_quantity_used: allocatedQty === null ? null : decimalToString(allocatedQty),
      status: hasOverride ? 'draft_only' : 'ready',
      warnings,
      note: hasOverride ? ov.reason : String(getOr(c, 'notes', '') ?? '').trim(),
      source_reference: { sequence: getOr(c, 'sequence', null), declaration },
    };
    entry.export['退税额'] = entry.refund; // 出口表退税额 = 该关联号可退税额
    return { entry, invoiceInfo: { inv, fullNet, fullQty, unit: requiredField(d, '单位'), net } };
  } catch (error) {
    // 5. 数据缺陷统一带上定位信息再抛出
    error.message = `${where}：${error.message}`;
    throw error;
  }
}

/**
 * 职责：把已核验的 cases 归并为进货/出口两表的“可录入计划”。
 * 思路：
 *   0. 规范化参数；
 *   1. 逐票 evaluateCase（excluded / pending / entry），entries 按出口序号排序；
 *   2. 校验 overrides 指向的关联号都存在；
 *   3. 按原票汇总本次占用 + 历史正式占用，超额直接抛错，生成 balances（剩余金额/数量）；
 *   4. 汇总 totals（计税金额、退税额、美元离岸价）。
 * @param {Array<object>} cases 审核后的归并结果数组
 * @param {object} options { period, batch, buyerTaxId, overrides?, used?, asOf }
 * @returns {object} plan：entries/pending/excluded/warnings/balances/totals，formal_submission 恒为 false
 * @throws {Error} 参数非法、重复关联号、同票累计超额、数据缺陷
 */
function buildDeclarationPlan(cases, options) {
  // 0. 参数
  if (!Array.isArray(cases)) throw new Error('cases 必须是数组');
  const { period, batch, buyer, overrides, used, asOf } = normalizeBuildOptions(options || {});
  const plan = {
    schema_version: 1, period, batch, buyer_tax_id: buyer, as_of: asOf,
    entries: [], pending: [], excluded: [], warnings: [], balances: [], formal_submission: false,
  };
  if (period > `${asOf.slice(0, 4)}${asOf.slice(5, 7)}`) plan.warnings.push('FUTURE_PERIOD'); // 未来月份保持用户选择，只提示
  const seen = new Set(); // 已出现的关联号
  const plannedNet = new Map(); // 原票号 → 本次累计计税金额（保持首次出现顺序）
  const invoiceData = new Map(); // 原票号 → { fullNet, fullQty, unit }
  const ctx = { period, batch, buyer, overrides, used, seen };

  // 1. 逐票判定
  cases.forEach((c, index) => {
    const outcome = evaluateCase(c, index, ctx);
    if (outcome.excluded) plan.excluded.push(outcome.excluded);
    else if (outcome.pending) plan.pending.push(outcome.pending);
    else {
      const { inv, fullNet, fullQty, unit, net } = outcome.invoiceInfo;
      invoiceData.set(inv, { fullNet, fullQty, unit });
      plannedNet.set(inv, addDecimal(plannedNet.get(inv) || { n: 0n, s: 0 }, net));
      plan.entries.push(outcome.entry);
    }
  });
  // 2. 指定参数必须都命中本次出现过的关联号
  const unknown = Object.keys(overrides).filter((key) => !seen.has(key)).sort();
  if (unknown.length > 0) throw new Error(`指定参数对应的关联号不存在：${JSON.stringify(unknown)}`);
  plan.entries.sort((left, right) => left.export_sequence - right.export_sequence);

  // 3. 同票累计占用与余额
  for (const [inv, total] of plannedNet) {
    const { fullNet, fullQty, unit } = invoiceData.get(inv);
    const submitted = used.filter((u) => getOr(u, 'invoice', undefined) === inv && getOr(u, 'status', undefined) === 'submitted');
    const usedNet = sumDecimals(submitted.map((u) => parseDecimal(requiredField(u, 'net', '历史占用金额'))), { n: 0n, s: 0 });
    if (compareDecimal(addDecimal(total, usedNet), fullNet) > 0 || usedNet.n < 0n) {
      throw new Error(`同票累计计税金额超额：${preview(inv)}`);
    }
    const allocated = plan.entries.filter((e) => e.invoice === inv).map((e) => e.invoice_quantity_used);
    const oldQuantities = submitted.map((u) => getOr(u, 'invoice_quantity_used', null));
    let remainingQty = null; // 原票剩余单位数量；历史台账不全时未核实
    if ([...allocated, ...oldQuantities].every((x) => x !== null && x !== undefined)) {
      remainingQty = subDecimal(fullQty, sumDecimals([...allocated, ...oldQuantities].map(parseDecimal), { n: 0n, s: 0 }));
      if (remainingQty.n < 0n) throw new Error(`同票累计数量超额：${preview(inv)}`);
    }
    plan.balances.push({
      invoice: inv,
      invoice_unit: unit,
      original_net: decimalToString(fullNet),
      previously_submitted_net: decimalToString(usedNet),
      planned_draft_net: decimalToString(total),
      remaining_net: decimalToString(subDecimal(subDecimal(fullNet, usedNet), total)),
      remaining_invoice_quantity: remainingQty === null ? null : decimalToString(remainingQty),
      note: '本次为草稿分配，不代表已正式申报占用；历史台账不全时余额未核实',
    });
  }

  // 4. 汇总
  const zeroMoney = { n: 0n, s: 2 };
  plan.totals = {
    count: plan.entries.length,
    net: decimalToString(sumDecimals(plan.entries.map((e) => parseDecimal(e.net)), zeroMoney)),
    refund: decimalToString(sumDecimals(plan.entries.map((e) => parseDecimal(e.refund)), zeroMoney)),
    export_usd: decimalToString(sumDecimals(plan.entries.map((e) => parseDecimal(e.export['美元离岸价'])), zeroMoney)),
  };
  return plan;
}

// ---------------------------------------------------------------------------
// 官方样表行值与 xlsx 渲染
// ---------------------------------------------------------------------------

/**
 * 职责：生成进货明细申报表一行的 17 列展示串（与官方样表逐列一致）。
 * 思路：数量千分位 5 位小数、金额千分位 2 位小数、税率去尾零、空备注为单个空格；所有值均为文本。
 * @param {object} entry plan.entries 中的一条
 * @param {number} sequence 进货表序号（从 1 起；与出口序号、关联号是不同字段）
 * @returns {string[]} 17 个展示串
 */
function purchaseRowValues(entry, sequence) {
  return [
    entry.period, entry.batch, String(sequence).padStart(8, '0'), entry.association, VAT_TAX_TYPE,
    entry.seller_tax, entry.invoice, entry.date, entry.code, entry.name, entry.unit,
    formatQuantityDisplay(parseDecimal(entry.quantity)),
    formatMoneyDisplay(parseDecimal(entry.net)),
    formatRateDisplay(parseDecimal(entry.levy_rate)),
    formatRateDisplay(parseDecimal(entry.refund_rate)),
    formatMoneyDisplay(parseDecimal(entry.refund)),
    entry.note,
  ].map(displayText);
}

/**
 * 职责：生成出口明细申报表一行的 17 列展示串（与官方样表逐列一致）。
 * 思路：出口原始 17 列取自 entry.export，数量/金额按样表格式化，退税额取本关联号可退税额，空值为单个空格。
 * @param {object} entry plan.entries 中的一条
 * @returns {string[]} 17 个展示串
 */
function exportRowValues(entry) {
  const ex = entry.export;
  return [
    entry.period, entry.batch, String(entry.export_sequence).padStart(8, '0'), entry.association,
    formatMoneyDisplay(parseDecimal(entry.refund)),
    getOr(ex, '出口发票号', ''),
    getOr(ex, '出口货物报关单号', ''),
    getOr(ex, '代理出口货物证明号', ''),
    isoDate(getOr(ex, '出口日期', ''), '出口日期'),
    entry.code,
    getOr(ex, '出口商品名称', ''),
    entry.unit,
    formatQuantityDisplay(parseDecimal(getOr(ex, '出口数量', undefined))),
    formatMoneyDisplay(parseDecimal(getOr(ex, '美元离岸价', undefined))),
    getOr(ex, '申报商品代码', ''),
    getOr(ex, '退（免）税业务类型', ''),
    getOr(ex, '备注', ''),
  ].map(displayText);
}

/**
 * 职责：按官方样表版式渲染一张申报表 xlsx（所有单元格为文本，公式样字符串不会被执行）。
 * 思路：Sheet 名/表头/列宽/行高/字体/边框/对齐均取自 TABLE_SPECS；每个单元格写字符串并设 numFmt '@'，
 *      票号等长数字不会被 Excel 数值化；工作簿时间取 plan.as_of，保证相同输入内容一致。
 * @param {'purchase'|'export'} kind 进货表或出口表
 * @param {object} plan buildDeclarationPlan 的结果
 * @returns {Promise<Buffer>} xlsx 文件内容
 * @throws {Error} 未知表类型
 */
async function renderDeclarationWorkbook(kind, plan) {
  const spec = TABLE_SPECS[kind];
  if (!spec) throw new Error(`未知申报表类型：${kind}`);
  // 0. 行数据
  const rows = kind === 'purchase'
    ? plan.entries.map((entry, index) => purchaseRowValues(entry, index + 1))
    : plan.entries.map((entry) => exportRowValues(entry));
  // 1. 工作簿与工作表
  const workbook = new ExcelJS.Workbook();
  const stamp = new Date(`${plan.as_of}T00:00:00Z`);
  workbook.created = stamp;
  workbook.modified = stamp;
  const sheet = workbook.addWorksheet(spec.sheetName);
  sheet.columns = spec.columnWidths.map((width) => ({ width }));
  // 2. 表头
  const headerRow = sheet.getRow(1);
  headerRow.height = spec.header.height;
  spec.headers.forEach((title, column) => {
    const cell = headerRow.getCell(column + 1);
    cell.value = title;
    cell.numFmt = '@';
    cell.font = { ...SONG_FONT, size: spec.header.fontSizes[column] };
    cell.border = { ...spec.header.border };
    if (spec.header.alignment) cell.alignment = { ...spec.header.alignment };
  });
  // 3. 数据行
  rows.forEach((values, rowIndex) => {
    const row = sheet.getRow(rowIndex + 2);
    row.height = spec.body.height;
    values.forEach((text, column) => {
      const cell = row.getCell(column + 1);
      cell.value = text;
      cell.numFmt = '@';
      cell.font = { ...SONG_FONT, size: spec.body.fontSize };
      cell.border = { ...spec.body.border };
      if (spec.body.alignment) cell.alignment = { ...spec.body.alignment };
    });
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/**
 * 职责：生成《核对结果.md》——条数、金额、待核项、指定参数提示与原票余额，供人工核对。
 * @param {object} plan buildDeclarationPlan 的结果
 * @returns {string} Markdown 文本（含金额与票号，仅写入受限目录，不输出到控制台）
 */
function renderCheckReport(plan) {
  const lines = [
    `# 退税草稿 ${plan.period}/${plan.batch}`,
    '',
    `可编入草稿：${plan.totals.count}条；待核：${plan.pending.length}条；未列入出口：${plan.excluded.length}条。`,
    `计税金额：${plan.totals.net}；退税测算：${plan.totals.refund}；美元离岸价：${plan.totals.export_usd}。`,
    '本地生成不代表已录入、已保存、自检通过或正式申报。',
    '',
    '## 待核与指定参数',
  ];
  for (const item of plan.pending) lines.push(`- ${item.association}：${item.errors.join(', ')}`);
  for (const entry of plan.entries) for (const warning of entry.warnings) lines.push(`- ${entry.association}：${warning}`);
  for (const warning of plan.warnings) lines.push(`- ${warning}`);
  const partial = plan.balances.filter((b) => compareDecimal(parseDecimal(b.remaining_net), { n: 0n, s: 0 }) > 0);
  if (partial.length > 0) {
    lines.push('', '## 原票余额（分批用票）');
    for (const b of partial) {
      const quantity = b.remaining_invoice_quantity === null ? '未核实' : `${b.remaining_invoice_quantity}${b.invoice_unit}`;
      lines.push(`- ${b.invoice}：原票计税金额 ${b.original_net}，历史占用 ${b.previously_submitted_net}，本次草稿 ${b.planned_draft_net}，剩余 ${b.remaining_net}，剩余数量 ${quantity}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/**
 * 职责：把计划落成文件——两份官方版式 xlsx、plan.json、核对结果.md。
 * 思路：先在内存里渲染全部内容（失败不留半成品目录）；再 mkdir 0700（已存在则拒绝覆盖）；
 *      文件用 wx 标志创建并设 0600；写入中途失败则清理本次创建的目录。
 * @param {object} plan buildDeclarationPlan 的结果
 * @param {string} targetDir 全新的输出目录（受限：0700，文件 0600）
 * @returns {Promise<{outputDir: string, files: string[]}>} 输出目录与文件名清单
 * @throws {Error} 输出目录已存在或写入失败
 */
async function writeDeclarationFiles(plan, targetDir) {
  // 0. 内存渲染
  const tag = `${plan.period}-${plan.batch}`;
  const contents = [
    [`外贸企业出口退税进货明细申报表_${tag}.xlsx`, await renderDeclarationWorkbook('purchase', plan)],
    [`外贸企业出口退税出口明细申报表_${tag}.xlsx`, await renderDeclarationWorkbook('export', plan)],
    ['plan.json', `${JSON.stringify(plan, null, 2)}\n`],
    ['核对结果.md', renderCheckReport(plan)],
  ];
  // 1. 创建受限目录；已存在即拒绝覆盖
  const target = path.resolve(targetDir);
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  try {
    fs.mkdirSync(target, { mode: 0o700 });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('输出目录已存在，拒绝覆盖；请换一个新目录');
    throw error;
  }
  // 2. 写文件（0600），失败则清理本次创建的目录
  try {
    fs.chmodSync(target, 0o700);
    for (const [name, data] of contents) {
      const file = path.join(target, name);
      fs.writeFileSync(file, data, { flag: 'wx', mode: 0o600 });
      fs.chmodSync(file, 0o600);
    }
  } catch (error) {
    fs.rmSync(target, { recursive: true, force: true });
    throw error;
  }
  return { outputDir: target, files: contents.map(([name]) => name) };
}

module.exports = {
  PURCHASE_HEADERS,
  EXPORT_HEADERS,
  PURCHASE_SHEET_NAME,
  EXPORT_SHEET_NAME,
  buildDeclarationPlan,
  purchaseRowValues,
  exportRowValues,
  renderDeclarationWorkbook,
  renderCheckReport,
  writeDeclarationFiles,
  // 仅供测试直接验证十进制边界
  decimal: {
    parse: parseDecimal,
    quantize: quantizeDecimal,
    toPlain: decimalToString,
    toFixed: decimalToFixed,
    mulDivQuantize,
    compare: compareDecimal,
  },
};
