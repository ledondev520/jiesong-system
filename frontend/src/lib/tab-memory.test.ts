/**
 * Input: tab-memory 模块路径校验
 * Output: isPathInModule / getModuleTabOrRoot 行为回归
 * Pos: 前端路由记忆单测
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isPathInModule, getModuleTabOrRoot } from './tab-memory';

describe('tab-memory', () => {
  describe('isPathInModule', () => {
    it('经营中台仅匹配 /dashboard 与 ops-execution，不含采购等子域', () => {
      expect(isPathInModule('/dashboard', ['/dashboard/ops-execution'], '/dashboard')).toBe(true);
      expect(isPathInModule('/dashboard', ['/dashboard/ops-execution'], '/dashboard/ops-execution')).toBe(true);
      expect(isPathInModule('/dashboard', ['/dashboard/ops-execution'], '/dashboard/contracts')).toBe(false);
    });

    it('采购模块匹配合同与供应商等前缀', () => {
      expect(
        isPathInModule('/dashboard/contracts', ['/dashboard/contracts', '/dashboard/suppliers'], '/dashboard/suppliers'),
      ).toBe(true);
    });
  });

  describe('getModuleTabOrRoot', () => {
    beforeEach(() => {
      vi.stubGlobal('localStorage', {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      });
    });

    it('localStorage 中经营中台记忆为采购路径时回退到 /dashboard', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('/dashboard/contracts');
      expect(getModuleTabOrRoot('/dashboard', ['/dashboard/ops-execution'])).toBe('/dashboard');
    });

    it('合法记忆保留', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('/dashboard/ops-execution');
      expect(getModuleTabOrRoot('/dashboard', ['/dashboard/ops-execution'])).toBe('/dashboard/ops-execution');
    });
  });
});
