/**
 * Input: 日期格式化工具
 * Output: 日期/日期时间格式转换测试（北京时间）
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatTime } from './date-format';

describe('date-format', () => {
  it('formatDate: 以北京日历日展示（UTC ISO 输入）', () => {
    expect(formatDate('2026-03-02T07:04:05.000Z')).toBe('2026-03-02');
  });

  it('formatDateTime: 以北京时间展示 yyyy-MM-dd HH:mm:ss', () => {
    expect(formatDateTime('2026-03-02T07:04:05.000Z')).toBe('2026-03-02 15:04:05');
  });

  it('formatTime: 仅时间部分（北京时间）', () => {
    expect(formatTime('2026-03-02T07:04:05.000Z')).toBe('15:04:05');
  });

  it('跨日 UTC 时北京日历日可能为次日', () => {
    expect(formatDate('2026-03-02T16:00:00.000Z')).toBe('2026-03-03');
  });

  it('无效输入返回 fallback', () => {
    expect(formatDate('not-a-date')).toBe('-');
    expect(formatDateTime(null, 'N/A')).toBe('N/A');
  });
});
