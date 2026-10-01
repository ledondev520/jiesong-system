/**
 * Input: 环境变量 (.env)
 * Output: 统一配置对象（含 JWT、Kimi、HSCIQ、上传、CORS 配置）
 * Pos: 配置中心，集中管理所有环境变量
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ENV_PATH = path.join(PROJECT_ROOT, '.env');

const isStrictPermissionMode =
  process.env.NODE_ENV === 'production' ||
  process.env.SECURITY_STRICT_CONFIG_PERMS === 'true';

const validateJwtSecret = () => {
  const secret = (process.env.JWT_SECRET || '').trim();
  if (!secret || secret.length < 32) {
    throw new Error('[security] JWT_SECRET 必须设置且长度不少于32个字符');
  }
  return secret;
};

const parseMaxFileSize = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }
  return 50 * 1024 * 1024;
};

const parseCorsOrigins = (value) =>
  String(value || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin && origin !== '*');

/**
 * 只允许文件权限 <= expectedMode。
 * @param {string} filePath
 * @param {number} expectedMode
 * @param {boolean} required
 * @param {string} label
 */
const assertSecureFilePermissions = ({
  filePath,
  expectedMode,
  required = false,
  label,
}) => {
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      if (required) {
        throw new Error(`[security] ${label} 文件不存在: ${filePath}`);
      }
      return;
    }
    throw new Error(`[security] 无法读取 ${label}: ${error.message}`);
  }

  const mode = stats.mode & 0o777;
  const extraBits = mode & (~expectedMode & 0o777);
  if (extraBits !== 0) {
    const message =
      `[security] ${label} 权限过宽 (当前: ${mode.toString(8)}, 建议 <= ${expectedMode.toString(8)}), ` +
      `文件: ${filePath}`;
    if (isStrictPermissionMode) {
      throw new Error(message);
    }
    console.warn(`[security] ${message}`);
  }
};

[
  { filePath: ENV_PATH, expectedMode: 0o600, required: false, label: '.env' },
  { filePath: path.join(PROJECT_ROOT, 'env.example'), expectedMode: 0o644, required: false, label: 'env.example' },
  { filePath: path.join(__dirname, 'constants.js'), expectedMode: 0o644, required: true, label: 'backend/src/config/constants.js' },
].forEach(assertSecureFilePermissions);

// 在读取环境密钥前检查文件权限。
const envResult = dotenv.config({ path: ENV_PATH });
if (envResult.error && envResult.error.code !== 'ENOENT') {
  throw envResult.error;
}

// Optional email registration must be either fully configured or disabled.
const emailKeys = ['ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET', 'JIESONG_EMAIL_FROM'];
if (emailKeys.some((key) => process.env[key]?.trim()) &&
    (!emailKeys.every((key) => process.env[key]?.trim()) || !/^[^\s@,]+@[^\s@,]+\.[^\s@,]+$/.test(process.env.JIESONG_EMAIL_FROM.trim()))) {
  throw new Error('邮箱注册需完整配置阿里云凭据与有效的 JIESONG_EMAIL_FROM');
}

const config = {
  // 服务器配置
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // JWT配置
  jwt: {
    secret: validateJwtSecret(),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // Kimi API配置
  kimi: {
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  },

  // HSCIQ API 配置（海关编码智能查询）
  hsciq: {
    apiKey: process.env.HSCIQ_API_KEY || '',
    baseUrl: process.env.HSCIQ_BASE_URL || 'https://www.hsciq.com/mcp',
  },
  
  // 文件上传配置
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxSize: parseMaxFileSize(process.env.MAX_FILE_SIZE),
  },
  
  // CORS配置
  cors: {
    origin: parseCorsOrigins(process.env.CORS_ORIGIN),
    credentials: true,
  },
};

module.exports = config;
