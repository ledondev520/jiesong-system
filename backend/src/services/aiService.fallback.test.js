/**
 * Input: node:test、子进程内 stub 的 fetch / Prisma（全部使用合成密钥与 .invalid 域名）
 * Output: 经 aiService 的 DeepSeek 自动回退端到端测试（聊天、SSE、解析、用量、熔断、禁用）
 * Pos: 后端 AI 服务回退测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

test('aiService fallback (mocked transport): chat, SSE, parse, usage model, breaker, disabled, no key', () => {
  // Every key/endpoint below is synthetic and fetch is stubbed, so no real call is possible.
  const code = `
    const assert = require('node:assert/strict');
    const config = require('./src/config');
    const baseAi = { provider: 'openai', apiKey: 'test-only-primary-key', baseUrl: 'https://primary.invalid/v1', model: 'synthetic-openai-model', maxRetries: 0, maxOutputTokens: 16000 };
    const baseFallback = { enabled: true, provider: 'deepseek', apiKey: 'test-only-fallback-key', baseUrl: 'https://fallback.invalid', breakerThreshold: 3, breakerCooldownMs: 60000 };
    let cooldown = 60000;
    const useFallback = (overrides) => { cooldown += 1; config.aiFallback = overrides === false ? { enabled: false } : { ...baseFallback, breakerCooldownMs: cooldown, ...overrides }; };
    config.ai = { ...baseAi };
    require('./src/services/ai/contextService').getDbContext = async () => '';
    const prisma = require('./src/utils/prisma');
    const usages = []; const history = [];
    let storedKey = null;
    prisma.systemConfig.findUnique = async () => storedKey;
    prisma.systemConfig.findMany = async () => [];
    prisma.chatHistory.findMany = async () => [];
    prisma.chatHistory.create = async ({ data }) => { history.push(data); return data; };
    prisma.tokenUsage.create = async ({ data }) => { usages.push(data); return data; };
    const enc = new TextEncoder();
    const frame = (chunk) => 'data: ' + JSON.stringify(chunk) + '\\n\\n';
    const sse = (chunks) => new Response(chunks.map(frame).join('') + 'data: [DONE]\\n\\n', { headers: { 'content-type': 'text/event-stream' } });
    const fail = (status, headers = {}) => new Response(JSON.stringify({ error: { message: 'synthetic' } }), { status, headers: { 'content-type': 'application/json', ...headers } });
    const answer = (content, usage = { prompt_tokens: 4, completion_tokens: 7 }) => sse([{ choices: [{ delta: { content } }] }, { choices: [], usage }]);
    let primaryReply; let fallbackReply;
    const seen = [];
    global.fetch = async (url, options) => {
      const u = new URL(url);
      const host = u.hostname.startsWith('primary') ? 'primary' : 'fallback';
      seen.push({ host, url: String(url), auth: new Headers(options.headers).get('authorization'), body: JSON.parse(options.body) });
      const reply = host === 'primary' ? primaryReply : fallbackReply;
      return typeof reply === 'function' ? reply() : reply.clone();
    };
    const count = (host) => seen.filter((call) => call.host === host).length;
    const reset = () => { seen.length = 0; usages.length = 0; history.length = 0; };
    const ai = require('./src/services/aiService');
    (async () => {
      // 1) chat(): primary 503 -> DeepSeek answers; same response shape; usage + history record DeepSeek
      reset(); useFallback(); primaryReply = fail(503); fallbackReply = answer('OK');
      const chat = await ai.chat('u1', 's1', 'hello');
      assert.deepEqual(Object.keys(chat).sort(), ['message', 'model', 'sessionId', 'tokenUsage']);
      assert.equal(chat.message, 'OK');
      assert.equal(chat.model, 'deepseek-flash');
      assert.deepEqual(chat.tokenUsage, { prompt: 4, completion: 7, total: 11 });
      assert.equal(count('primary'), 1); assert.equal(count('fallback'), 1);
      const fb = seen.find((call) => call.host === 'fallback');
      assert.equal(fb.url, 'https://fallback.invalid/chat/completions');
      assert.equal(fb.auth, 'Bearer test-only-fallback-key');
      assert.equal(fb.body.model, 'deepseek-flash');
      assert.deepEqual(fb.body.thinking, { type: 'enabled' });
      assert.equal(fb.body.reasoning_effort, 'high');
      assert.equal(Object.hasOwn(fb.body, 'max_completion_tokens'), false);
      assert.equal(usages.length, 1, 'only the answering attempt is recorded; the failed attempt adds nothing');
      assert.equal(usages[0].model, 'deepseek-flash');
      assert.equal(usages[0].totalTokens, 11);
      assert.equal(usages[0].requestType, 'chat');
      assert.equal(history.at(-1).modelUsed, 'deepseek-flash');

      // 2) primary success: untouched, OpenAI model recorded, DeepSeek never contacted
      reset(); useFallback(); primaryReply = answer('P', { prompt_tokens: 1, completion_tokens: 2 });
      const okChat = await ai.chat('u1', 's1', 'hello');
      assert.equal(okChat.model, 'synthetic-openai-model'); assert.equal(okChat.message, 'P');
      assert.equal(count('fallback'), 0); assert.equal(usages[0].model, 'synthetic-openai-model');

      // 3) SSE stream: failure before any chunk -> DeepSeek; done.model / usage = DeepSeek
      reset(); useFallback(); primaryReply = fail(500);
      fallbackReply = sse([{ choices: [{ delta: { reasoning_content: 'think' } }] }, { choices: [{ delta: { content: 'S' } }] }, { choices: [], usage: { prompt_tokens: 5, completion_tokens: 6 } }]);
      const content = []; const thinking = [];
      const streamed = await ai.chatStream('u1', 's2', 'hello', null, (c) => content.push(c), (t) => thinking.push(t));
      assert.deepEqual(content, ['S']); assert.deepEqual(thinking, ['think']);
      assert.equal(streamed.model, 'deepseek-flash');
      assert.deepEqual(streamed.tokenUsage, { prompt: 5, completion: 6, total: 11 });
      assert.equal(usages[0].model, 'deepseek-flash'); assert.equal(usages[0].requestType, 'chat_stream');

      // 4) SSE stream that already delivered a chunk then breaks: no splice, today's graceful error, DeepSeek untouched
      reset(); useFallback();
      primaryReply = () => new Response(new ReadableStream({ start(controller) {
        controller.enqueue(enc.encode(frame({ choices: [{ delta: { content: 'part' } }] })));
        setTimeout(() => controller.error(new Error('socket closed')), 5);
      } }), { headers: { 'content-type': 'text/event-stream' } });
      fallbackReply = answer('NEVER');
      const partial = []; 
      const broken = await ai.chatStream('u1', 's3', 'hello', null, (c) => partial.push(c));
      assert.equal(partial[0], 'part'); assert.equal(partial.includes('NEVER'), false);
      assert.equal(count('fallback'), 0);
      assert.equal(broken.model, 'synthetic-openai-model');
      assert.equal(usages.length, 0);

      // 5) parseInput (/ai/parse): shape identical, usage model = DeepSeek
      reset(); useFallback(); primaryReply = fail(502); fallbackReply = answer('{"productName":"X","quantity":2}');
      const parsed = await ai.parseInput('buy X 2', 'purchase', null, 'u1');
      assert.deepEqual(Object.keys(parsed).sort(), ['confidence', 'data', 'needsConfirmation', 'rawText', 'tokenUsage', 'type']);
      assert.deepEqual(parsed.data, { productName: 'X', quantity: 2 });
      assert.equal(usages[0].model, 'deepseek-flash'); assert.equal(usages[0].requestType, 'parse');

      // 6) callAI (HS recommend / agent adapter share getOpenAIClient)
      reset(); useFallback(); primaryReply = fail(429); fallbackReply = answer('HS');
      const viaCallAi = await ai.callAI([{ role: 'user', content: 'x' }]);
      assert.equal(viaCallAi.content, 'HS'); assert.equal(viaCallAi.model, 'deepseek-flash');
      reset(); useFallback(); primaryReply = fail(503);
      fallbackReply = new Response(JSON.stringify({ choices: [{ message: { content: 'AGENT' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { headers: { 'content-type': 'application/json' } });
      const adapter = require('./src/services/anthropicCompatService');
      const compat = await adapter.createMessageWithClient({
        payload: { messages: [{ role: 'user', content: 'x' }] }, defaultModel: 'd', fallbackModel: 'f', client: await ai.getOpenAIClient(),
      });
      assert.equal(compat.model, 'deepseek-flash');
      assert.ok(JSON.stringify(compat.content).includes('AGENT'), 'agent adapter goes through the same client');
      assert.equal(count('fallback'), 1);

      // 7) image request: image parts forwarded to DeepSeek on fallback
      reset(); useFallback(); primaryReply = fail(503); fallbackReply = answer('IMG');
      const withImage = await ai.chat('u1', 's4', 'what is this', 'data:image/png;base64,AAAA');
      assert.equal(withImage.message, 'IMG'); assert.equal(withImage.model, 'deepseek-flash');
      const imageParts = seen.find((call) => call.host === 'fallback').body.messages.at(-1).content;
      assert.ok(imageParts.some((part) => part.type === 'image_url'));

      // 8) both fail: existing graceful message, nothing recorded
      reset(); useFallback(); primaryReply = fail(429, { 'retry-after': '0' }); fallbackReply = fail(500);
      const both = await ai.chat('u1', 's5', 'hello');
      assert.equal(both.message, '错误：请求过于频繁，请稍后再试。');
      assert.equal(count('fallback'), 1); assert.equal(usages.length, 0);

      // 9) fallback disabled: exactly the old behaviour (generic error, no DeepSeek contact, unwrapped client)
      reset(); useFallback(false); primaryReply = fail(503); fallbackReply = answer('NEVER');
      const off = await ai.chat('u1', 's6', 'hello');
      assert.equal(off.message, '抱歉，AI服务出错了。'); assert.equal(count('fallback'), 0); assert.equal(count('primary'), 1);
      assert.equal(typeof (await ai.getOpenAIClient()).chat.completions.create, 'function');
      config.aiFallback = undefined;
      reset(); primaryReply = fail(503);
      assert.equal((await ai.chat('u1', 's6', 'hello')).message, '抱歉，AI服务出错了。');

      // 10) no DeepSeek key anywhere: primary error surfaces, DeepSeek never called, no crash
      reset(); useFallback({ apiKey: '' }); primaryReply = fail(503); fallbackReply = answer('NEVER');
      assert.equal((await ai.chat('u1', 's7', 'hello')).message, '抱歉，AI服务出错了。'); assert.equal(count('fallback'), 0);

      // 11) AI_PROVIDER=deepseek never falls back to itself
      reset(); useFallback(); config.ai = { provider: 'deepseek', apiKey: 'test-only-primary-key', baseUrl: 'https://primary.invalid/v1' };
      primaryReply = fail(503); fallbackReply = answer('NEVER');
      assert.equal((await ai.chat('u1', 's8', 'hello')).message, '抱歉，AI服务出错了。'); assert.equal(count('fallback'), 0);
      config.ai = { ...baseAi };

      // 12) breaker: threshold 2 -> third request goes straight to DeepSeek (primary not contacted)
      reset(); useFallback({ breakerThreshold: 2 }); primaryReply = fail(503); fallbackReply = answer('B');
      await ai.chat('u1', 's9', 'one'); await ai.chat('u1', 's9', 'two');
      assert.equal(count('primary'), 2);
      const skipped = await ai.chat('u1', 's9', 'three');
      assert.equal(count('primary'), 2, 'open breaker skips the primary'); assert.equal(skipped.message, 'B');
      assert.equal(skipped.model, 'deepseek-flash');
      // 13) greeting-style callers can opt out; the default client is the wrapped one
      useFallback(); config.ai = { provider: 'kimi', apiKey: 'test-only-primary-key', baseUrl: 'https://primary.invalid/v1' };
      assert.equal((await ai.getOpenAIClient({ fallback: false })).apiKey, 'test-only-primary-key', 'raw SDK client');
      assert.equal((await ai.getOpenAIClient()).apiKey, undefined, 'fallback wrapper');
      reset(); primaryReply = fail(503); fallbackReply = answer('NEVER');
      const greeting = await ai.generateGreeting();
      assert.equal(greeting.source, 'local');
      assert.equal(count('primary'), 1); assert.equal(count('fallback'), 0, 'greeting never falls back');
      config.ai = { ...baseAi };
      console.log('fallback synthetic checks completed');
    })().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
  `;
  const result = spawnSync(process.execPath, ['-e', code], {
    cwd: path.resolve(__dirname, '../..'),
    env: { ...process.env, NODE_ENV: 'test', AI_ALLOW_REMOTE: 'true', AI_PROVIDER: 'kimi', OPENAI_API_KEY: '', AI_FALLBACK_PROVIDER: '' },
    encoding: 'utf8', timeout: 15000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /fallback synthetic checks completed/);
  const output = result.stdout + result.stderr;
  for (const secret of ['test-only-primary-key', 'test-only-fallback-key']) assert.equal(output.includes(secret), false, 'keys are never printed');
});
