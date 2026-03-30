import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ModuleTabHeader } from './ModuleTabHeader';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/contracts',
}));

vi.mock('@/lib/tab-memory', () => ({
  saveModuleTab: vi.fn(),
}));

describe('ModuleTabHeader', () => {
  it('移动端默认允许换行，减少横向滑动依赖', () => {
    render(
      <ModuleTabHeader
        moduleName="采购"
        tabs={[
          { href: '/dashboard/contracts', label: '采购合同' },
          { href: '/dashboard/suppliers', label: '供应商管理' },
          { href: '/dashboard/store-recommend', label: '采购建议' },
          { href: '/dashboard/products', label: '商品档案' },
        ]}
      />,
    );

    const nav = screen.getByRole('navigation', { name: '采购' });
    expect(nav.className).toContain('flex-wrap');
    expect(nav.className).toContain('md:flex-nowrap');
  });
});
