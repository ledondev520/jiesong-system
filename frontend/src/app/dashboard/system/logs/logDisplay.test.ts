/**
 * Input: logDisplay 纯函数
 * Output: 标签与摘要单元测试
 * Pos: 系统日志展示
 */

import { describe, expect, it } from 'vitest';
import { describeLogValues, labelForAction, labelForEntity } from './logDisplay';

describe('logDisplay', () => {
  it('labelForAction / labelForEntity 映射常见代码', () => {
    expect(labelForAction('GENERATE')).toBe('生成');
    expect(labelForEntity('StoreRecommend')).toBe('门店采购建议');
  });

  it('describeLogValues：门店采购建议 GENERATE 解析 newValue', () => {
    const { hints } = describeLogValues({
      entity: 'StoreRecommend',
      action: 'GENERATE',
      newValue: JSON.stringify({
        storeId: null,
        requestedItems: null,
        resultCount: null,
      }),
    });
    expect(hints.length).toBe(1);
    expect(hints[0]).toContain('未指定门店');
    expect(hints[0]).toContain('接口返回推荐');
  });
});
