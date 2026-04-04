import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NetworkStatus } from './network-status';

describe('network-status', () => {
  beforeEach(() => {
    // Mock navigator.onLine
    Object.defineProperty(window.navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('在线状态下应该返回 null', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true });
    const { container } = render(<NetworkStatus />);
    expect(container.firstChild).toBeNull();
  });

  it('离线状态下应该显示离线警告', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false });
    render(<NetworkStatus />);
    expect(screen.getByText('网络连接已断开，部分功能可能不可用')).toBeInTheDocument();
  });
});
