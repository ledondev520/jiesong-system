/**
 * Input: node:test、node:assert/strict、aiService
 * Output: AI服务关键路径单元测试
 * Pos: 后端服务测试文件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const config = require('../config');
const { MODELS, estimateTokens, parseInput } = require('./aiService');

/**
 * 职责：临时关闭Kimi配置执行测试
 * 思路：保存原值 -> 覆盖为无Key -> 执行回调 -> 还原
 * @param {() => Promise<void>} callback - 测试回调
 * @returns {Promise<void>}
 */
const withDisabledKimi = async (callback) => {
  const originalKey = config.kimi.apiKey;
  config.kimi.apiKey = '';
  try {
    await callback();
  } finally {
    config.kimi.apiKey = originalKey;
  }
};

test('MODELS 暴露默认/视觉/快速/思考模型', () => {
  assert.ok(MODELS.default);
  assert.ok(MODELS.vision);
  assert.ok(MODELS.fast);
  assert.ok(MODELS.thinking);
});

test('estimateTokens 在无API Key时返回0 token', async () => {
  await withDisabledKimi(async () => {
    const result = await estimateTokens([{ role: 'user', content: 'hello' }]);
    assert.equal(result.data.total_tokens, 0);
  });
});

test('parseInput 在无API Key时走本地解析', async () => {
  await withDisabledKimi(async () => {
    const result = await parseInput('苹果 10 20 华南供应商', 'purchase');
    assert.equal(result.type, 'purchase');
    assert.equal(result.needsConfirmation, true);
    assert.equal(typeof result.data.quantity, 'number');
    assert.equal(typeof result.data.unitPrice, 'number');
  });
});

