/**
 * Input: 任意被 reject 的值（axios 拦截器会 reject 响应体对象或中文 Error）
 * Output: 给用户看的失败原因字符串
 * Pos: ErrorState 的原因提取；格式「<失败的事>：<服务端原因>」见 UX 规范 §8.9
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const FALLBACK_REASON = "请稍后重试";

const pickMessage = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // 响应体 {message}/{error}，或未被拦截器改写的 axios 错误 response.data
    for (const candidate of [
      record.message,
      record.error,
      (record.response as Record<string, unknown> | undefined)?.data,
    ]) {
      if (candidate === value) continue;
      const found = pickMessage(candidate);
      if (found) return found;
    }
  }
  return null;
};

/** 职责：取出服务端原因；取不到时用兜底文案，不暴露堆栈或英文开发信息 */
export const getErrorReason = (
  error: unknown,
  fallback = FALLBACK_REASON,
): string => pickMessage(error) ?? fallback;

/** 职责：拼出「<失败的事>：<原因>」 */
export const describeFailure = (what: string, error: unknown): string =>
  `${what}：${getErrorReason(error)}`;
