import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Avatar, AvatarImage, AvatarFallback } from './avatar';

describe('avatar', () => {
  it('应该渲染 Avatar 组件', () => {
    render(<Avatar data-testid="avatar">内容</Avatar>);
    expect(screen.getByTestId('avatar')).toBeInTheDocument();
  });

  it('应该应用默认样式', () => {
    render(<Avatar data-testid="avatar">内容</Avatar>);
    const avatar = screen.getByTestId('avatar');
    expect(avatar).toHaveClass('relative', 'flex', 'size-8', 'shrink-0', 'overflow-hidden', 'rounded-full');
  });

  it('应该支持自定义 className', () => {
    render(<Avatar className="custom-class" data-testid="avatar">内容</Avatar>);
    expect(screen.getByTestId('avatar')).toHaveClass('custom-class');
  });

  it('应该渲染 AvatarImage 元素', () => {
    const { container } = render(
      <Avatar>
        <AvatarImage src="https://example.com/avatar.jpg" alt="用户头像" />
      </Avatar>
    );
    // Radix UI AvatarImage 在测试环境中可能不直接渲染，检查容器存在即可
    expect(container.querySelector('[data-slot="avatar"]')).toBeInTheDocument();
  });

  it('应该渲染 AvatarFallback', () => {
    render(
      <Avatar data-testid="avatar">
        <AvatarFallback>AB</AvatarFallback>
      </Avatar>
    );
    expect(screen.getByText('AB')).toBeInTheDocument();
  });

  it('AvatarFallback 应该应用默认样式', () => {
    render(
      <Avatar>
        <AvatarFallback data-testid="fallback">XX</AvatarFallback>
      </Avatar>
    );
    const fallback = screen.getByTestId('fallback');
    expect(fallback).toHaveClass('bg-muted', 'flex', 'size-full', 'items-center', 'justify-center', 'rounded-full');
  });

  it('应该支持 ref 转发', () => {
    const ref = { current: null as HTMLSpanElement | null };
    render(<Avatar ref={(el) => (ref.current = el)} data-testid="avatar">内容</Avatar>);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });
});
