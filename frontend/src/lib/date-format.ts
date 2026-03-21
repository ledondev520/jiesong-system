/**
 * Input: ISO 字符串、时间戳、Date（多来自后端 UTC/ISO）
 * Output: 以「北京时间 Asia/Shanghai」展示的日期/时间字符串
 * Pos: 全系统默认时间展示（与后端审计、Token 分桶策略一致时优先用本模块）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const BEIJING = 'Asia/Shanghai';

const toDate = (value: unknown): Date | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

/**
 * 职责：格式化为北京日历日 yyyy-MM-dd
 * 参数：@param value 可解析为时间的值
 * 返回：@returns 无效时返回 fallback
 */
export const formatDate = (value: unknown, fallback = '-') => {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BEIJING,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

/**
 * 职责：格式化为北京时间 yyyy-MM-dd HH:mm:ss（24 小时制）
 * 参数：@param value 可解析为时间的值
 * 返回：@returns 无效时返回 fallback
 */
export const formatDateTime = (value: unknown, fallback = '-') => {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  // sv-SE 产出与 ISO 接近的 yyyy-MM-dd HH:mm:ss，配合 timeZone 得到北京时间
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BEIJING,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};

/**
 * 职责：仅格式化为北京时间时:分:秒
 */
export const formatTime = (value: unknown, fallback = '-') => {
  const date = toDate(value);
  if (!date) {
    return fallback;
  }

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BEIJING,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
};
