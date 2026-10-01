import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsNav } from './SettingsNav';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/settings' }));

describe('SettingsNav', () => {
  it('手机菜单可展开到港口与数据导出，选择后收起', () => {
    const { container } = render(<SettingsNav mobile />);
    const menu = container.querySelector('details')!;
    expect(menu).not.toBeNull();
    expect(menu.open).toBe(false);
    fireEvent.click(menu.querySelector('summary')!);
    expect(menu.open).toBe(true);
    expect(screen.getByRole('link', { name: '港口管理' })).toHaveAttribute('href', '/dashboard/settings/ports');
    const exportLink = screen.getByRole('link', { name: '数据导出' });
    expect(exportLink).toHaveAttribute('href', '/dashboard/settings/export');
    fireEvent.click(exportLink);
    expect(menu.open).toBe(false);
  });
});
