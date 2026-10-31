/**
 * Input: openai SDK 客户端（已设置 timeout / maxRetries:0）、重试与输出上限配置
 * Output: 仅封装 chat.completions.create 的客户端：OpenAI 请求体整形 + 对 429/5xx 的有限重试
 * Pos: OpenAI provider（AI_PROVIDER=openai）适配层；无任何外部依赖，密钥不进入本模块
 * Note: 重试只包住"创建请求/流"这一步；流一旦开始（已返回 stream 对象），中途错误原样抛出，绝不重放，避免重复输出。
 *       所有重试共用调用方传入的同一个 signal（完整响应 deadline），总耗时不会超过该 deadline。
 */
const MAX_BACKOFF_MS = 4000;
const BASE_BACKOFF_MS = 500;

/** 只重试限流与上游 5xx；配额耗尽、鉴权、参数错误、超时/中断都不重试。 */
const isRetryable = (error) => {
  const status = Number(error?.status);
  if (status === 429) return error?.code !== 'insufficient_quota' && error?.error?.code !== 'insufficient_quota';
  return Number.isInteger(status) && status >= 500 && status <= 599;
};

const headerOf = (error, name) => {
  const headers = error?.headers;
  if (!headers) return undefined;
  return typeof headers.get === 'function' ? headers.get(name) : headers[name];
};

/** Retry-After（秒）优先，否则确定性指数退避（无随机抖动）；封顶 4s。 */
const retryDelayMs = (error, attempt) => {
  const seconds = Number(headerOf(error, 'retry-after'));
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
};

/** OpenAI 新模型拒绝 max_tokens 与自定义 temperature，也不认识 DeepSeek/Kimi 的 thinking 扩展。 */
const normalizeRequestBody = (body, { maxOutputTokens = 16000 } = {}) => {
  const {
    max_tokens: legacyMax, temperature, thinking, reasoning_effort: reasoningEffort, ...rest
  } = body || {};
  void temperature; void thinking; void reasoningEffort; // 有意丢弃，避免 400
  const requested = Number(rest.max_completion_tokens ?? legacyMax);
  const shaped = { ...rest };
  if (Number.isFinite(requested) && requested > 0) shaped.max_completion_tokens = Math.min(requested, maxOutputTokens);
  return shaped;
};

const abortableSleep = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

/**
 * @param {object} client openai SDK 实例（只使用 chat.completions.create）
 * @param {{maxRetries?: number, maxOutputTokens?: number, sleep?: Function}} options sleep 仅供测试注入
 */
const wrapOpenAIClient = (client, { maxRetries = 1, maxOutputTokens = 16000, sleep = abortableSleep } = {}) => ({
  chat: {
    completions: {
      create: async (body, options) => {
        const shaped = normalizeRequestBody(body, { maxOutputTokens });
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await client.chat.completions.create(shaped, options);
          } catch (error) {
            if (attempt >= maxRetries || !isRetryable(error) || options?.signal?.aborted) throw error;
            // 等待期间 deadline 到期则抛出中断原因（而不是继续请求）
            await sleep(retryDelayMs(error, attempt), options?.signal);
          }
        }
      },
    },
  },
});

module.exports = { wrapOpenAIClient, normalizeRequestBody, isRetryable, retryDelayMs };
