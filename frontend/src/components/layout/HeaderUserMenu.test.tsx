/**
 * Input: HeaderUserMenu 资料与偏好编辑入口
 * Output: 用户菜单触发器与个人设置弹窗回归测试
 * Pos: 前端布局子组件测试
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  HEADER_USER_MENU_PREFERENCES_KEY,
  HeaderUserMenu,
} from './HeaderUserMenu';

describe('HeaderUserMenu', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('触发器仅保留左侧头像，不再渲染重复小人图标', () => {
    render(
      <HeaderUserMenu
        displayName="管理员"
        username="admin"
        initials="管理"
        onSaveProfile={vi.fn()}
        onLogout={vi.fn()}
      />,
    );

    const trigger = screen.getByRole('button', { name: '用户菜单' });

    expect(trigger.querySelector('svg')).toBeNull();
  });

  it('点击个人设置后打开弹窗并保存资料与个人偏好', async () => {
    const onSaveProfile = vi.fn();
    const user = userEvent.setup();

    render(
      <HeaderUserMenu
        displayName="管理员"
        username="admin"
        initials="管理"
        onSaveProfile={onSaveProfile}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await user.click(screen.getByRole('menuitem', { name: '个人设置' }));

    expect(await screen.findByRole('dialog', { name: '个人设置' })).toBeInTheDocument();

    expect(screen.queryByLabelText('头像链接')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '移除头像' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上传或替换头像' })).toBeInTheDocument();

    const nameInput = screen.getByLabelText('显示名称');
    const notificationsSwitch = screen.getByRole('switch', { name: '桌面通知' });
    const signatureInput = screen.getByLabelText('个人偏好备注');

    await user.clear(nameInput);
    await user.type(nameInput, '运营主管');
    await user.click(notificationsSwitch);
    await user.type(signatureInput, '希望默认看到更紧凑的信息布局');
    await user.click(screen.getByRole('button', { name: '保存个人设置' }));

    expect(onSaveProfile).toHaveBeenCalledWith({
      avatar: undefined,
      name: '运营主管',
    });
    expect(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)).toContain('"desktopNotifications":true');
    expect(localStorage.getItem(HEADER_USER_MENU_PREFERENCES_KEY)).toContain('更紧凑的信息布局');
  });

  it('已有头像时可通过右上角叉号清除当前头像', async () => {
    const onSaveProfile = vi.fn();
    const user = userEvent.setup();

    render(
      <HeaderUserMenu
        displayName="管理员"
        username="admin"
        initials="管理"
        avatar="https://example.com/avatar.png"
        onSaveProfile={onSaveProfile}
        onLogout={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: '用户菜单' }));
    await user.click(screen.getByRole('menuitem', { name: '个人设置' }));

    await user.click(await screen.findByRole('button', { name: '移除当前头像' }));
    await user.click(screen.getByRole('button', { name: '保存个人设置' }));

    expect(onSaveProfile).toHaveBeenCalledWith({
      avatar: undefined,
      name: '管理员',
    });
  });
});
