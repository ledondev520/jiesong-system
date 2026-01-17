/**
 * Input: node:test、node:assert/strict、环境变量
 * Output: 配置加载的单元测试结果
 * Pos: 后端配置中心测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * 职责：使用指定环境变量加载配置
 * 思路：
 * 1. 备份原环境变量
 * 2. 覆盖指定字段
 * 3. 清理模块缓存重新加载
 * 4. 恢复环境变量
 * @param {Object} overrides - 环境变量覆盖值
 * @returns {Object} 加载后的配置对象
 */
const loadConfigWithEnv = (overrides) => {
  const originalEnv = { ...process.env };
  Object.keys(overrides).forEach((key) => {
    process.env[key] = overrides[key];
  });

  delete require.cache[require.resolve('./index')];
  const config = require('./index');

  process.env = originalEnv;
  return config;
};

test('config: 读取默认值', () => {
  const config = loadConfigWithEnv({
    PORT: '',
    NODE_ENV: '',
    JWT_SECRET: '',
    JWT_EXPIRES_IN: '',
    KIMI_API_KEY: '',
    KIMI_BASE_URL: '',
    UPLOAD_DIR: '',
    MAX_FILE_SIZE: '',
    CORS_ORIGIN: '',
  });

  assert.equal(config.port, 3001);
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.jwt.secret, 'default-secret-change-me');
  assert.equal(config.jwt.expiresIn, '7d');
  assert.equal(config.kimi.apiKey, '');
  assert.equal(config.kimi.baseUrl, 'https://api.moonshot.cn/v1');
  assert.equal(config.upload.dir, './uploads');
  assert.equal(config.upload.maxSize, 10 * 1024 * 1024);
  assert.equal(config.cors.origin, '*');
  assert.equal(config.cors.credentials, true);
});

test('config: 读取环境变量覆盖', () => {
  const config = loadConfigWithEnv({
    PORT: '4001',
    NODE_ENV: 'production',
    JWT_SECRET: 'test-secret',
    JWT_EXPIRES_IN: '1h',
    KIMI_API_KEY: 'kimi-key',
    KIMI_BASE_URL: 'https://example.com',
    UPLOAD_DIR: './files',
    MAX_FILE_SIZE: '2048',
    CORS_ORIGIN: 'http://localhost:3000',
  });

  assert.equal(config.port, 4001);
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.jwt.secret, 'test-secret');
  assert.equal(config.jwt.expiresIn, '1h');
  assert.equal(config.kimi.apiKey, 'kimi-key');
  assert.equal(config.kimi.baseUrl, 'https://example.com');
  assert.equal(config.upload.dir, './files');
  assert.equal(config.upload.maxSize, 2048);
  assert.equal(config.cors.origin, 'http://localhost:3000');
  assert.equal(config.cors.credentials, true);
});
