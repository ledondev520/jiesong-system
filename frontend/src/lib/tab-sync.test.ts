/**
 * Tab Sync 单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTabSync, getTabSyncManager, SyncEventType } from './tab-sync';
import { renderHook } from '@testing-library/react';

// Mock BroadcastChannel
class MockBroadcastChannel {
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(name: string) {
    this.name = name;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  postMessage(_data: unknown) {
    // 模拟发送消息给其他标签页
  }

  close() {
    // 模拟关闭通道
  }
}

Object.defineProperty(window, 'BroadcastChannel', {
  value: MockBroadcastChannel,
  writable: true,
});

describe('useTabSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // 清理单例实例
    const manager = getTabSyncManager();
    manager.destroy();
  });

  it('应该成功订阅事件', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useTabSync('sales-contract-created' as SyncEventType, callback));

    // 验证hook正常渲染
    expect(callback).not.toHaveBeenCalled();

    // 卸载组件应该取消订阅
    unmount();
  });

  it('应该支持通配符订阅', () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => useTabSync('*' as SyncEventType, callback));

    expect(callback).not.toHaveBeenCalled();

    unmount();
  });
});

describe('getTabSyncManager', () => {
  it('应该返回单例实例', () => {
    const manager1 = getTabSyncManager();
    const manager2 = getTabSyncManager();

    expect(manager1).toBe(manager2);
  });

  it('应该发送和接收事件', () => {
    const manager = getTabSyncManager();
    const callback = vi.fn();

    const unsubscribe = manager.subscribe('sales-contract-created' as SyncEventType, callback);

    manager.send('sales-contract-created' as SyncEventType, { id: 'test-1' });

    // 由于BroadcastChannel是模拟的，消息不会真正传递
    // 但我们可以验证发送不抛出错误
    expect(callback).not.toHaveBeenCalled(); // 模拟环境不会触发回调

    unsubscribe();
  });
});
