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
  try {
    return require('./index');
  } finally {
    process.env = originalEnv;
  }
};

test('config: 读取默认值', () => {
  const config = loadConfigWithEnv({
    PORT: '',
    NODE_ENV: '',
    JWT_SECRET: 'default-test-secret-change-me-please',
    JWT_EXPIRES_IN: '',
    KIMI_API_KEY: '',
    KIMI_BASE_URL: '',
    AI_PROVIDER: 'kimi',
    UPLOAD_DIR: '',
    MAX_FILE_SIZE: '',
    CORS_ORIGIN: '',
  });

  assert.equal(config.port, 3000);
  assert.equal(config.nodeEnv, 'development');
  assert.equal(config.jwt.secret, 'default-test-secret-change-me-please');
  assert.equal(config.jwt.expiresIn, '7d');
  assert.equal(config.kimi.apiKey, '');
  assert.equal(config.kimi.baseUrl, 'https://api.moonshot.cn/v1');
  assert.equal(config.upload.dir, './uploads');
  assert.equal(config.upload.maxSize, 50 * 1024 * 1024);
  assert.deepEqual(config.cors.origin, []);
  assert.equal(config.cors.credentials, true);
});

test('config: 读取环境变量覆盖', () => {
  const config = loadConfigWithEnv({
    PORT: '4001',
    NODE_ENV: 'production',
    JWT_SECRET: 'test-secret-with-32-chars--xxxxxxxx',
    JWT_EXPIRES_IN: '1h',
    KIMI_API_KEY: 'kimi-key',
    KIMI_BASE_URL: 'https://example.com',
    AI_PROVIDER: 'kimi',
    UPLOAD_DIR: './files',
    MAX_FILE_SIZE: '2048',
    CORS_ORIGIN: 'http://localhost:3000,https://test.example.com',
  });

  assert.equal(config.port, 4001);
  assert.equal(config.nodeEnv, 'production');
  assert.equal(config.jwt.secret, 'test-secret-with-32-chars--xxxxxxxx');
  assert.equal(config.jwt.expiresIn, '1h');
  assert.equal(config.kimi.apiKey, 'kimi-key');
  assert.equal(config.kimi.baseUrl, 'https://example.com');
  assert.equal(config.upload.dir, './files');
  assert.equal(config.upload.maxSize, 2048);
  assert.deepEqual(config.cors.origin, ['http://localhost:3000', 'https://test.example.com']);
  assert.equal(config.cors.credentials, true);
});

test('config: DeepSeek 是独立活动配置，不覆盖保留的 Kimi 配置', () => {
  const config = loadConfigWithEnv({
    AI_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: 'non-production-deepseek-test-placeholder',
    DEEPSEEK_BASE_URL: 'https://api.deepseek.com',
    KIMI_API_KEY: 'non-production-kimi-test-placeholder',
    JWT_SECRET: 'test-secret-with-32-chars--xxxxxxxx',
  });
  assert.equal(config.ai.provider, 'deepseek');
  assert.equal(config.ai.baseUrl, 'https://api.deepseek.com');
  assert.equal(config.ai.apiKey, 'non-production-deepseek-test-placeholder');
  assert.equal(config.kimi.apiKey, 'non-production-kimi-test-placeholder');
  assert.notEqual(config.ai, config.kimi);
});

test('config: 未知供应商在启动时拒绝，Kimi 活动配置复用原对象', () => {
  assert.throws(() => loadConfigWithEnv({ AI_PROVIDER: 'unsupported-provider' }), /AI_PROVIDER/);
  const config = loadConfigWithEnv({ AI_PROVIDER: 'kimi', JWT_SECRET: 'test-secret-with-32-chars--xxxxxxxx' });
  assert.equal(config.ai, config.kimi);
});

test('config: 生产环境先验证文件权限，再读取环境密钥', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  let environmentReads = 0;
  const context = {
    module: { exports: {} }, __dirname,
    process: { env: { NODE_ENV: 'production' } }, console,
    require: (name) => {
      if (name === 'fs') return { statSync: () => ({ mode: 0o644 }) };
      if (name === 'dotenv') return { config: () => { environmentReads++; return {}; } };
      return require(name);
    },
  };
  assert.throws(() => vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8'), context), /权限过宽/);
  assert.equal(environmentReads, 0);
});
