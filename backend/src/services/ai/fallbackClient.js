/**
 * Input: 主 provider 的 OpenAI 协议客户端、懒加载的 DeepSeek 客户端、熔断阈值
 * Output: 与主客户端同形的 chat.completions.create：主调用失败时同一请求透明改发 DeepSeek 一次
 * Pos: AI 回退适配层（AI_FALLBACK_PROVIDER=deepseek）；aiService.getOpenAIClient 唯一接入点，聊天/解析/HS/Agent 共用
 * Note: 不含任何密钥；日志只含状态码/错误名，不含提示词。流一旦向调用方产出过分片就不再切换（不拼接两个 provider）。
 *       双方都失败时抛出主调用的原始错误，用户看到的错误文案与未启用回退时一致。
 */
const DEEPSEEK_PROFILE = Object.freeze({
  model: 'deepseek-flash',
  thinking: Object.freeze({ type: 'enabled' }),
  reasoning_effort: 'high',
});
// 代码内依据：MODELS.vision 与 getModels 都把 deepseek-flash 声明为视觉模型，适配器原样转发 image_url 分片。
// shortcut: 未对真实 DeepSeek 端点验证过图像输入，若上游拒绝则回退失败并返回主错误；确认不支持时改为 false。
const DEEPSEEK_SUPPORTS_IMAGES = true;
// 现有 DeepSeek 路径的 max_tokens 从未超过 aiMaxTokens 上限 8192。
const DEEPSEEK_MAX_TOKENS = 8192;
const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

const hasImageInput = (body) => (Array.isArray(body?.messages) ? body.messages : []).some(
  (message) => Array.isArray(message?.content) && message.content.some((part) => part?.type === 'image_url' || part?.type === 'image'),
);

/**
 * 'abort'    用户/调用方取消：不回退
 * 'systemic' 网络、超时、429、5xx、401/403/404/408：回退并计入熔断
 * 'provider' 其他提供方 4xx（如 400/413/422）：回退，但不计入熔断（上游可达）
 * 'other'    非提供方错误（本地 TypeError、无超时原因的 AbortError 等）：不回退
 */
const classifyFailure = (error, signal) => {
  if (signal?.aborted) return signal.reason?.name === 'TimeoutError' ? 'systemic' : 'abort';
  const name = String(error?.name || '');
  if (name === 'TimeoutError') return 'systemic';
  const status = Number(error?.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status === 429 || status >= 500 || [401, 403, 404, 408].includes(status) ? 'systemic' : 'provider';
  }
  if (/^API(Connection|ConnectionTimeout)?Error$/.test(name) || NETWORK_CODES.has(error?.code)) return 'systemic';
  return 'other';
};

/** 进程内熔断：closed → open（连续 threshold 次失败）→ 冷却后 half-open 仅放行一个探测请求。 */
const createBreaker = ({ threshold, cooldownMs, now = Date.now, log = console.warn }) => {
  let state = 'closed';
  let failures = 0;
  let openUntil = 0;
  let probing = false;
  const transition = (next, detail) => {
    state = next;
    log(`[ai-fallback] breaker ${next}${detail ? ` (${detail})` : ''}`);
  };
  return {
    get state() { return state; },
    /** @returns {'primary'|'probe'|'skip'} */
    acquire() {
      if (state === 'closed') return 'primary';
      if (state === 'open' && now() < openUntil) return 'skip';
      if (probing) return 'skip';
      if (state === 'open') transition('half-open');
      probing = true;
      return 'probe';
    },
    /** 取消的探测不给结论，只释放探测名额 */
    release() { probing = false; },
    record(ok) {
      probing = false;
      if (ok) {
        failures = 0;
        if (state !== 'closed') transition('closed');
        return;
      }
      failures += 1;
      if (state === 'half-open' || (state === 'closed' && failures >= threshold)) {
        openUntil = now() + cooldownMs;
        transition('open', `${failures} consecutive primary failures, cooldown ${cooldownMs}ms`);
      }
    },
  };
};

const buildFallbackBody = (body) => {
  // thinking 模式不带 temperature；OpenAI 专属 max_completion_tokens 折回 max_tokens
  const { temperature, max_completion_tokens: completionTokens, ...rest } = body || {};
  void temperature;
  const requested = Number(rest.max_tokens ?? completionTokens);
  return {
    ...rest,
    ...(Number.isFinite(requested) && requested > 0 ? { max_tokens: Math.min(requested, DEEPSEEK_MAX_TOKENS) } : {}),
    ...DEEPSEEK_PROFILE,
  };
};

