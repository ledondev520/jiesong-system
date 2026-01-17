/**
 * Input: cn工具函数
 * Output: 类名合并单元测试
 * Pos: 前端工具函数测试
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn', () => {
  it('合并多个类名', () => {
    expect(cn('a', 'b')).toBe('a b');
  });

  it('忽略空值与false', () => {
    expect(cn('a', false && 'b', undefined, null, '')).toBe('a');
  });

  it('使用tailwind-merge合并冲突类', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
});
