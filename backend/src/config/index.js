/**
 * Input: 环境变量 (.env)
 * Output: 统一配置对象
 * Pos: 配置中心，集中管理所有环境变量
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

require('dotenv').config();

const config = {
  // 服务器配置
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // JWT配置
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  
  // Kimi API配置
  kimi: {
    apiKey: process.env.KIMI_API_KEY || '',
    baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
  },
  
  // 文件上传配置
  upload: {
    dir: process.env.UPLOAD_DIR || './uploads',
    maxSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10 * 1024 * 1024,
  },
  
  // CORS配置
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
};

module.exports = config;
