/**
 * Input: React 子组件树
 * Output: 网络状态监测与提示
 * Pos: 全局网络状态监听，断网时显示提示横幅
 */

'use client';

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {

    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // 3秒后隐藏恢复提示
      setTimeout(() => setShowReconnected(false), 3000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 在线时不显示任何内容（或短暂显示恢复提示）
  if (isOnline) {
    if (!showReconnected) return null;
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-emerald-500 text-white px-4 py-2 text-center text-sm animate-in slide-in-from-top">
        <Wifi className="inline-block h-4 w-4 mr-2" />
        网络已恢复
      </div>
    );
  }

  // 离线时显示警告横幅
  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500 text-white px-4 py-2 text-center text-sm">
      <WifiOff className="inline-block h-4 w-4 mr-2" />
      网络连接已断开，部分功能可能不可用
    </div>
  );
}