const describe = (error) => `name=${error?.name || 'unknown'} status=${error?.status ?? 'n/a'}`;

const tag = (target, servedBy, deadlineSignal) => {
  // 非枚举：不改变响应序列化形状
  Object.defineProperty(target, 'servedBy', { value: servedBy, enumerable: false, configurable: true });
  if (deadlineSignal) Object.defineProperty(target, 'deadlineSignal', { value: deadlineSignal, enumerable: false, configurable: true });
  return target;
};

/**
 * @param {object} deps
 * @param {object} deps.primary 主客户端（chat.completions.create）
 * @param {() => Promise<object|null>} deps.getFallback 懒加载 DeepSeek 客户端；不可用返回 null
 * @param {ReturnType<typeof createBreaker>} deps.breaker
 * @param {() => object} deps.getRequestOptions 回退调用的全新 deadline（主调用的 deadline 可能已耗尽）
 * @param {boolean} [deps.supportsImages]
 */
const wrapWithFallback = ({
  primary, getFallback, breaker, getRequestOptions, supportsImages = DEEPSEEK_SUPPORTS_IMAGES, log = console.warn,
}) => {
  const servedBy = { provider: 'deepseek', model: DEEPSEEK_PROFILE.model };

  const resolveFallback = async () => {
    try { return await getFallback(); } catch { return null; }
  };

  /** 失败时抛主错误，用户看到的文案与未启用回退时一致；回退不可用同样抛主错误。 */
  const startFallback = async (body, options, primaryError) => {
    const client = await resolveFallback();
    if (!client) throw primaryError;
    try {
      return await client.chat.completions.create(buildFallbackBody(body), options);
    } catch (fallbackError) {
      log(`[ai-fallback] fallback failed (${describe(fallbackError)})`);
      throw primaryError;
    }
  };

  const wrapStream = (stream, body, options) => {
    let current = stream;
    let served;
    let deadlineSignal;
    return {
      get controller() { return current.controller; },
      get servedBy() { return served; },
      get deadlineSignal() { return deadlineSignal; },
      async *[Symbol.asyncIterator]() {
        let yielded = false;
        try {
          for await (const chunk of stream) {
            if (!yielded) { yielded = true; breaker.record(true); }
            yield chunk;
          }
          if (!yielded) breaker.record(true);
          return;
        } catch (error) {
          const kind = classifyFailure(error, options?.signal);
          if (kind === 'abort' || kind === 'other') breaker.release();
          else breaker.record(kind === 'provider');
          if (yielded || kind === 'abort' || kind === 'other') throw error;
          log(`[ai-fallback] primary stream failed before first chunk (${describe(error)}), using deepseek`);
          const fallbackOptions = getRequestOptions();
          const fallbackStream = await startFallback(body, fallbackOptions, error);
          current = fallbackStream;
          served = servedBy;
          deadlineSignal = fallbackOptions.signal;
          let fallbackYielded = false;
          try {
            for await (const chunk of fallbackStream) {
              fallbackYielded = true;
              yield chunk;
            }
          } catch (fallbackError) {
            log(`[ai-fallback] fallback stream failed (${describe(fallbackError)})`);
            throw fallbackYielded ? fallbackError : error;
          }
        }
      },
    };
  };

  const create = async (body, options) => {
    if (hasImageInput(body) && !supportsImages) return primary.chat.completions.create(body, options);
    if (breaker.acquire() === 'skip') {
      const client = await resolveFallback();
      // 熔断打开时直连 DeepSeek；其错误原样抛出（没有主错误可代替）。回退不可用则仍走主调用。
      if (client) return tag(await client.chat.completions.create(buildFallbackBody(body), options), servedBy);
    }
    try {
      const result = await primary.chat.completions.create(body, options);
      if (body?.stream === true) return wrapStream(result, body, options);
      breaker.record(true);
      return result;
    } catch (error) {
      const kind = classifyFailure(error, options?.signal);
      if (kind === 'abort' || kind === 'other') breaker.release();
      else breaker.record(kind === 'provider');
      if (kind === 'abort' || kind === 'other') throw error;
      log(`[ai-fallback] primary failed (${describe(error)}), using deepseek`);
      const fallbackOptions = getRequestOptions();
      return tag(await startFallback(body, fallbackOptions, error), servedBy, fallbackOptions.signal);
    }
  };

  return { chat: { completions: { create } } };
};

module.exports = {
  wrapWithFallback,
  createBreaker,
  classifyFailure,
  buildFallbackBody,
  hasImageInput,
  DEEPSEEK_PROFILE,
  DEEPSEEK_SUPPORTS_IMAGES,
};
