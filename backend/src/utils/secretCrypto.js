/**
 * Input: crypto, 配置
 * Output: API Key 加解密与脱敏工具
 * Pos: 系统配置中敏感字段的加密存储与安全响应
 */

const crypto = require('crypto');
const config = require('../config');

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

const trimToString = (value) => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
};

const getEncryptionKey = () => {
  const secret = trimToString(config.jwt?.secret);
  return crypto.createHash('sha256').update(secret).digest();
};

const safeJsonParse = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const SENSITIVE_CONFIG_KEYS = [
  'kimiapikey',
  'api_key',
  'apikey',
  'secret',
  'password',
  'passwd',
  'credential',
  'token',
  'auth_token',
  'access_token',
  'refresh_token',
  'private_key',
  'encryption_key',
  'smtp_password',
  'database_password',
  'aws_secret',
  'azure_key',
  'gcp_key',
];

const isApiKeyConfigKey = (key) => {
  const normalizedKey = trimToString(key).toLowerCase();
  return SENSITIVE_CONFIG_KEYS.some(sensitiveKey =>
    normalizedKey === sensitiveKey ||
    normalizedKey.includes(sensitiveKey)
  );
};

const isEncryptedPayload = (value) => {
  return (
    value &&
    typeof value === 'object' &&
    value.encrypted === true &&
    typeof value.iv === 'string' &&
    typeof value.tag === 'string' &&
    typeof value.value === 'string'
  );
};

const encryptApiKeyForStorage = (rawApiKey) => {
  const apiKey = trimToString(rawApiKey);
  const key = getEncryptionKey();

  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return JSON.stringify({
    encrypted: true,
    algorithm: CIPHER_ALGORITHM,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    value: encrypted.toString('base64'),
  });
};

const decryptApiKeyFromStorage = (storedValue) => {
  const payload = safeJsonParse(storedValue) ?? storedValue;
  if (!isEncryptedPayload(payload)) {
    if (typeof payload === 'string') {
      return payload;
    }
    return '';
  }

  try {
    const key = getEncryptionKey();
    const iv = Buffer.from(payload.iv, 'base64');
    const tag = Buffer.from(payload.tag, 'base64');
    const encrypted = Buffer.from(payload.value, 'base64');

    const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
};

/**
 * 职责：对 API Key 做安全展示处理
 * 思路：管理员端口已通过 roleAuth('ADMIN') 保护，直接返回明文密钥供管理员查看和管理
 * @param {string} apiKey 解密后的明文
 * @returns {string} 完整密钥（空串表示未配置）
 */
const maskApiKeyForApiResponse = (apiKey) => {
  if (typeof apiKey !== 'string' || !apiKey) {
    return '';
  }

  return apiKey;
};

const normalizeConfigValueForStorage = (key, value) => {
  if (!isApiKeyConfigKey(key)) {
    return JSON.stringify(value);
  }

  if (typeof value !== 'string') {
    return JSON.stringify(value);
  }

  return encryptApiKeyForStorage(value);
};

const normalizeConfigValueForResponse = (key, rawValue) => {
  if (!isApiKeyConfigKey(key)) {
    const parsed = safeJsonParse(rawValue);
    return parsed === null ? rawValue : parsed;
  }

  const parsed = safeJsonParse(rawValue);
  const plaintext = decryptApiKeyFromStorage(parsed === null ? rawValue : parsed);
  return maskApiKeyForApiResponse(plaintext);
};

module.exports = {
  normalizeConfigValueForStorage,
  normalizeConfigValueForResponse,
};
