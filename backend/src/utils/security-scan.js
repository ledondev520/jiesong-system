/**
 * Input: 任意请求/响应数据
 * Output: 脱敏后的JSON序列化安全副本
 * Pos: 出站日志与监控数据脱敏
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const DEFAULT_REDACTED_TEXT = '[REDACTED]';

const SENSITIVE_KEYS = new Set([
  'authorization',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'api_key',
  'apikey',
  'secret',
  'secret_key',
  'private_key',
  'password',
  'passwd',
  'pwd',
  'phone',
  'mobile',
  'id_card',
  'idnumber',
  'passport',
  'bank_account',
  'bankno',
  'card',
  'cvv',
  'cookie',
  'set-cookie',
  'session',
  'session_id',
  'bearer',
  'x-api-key',
  'x-kimi-api-key',
]);

const PATTERNS = [
  {
    name: 'jwt',
    regex: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,
  },
  {
    name: 'email',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  },
  {
    name: 'phone',
    regex: /\b(?:\+?\d{1,3}[-\s]?)?(?:\(?\d{2,4}\)?[-\s]?)?\d{3,4}[-\s]?\d{3,4}\b/g,
  },
  {
    name: 'credit_card',
    regex: /\b(?:\d[ -]*?){13,19}\b/g,
  },
  {
    name: 'api_key',
    regex: /\b[A-Za-z0-9]{16,}\b/g,
  },
];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isBuffer = (value) => typeof Buffer !== 'undefined' && Buffer.isBuffer(value);

const normalizeKey = (key) => String(key).trim().toLowerCase();

const shouldRedactKey = (key) => {
  const normalized = normalizeKey(key);
  if (SENSITIVE_KEYS.has(normalized)) {
    return true;
  }

  return ['token', 'secret', 'pass', 'key', 'auth', 'credential'].some((fragment) =>
    normalized.includes(fragment),
  );
};

const sanitizeString = (value, options, key) => {
  const text = String(value);
  if (key && shouldRedactKey(key)) {
    return DEFAULT_REDACTED_TEXT;
  }

  let sanitized = text;

  if (options.maskPatterns) {
    PATTERNS.forEach((rule) => {
      sanitized = sanitized.replace(rule.regex, DEFAULT_REDACTED_TEXT);
    });
  }

  if (options.maxStringLength > 0 && sanitized.length > options.maxStringLength) {
    return `${sanitized.slice(0, options.maxStringLength)}...`;
  }

  return sanitized;
};

const sanitizeValue = (value, options, seen) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, options, seen));
  }

  if (isBuffer(value)) {
    return '[Buffer]';
  }

  if (typeof value === 'string') {
    return sanitizeString(value, options);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return '[Function]';
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (!isObject(value)) {
    return String(value);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);
  const output = {};
  Object.entries(value).forEach(([k, v]) => {
    if (shouldRedactKey(k)) {
      output[k] = DEFAULT_REDACTED_TEXT;
      return;
    }

    output[k] = sanitizeValue(v, options, seen);
  });
  seen.delete(value);
  return output;
};

const redactSensitiveData = (input, options = {}) => {
  const safeOptions = {
    maskPatterns: options.maskPatterns !== false,
    maxStringLength:
      options.maxStringLength === undefined ? 4000 : options.maxStringLength,
  };

  if (!input || typeof input !== 'object') {
    if (typeof input === 'string') {
      return sanitizeString(input, safeOptions);
    }
    return input;
  }

  return sanitizeValue(input, safeOptions, new WeakSet());
};

const sanitizeForLog = redactSensitiveData;

module.exports = {
  sanitizeForLog,
  redactSensitiveData,
  scanOutboundData: redactSensitiveData,
};
