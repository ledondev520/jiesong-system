/**
 * Input: 主 provider 的 OpenAI 协议客户端、懒加载的 DeepSeek 客户端、熔断阈值
 * Output: 与主客户端同形的 chat.completions.create：主调用失败时同一请求透明改发 DeepSeek 一次
 * Pos: AI 回退适配层（AI_FALLBACK_PROVIDER=deepseek）；aiService.getOpenAIClient 唯一接入点，聊天/解析/HS/Agent 共用
 * Note: 不含任何密钥；日志只含状态码/错误名，不含提示词。流一旦向调用方产出过分片就不再切换（不拼接两个 provider）。
 *       双方都失败时抛出主调用的原始错误，用户看到的错误文案与未启用回退时一致。
 */
const OpenAI = require('openai');

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
// 整个请求（主调用 + 回退）的总预算：低于 nginx proxy_read_timeout / axios 的 60s，留出上下文构建与落库时间。
const OVERALL_BUDGET_MS = 50000;
// 剩余预算不足此值时不再发起回退。
const MIN_FALLBACK_MS = 3000;
const NETWORK_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE',
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT',
]);

const hasImageInput = (body) => (Array.isArray(body?.messages) ? body.messages : []).some(
  (message) => Array.isArray(message?.content) && message.content.some((part) => part?.type === 'image_url' || part?.type === 'image'),
);

const causeChain = function* (error) {
  for (let current = error, depth = 0; current && depth < 5; current = current.cause, depth += 1) yield current;
};

/**
 * 真实 openai SDK 的错误类 name 都是 'Error'，必须用 instanceof；errno 在 error.cause 上。
 * 'abort'    用户/调用方取消：不回退
 * 'systemic' 网络、超时、429、5xx、401/403/404/408、无状态码的 SDK 错误（如流内 error 事件）：回退并计入熔断
 * 'provider' 其他提供方 4xx（如 400/413/422）：回退，但不计入熔断（上游可达）
 * 'other'    非提供方错误（本地 TypeError、无超时原因的 AbortError 等）：不回退
 */
const classifyFailure = (error, signal) => {
  if (signal?.aborted) return signal.reason?.name === 'TimeoutError' ? 'systemic' : 'abort';
  if (!error) return 'other';
  if (error instanceof OpenAI.APIUserAbortError) return 'abort';
  if (error instanceof OpenAI.APIConnectionError || error.name === 'TimeoutError') return 'systemic';
  const status = Number(error.status);
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    return status === 429 || status >= 500 || [401, 403, 404, 408].includes(status) ? 'systemic' : 'provider';
  }
  if (error instanceof OpenAI.APIError) return 'systemic';
  for (const link of causeChain(error)) if (NETWORK_CODES.has(link.code)) return 'systemic';
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

/** 只有真正会展示给用户的分片（正文/推理/工具调用）才算已送达；role、usage、空分片不算。 */
const isDeliverable = (chunk) => {
  const delta = chunk?.choices?.[0]?.delta;
  return Boolean(delta?.content || delta?.reasoning_content || delta?.tool_calls?.length);
};

/**
 * @param {object} deps
 * @param {object} deps.primary 主客户端（chat.completions.create）
 * @param {() => Promise<object|null>} deps.getFallback 懒加载 DeepSeek 客户端；不可用返回 null
 * @param {ReturnType<typeof createBreaker>} deps.breaker
 * @param {(timeoutMs: number) => object} deps.getRequestOptions 回退调用的全新 deadline（主调用的 deadline 可能已耗尽）
 * @param {number} deps.deadlineMs 单次调用的完整响应 deadline
 * @param {boolean} [deps.supportsImages]
 */
