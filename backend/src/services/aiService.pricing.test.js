/**
 * Input: aiService.generateLocalResponse and a private temporary pricing config
 * Output: the AI local fallback answers rate/price questions from the one pricing config (no 6.6 / ×1.3 constants)
 * Pos: pricing consumer regression (J7)
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-local-pricing-'));
process.env.JIESONG_PRICING_CONFIG = path.join(dir, 'pricing.json');
fs.writeFileSync(process.env.JIESONG_PRICING_CONFIG, JSON.stringify({
  exchangeRate: 6.72, exchangeAdjustment: -0.2, defaultMarkup: 0.3, categoryMarkups: [], roundUpTo: 5,
}), { mode: 0o600 });
test.after(() => fs.rmSync(dir, { recursive: true, force: true }));
const prisma = require('../utils/prisma');
const { generateLocalResponse } = require('./aiService');

test('汇率问答来自报价配置，不读 SystemConfig', async () => {
  const original = prisma.systemConfig.findUnique;
  prisma.systemConfig.findUnique = async () => { throw new Error('must not read SystemConfig'); };
  try {
    const answer = await generateLocalResponse('现在汇率多少');
    assert.match(answer, /现汇为6\.72/);
    assert.match(answer, /报价汇率为6\.52/);
  } finally {
    prisma.systemConfig.findUnique = original;
  }
});

test('售价问答使用唯一规则：¥10000 → 1995，而不是旧的 6.6/×1.3 口径', async () => {
  const answer = await generateLocalResponse('成本10000的价格是多少');
  assert.match(answer, /\$1995/);
  assert.doesNotMatch(answer, /6\.6/);
  assert.match(await generateLocalResponse('成本0的价格'), /大于0/);
});
