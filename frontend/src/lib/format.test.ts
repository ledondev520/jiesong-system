import { describe, expect, it } from 'vitest';
import { formatMoney, formatStat, formatUnitPrice } from './format';

describe('formatMoney', () => {
  it('固定 2 位小数、千分位和币种符号', () => {
    expect(formatMoney(1234.5)).toBe('¥1,234.50');
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney('12')).toBe('¥12.00');
  });

  it('负数符号在币种符号之前', () => {
    expect(formatMoney(-5, 'USD')).toBe('-$5.00');
  });

  it('真实的 0 显示为 0.00，缺失值显示「—」而不是 0', () => {
    expect(formatMoney(0)).toBe('¥0.00');
    for (const bad of [null, undefined, '', 'abc', NaN, Infinity]) {
      expect(formatMoney(bad)).toBe('—');
    }
  });
});

describe('formatUnitPrice', () => {
  it('整数单价不带小数，非整数保留 2 位，不做取整', () => {
    expect(formatUnitPrice(13, 'USD')).toBe('$13');
    expect(formatUnitPrice(1300)).toBe('¥1,300');
    expect(formatUnitPrice(12.5)).toBe('¥12.50');
    expect(formatUnitPrice(null)).toBe('—');
  });
});

describe('formatStat', () => {
  it('加载中或出错时显示「—」，不显示 0', () => {
    expect(formatStat(0, { loading: true })).toBe('—');
    expect(formatStat(0, { error: new Error('x') })).toBe('—');
  });

  it('加载完成后真实 0 显示 0，缺失显示「—」', () => {
    expect(formatStat(0)).toBe('0');
    expect(formatStat(undefined)).toBe('—');
    expect(formatStat(1500, {}, (n) => formatMoney(n))).toBe('¥1,500.00');
  });
});
