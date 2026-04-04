/**
 * 职责：多标签页数据同步工具
 * 思路：使用 BroadcastChannel 或 localStorage 实现跨标签页通信
 * 用于：合同创建/更新后通知其他标签页刷新列表
 */

import { useEffect } from 'react';

const CHANNEL_NAME = 'jiesong-data-sync';

export type SyncEventType = 'sales-contract-created' | 'sales-contract-updated' | 'sales-contract-deleted' | 'purchase-contract-created' | 'purchase-contract-updated' | 'payment-updated' | 'inventory-updated' | 'force-refresh';

export interface SyncEvent {
  type: SyncEventType;
  timestamp: number;
  payload?: Record<string, unknown>;
}

class TabSyncManager {
  private channel: BroadcastChannel | null = null;
  private listeners: Map<SyncEventType, Set<(event: SyncEvent) => void>> = new Map();
  private fallbackKey = '__tab_sync_fallback__';

  constructor() {
    if (typeof window === 'undefined') return;

    // 优先使用 BroadcastChannel
    if ('BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event) => {
        this.handleMessage(event.data as SyncEvent);
      };
    } else {
      // 降级方案：使用 localStorage
      const w = window as Window;
      const storageHandler = (e: StorageEvent) => {
        if (e.key === this.fallbackKey && e.newValue) {
          try {
            const event = JSON.parse(e.newValue) as SyncEvent;
            this.handleMessage(event);
          } catch {
            // 忽略解析错误
          }
        }
      };
      w.addEventListener('storage', storageHandler);
    }
  }

  private handleMessage(event: SyncEvent) {
    // 忽略自己发出的消息（通过时间戳简单判断，5秒内算新消息）
    if (Date.now() - event.timestamp > 5000) return;

    const listeners = this.listeners.get(event.type);
    if (listeners) {
      listeners.forEach((callback) => callback(event));
    }

    // 通用监听器
    const allListeners = this.listeners.get('*' as SyncEventType);
    if (allListeners) {
      allListeners.forEach((callback) => callback(event));
    }
  }

  /**
   * 发送同步事件
   */
  send(type: SyncEventType, payload?: Record<string, unknown>) {
    const event: SyncEvent = {
      type,
      timestamp: Date.now(),
      payload,
    };

    if (this.channel) {
      this.channel.postMessage(event);
    } else if (typeof window !== 'undefined') {
      // 降级方案
      localStorage.setItem(this.fallbackKey, JSON.stringify(event));
      // 立即清理，避免重复触发
      setTimeout(() => localStorage.removeItem(this.fallbackKey), 100);
    }
  }

  /**
   * 订阅同步事件
   */
  subscribe(type: SyncEventType | '*', callback: (event: SyncEvent) => void) {
    const key = type as SyncEventType;
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key)!.add(callback);

    // 返回取消订阅函数
    return () => {
      this.listeners.get(key)?.delete(callback);
    };
  }

  /**
   * 销毁管理器
   */
  destroy() {
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }
}

// 单例实例
let instance: TabSyncManager | null = null;

export function getTabSyncManager(): TabSyncManager {
  if (!instance) {
    instance = new TabSyncManager();
  }
  return instance;
}

/**
 * React Hook: 使用标签页同步
 */
export function useTabSync(type: SyncEventType | '*', callback: (event: SyncEvent) => void) {
  useEffect(() => {
    const manager = getTabSyncManager();
    return manager.subscribe(type, callback);
  }, [type, callback]);
}
