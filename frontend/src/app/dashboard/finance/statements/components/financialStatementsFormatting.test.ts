/**
 * Financial Statements Formatting 单元测试
 */
import { describe, it, expect } from 'vitest';
import { fmtAmount, fmtWan, fmtPercent, profitColor } from './financialStatementsFormatting';

describe('fmtAmount', () => {
  it('应该格式化金额', () => {
    expect(fmtAmount(1000)).toContain('1,000.00');
    expect(fmtAmount(0)).toContain('0.00');
  });

  it('应该处理null/undefined', () => {
    expect(fmtAmount(null)).toBe('—');
    expect(fmtAmount(undefined)).toBe('—');
  });
});

describe('fmtWan', () => {
  it('应该格式化为万', () => {
    expect(fmtWan(10000000)).toContain('1,000.00');
    expect(fmtWan(10000)).toContain('1.00');
  });

  it('应该处理null/undefined', () => {
    expect(fmtWan(null)).toBe('—');
  });
});

describe('fmtPercent', () => {
  it('应该格式化为百分比', () => {
    expect(fmtPercent(0.1234)).toBe('12.3%');
    expect(fmtPercent(0)).toBe('0.0%');
  });

  it('应该处理null/undefined', () => {
    expect(fmtPercent(null)).toBe('—');
  });
});

describe('profitColor', () => {
  it('应该返回盈利颜色', () => {
    expect(profitColor(100)).toContain('emerald');
  });

  it('应该返回亏损颜色', () => {
    expect(profitColor(-100)).toContain('destructive');
  });

  it('应该处理null/undefined', () => {
    expect(profitColor(null)).toContain('muted');
  });
});
