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
const { MODELS, estimateTokens, parseInput, generateGreeting } = require('./aiService');

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

test('generateGreeting 在测试环境默认走本地降级且输出稳定', async () => {
  const result = await generateGreeting();
  assert.equal(result.source, 'local');
  assert.equal(result.greeting, '每一天都是新的开始！');
  assert.deepEqual(result.lyrics, [
    '欢迎使用捷淞进销存系统',
    'AI助手随时为您服务',
    '祝您工作顺利',
    '今天也要加油哦',
  ]);
});

test('AI SDK: 单次流请求使用 usage，失败不重试，问候 deadline 覆盖 body', () => {
  const { spawnSync } = require('node:child_process');
  // Isolated transport stubs only. The public synthetic key cannot reach any real endpoint.
  const code = `
    const assert = require('node:assert/strict');
    const testDeadline = setTimeout(() => { console.error('synthetic test deadline'); process.exitCode = 1; }, 2000);
    const config = require('./src/config');
    config.kimi.apiKey = 'test-only-non-production-key';
    config.kimi.baseUrl = 'https://synthetic.invalid/v1';
    const prisma = require('./src/utils/prisma');
    prisma.systemConfig.findMany = async () => [];
    let phase = 'completion';
    const calls = [];
    let aborted = false;
    let greetingBody;
    global.fetch = async (url, options) => {
      calls.push(new URL(url).pathname);
      if (phase === 'failure') return new Response(JSON.stringify({ error: { message: 'synthetic error', type: 'server_error' } }), { status: 503, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
      if (new URL(url).pathname.includes('tokenizers')) return new Response(JSON.stringify({ data: { total_tokens: 99 } }), { headers: { 'content-type': 'application/json' } });
      if (phase === 'greeting' || phase === 'completion-timeout') {
        greetingBody = JSON.parse(options.body);
        const body = new ReadableStream({ start(controller) {
          if (phase === 'completion-timeout') controller.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ choices: [{ delta: { content: 'partial' } }] }) + '\\n\\n'));
          options.signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('synthetic abort', 'AbortError')); }, { once: true });
        } });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      const chunks = [{ choices: [{ delta: { content: 'OK' } }] }, { choices: [], usage: { prompt_tokens: 12, completion_tokens: 15 } }];
      return new Response(chunks.map(chunk => 'data: ' + JSON.stringify(chunk) + '\\n\\n').join('') + 'data: [DONE]\\n\\n', { headers: { 'content-type': 'text/event-stream' } });
    };
    const ai = require('./src/services/aiService');
    (async () => {
      const result = await ai.callKimiAPI([{ role: 'user', content: 'synthetic' }], 'synthetic-model');
      assert.equal(result.content, 'OK');
      assert.deepEqual(result.tokenUsage, { promptTokens: 12, outputTokens: 15 });
      assert.deepEqual(calls, ['/v1/chat/completions']);
      phase = 'failure'; calls.length = 0;
      await ai.callKimiAPI([], 'synthetic-model');
      assert.equal(calls.length, 1);
      phase = 'completion-timeout'; calls.length = 0;
      const stalledAt = Date.now();
      const incomplete = await ai.callKimiAPI([], 'synthetic-model');
      assert.match(incomplete.content, /超时/);
      assert.equal(calls.length, 1);
      assert.ok(Date.now() - stalledAt >= 450 && Date.now() - stalledAt < 1000);
      phase = 'greeting'; calls.length = 0;
      const started = Date.now();
      const greeting = await ai.generateGreeting();
      assert.equal(greeting.source, 'local');
      assert.equal(aborted, true);
      assert.equal(Object.hasOwn(greetingBody, 'signal'), false);
      assert.ok(Date.now() - started < 1000);
      console.log('transport checks completed');
    })().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { clearTimeout(testDeadline); return prisma.$disconnect(); });
  `;
  const result = spawnSync(process.execPath, ['-e', code], {
    cwd: require('node:path').resolve(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'test', AI_ALLOW_REMOTE: 'true', KIMI_REQUEST_TIMEOUT_MS: '500', KIMI_GREETING_TIMEOUT_MS: '200' },
    encoding: 'utf8', timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /transport checks completed/);
});
