/**
 * Input: 日期格式化工具
 * Output: 日期/日期时间格式转换测试
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './date-format';

describe('date-format', () => {
  it('formatDate: 合法日期输出 yyyy-MM-dd', () => {
    const value = new Date(2026, 2, 2, 15, 4, 5);
    expect(formatDate(value)).toBe('2026-03-02');
  });

  it('formatDateTime: 合法日期输出 yyyy-MM-dd HH:mm:ss', () => {
    const value = new Date(2026, 2, 2, 15, 4, 5);
    expect(formatDateTime(value)).toBe('2026-03-02 15:04:05');
  });

  it('无效输入返回 fallback', () => {
    expect(formatDate('not-a-date')).toBe('-');
    expect(formatDateTime(null, 'N/A')).toBe('N/A');
  });
});