const wrapWithFallback = ({
  primary, getFallback, breaker, getRequestOptions, deadlineMs,
  supportsImages = DEEPSEEK_SUPPORTS_IMAGES, log = console.warn, now = Date.now,
}) => {
  const servedBy = { provider: 'deepseek', model: DEEPSEEK_PROFILE.model };

  const resolveFallback = async () => {
    try { return await getFallback(); } catch { return null; }
  };

  /** 剩余总预算内的全新 deadline；预算不足返回 null（不再回退）。 */
  const budgetedOptions = (startedAt) => {
    const remaining = OVERALL_BUDGET_MS - (now() - startedAt);
    return remaining < MIN_FALLBACK_MS ? null : getRequestOptions(Math.min(deadlineMs, remaining));
  };

  /** 失败时抛主错误，用户看到的文案与未启用回退时一致；回退不可用/无预算同样抛主错误。 */
  const startFallback = async (body, startedAt, primaryError) => {
    const options = budgetedOptions(startedAt);
    const client = options && await resolveFallback();
    if (!client) throw primaryError;
    try {
      return { result: await client.chat.completions.create(buildFallbackBody(body), options), options };
    } catch (fallbackError) {
      log(`[ai-fallback] fallback failed (${describe(fallbackError)})`);
      throw primaryError;
    }
  };

  const wrapStream = (stream, body, options, startedAt, fallbackTried) => {
    let current = stream;
    let served;
    let deadlineSignal;
    return {
      get controller() { return current.controller; },
      get servedBy() { return served; },
      // 流实际运行所处的 deadline（主调用重试或回退都可能不是调用方最初的 signal）
      get deadlineSignal() { return deadlineSignal || options?.signal; },
      async *[Symbol.asyncIterator]() {
        let delivered = false;
        const held = [];
        let error;
        try {
          for await (const chunk of stream) {
            if (delivered) { yield chunk; continue; }
            held.push(chunk);
            if (isDeliverable(chunk)) {
              delivered = true;
              breaker.record(true);
              yield* held.splice(0);
            }
          }
        } catch (caught) {
          error = caught;
        }
        // SDK 会吞掉 deadline 的 AbortError：流“正常结束”但 signal 已中止，同样是失败
        if (!error && !options?.signal?.aborted) {
          if (!delivered) breaker.record(true);
          yield* held;
          return;
        }
        const kind = classifyFailure(error, options?.signal);
        if (kind === 'abort' || kind === 'other') breaker.release();
        else breaker.record(kind === 'provider');
        if (delivered || fallbackTried || kind === 'abort' || kind === 'other') {
          if (error) throw error;
          return; // 调用方（streamHelpers）会按 deadline 抛出
        }
        const primaryError = error || options.signal.reason;
        log(`[ai-fallback] primary stream failed before any content (${describe(primaryError)}), using deepseek`);
        const fallback = await startFallback(body, startedAt, primaryError);
        current = fallback.result;
        served = servedBy;
        deadlineSignal = fallback.options.signal;
        let fallbackDelivered = false;
        const fallbackHeld = [];
        try {
          for await (const chunk of fallback.result) {
            if (fallbackDelivered) { yield chunk; continue; }
            fallbackHeld.push(chunk);
            if (isDeliverable(chunk)) { fallbackDelivered = true; yield* fallbackHeld.splice(0); }
          }
          yield* fallbackHeld;
        } catch (fallbackError) {
          log(`[ai-fallback] fallback stream failed (${describe(fallbackError)})`);
          throw fallbackDelivered ? fallbackError : primaryError;
        }
      },
    };
  };

  const create = async (body, requestOptions) => {
    if (hasImageInput(body) && !supportsImages) return primary.chat.completions.create(body, requestOptions);
    const startedAt = now();
    let options = requestOptions;
    let fallbackTried = false;
    if (breaker.acquire() === 'skip') {
      const client = await resolveFallback();
      if (client) {
        // 熔断打开时直连 DeepSeek；它失败而主调用可能已恢复时，在剩余预算内再试一次主调用。
        try {
          return tag(await client.chat.completions.create(buildFallbackBody(body), options), servedBy);
        } catch (fallbackError) {
          const kind = classifyFailure(fallbackError, options?.signal);
          const retryOptions = kind === 'abort' || kind === 'other' ? null : budgetedOptions(startedAt);
          if (!retryOptions) throw fallbackError;
          log(`[ai-fallback] breaker-open fallback failed (${describe(fallbackError)}), trying primary`);
          options = retryOptions;
          fallbackTried = true;
        }
      }
    }
    try {
      const result = await primary.chat.completions.create(body, options);
      if (body?.stream === true) return wrapStream(result, body, options, startedAt, fallbackTried);
      breaker.record(true);
      return result;
    } catch (error) {
      const kind = classifyFailure(error, options?.signal);
      if (kind === 'abort' || kind === 'other') breaker.release();
      else breaker.record(kind === 'provider');
      if (fallbackTried || kind === 'abort' || kind === 'other') throw error;
      log(`[ai-fallback] primary failed (${describe(error)}), using deepseek`);
      const fallback = await startFallback(body, startedAt, error);
      return tag(fallback.result, servedBy, fallback.options.signal);
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
  OVERALL_BUDGET_MS,
  MIN_FALLBACK_MS,
};
