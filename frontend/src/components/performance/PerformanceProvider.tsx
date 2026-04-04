/**
 * 性能监控初始化
 * 在应用启动时调用
 */
'use client';

import { useEffect } from 'react';
import { initPerformanceMonitor } from '@/lib/performance-monitor';

interface PerformanceProviderProps {
  children: React.ReactNode;
  enabled?: boolean;
  debug?: boolean;
}

export default function PerformanceProvider({
  children,
  enabled = true,
  debug = process.env.NODE_ENV === 'development',
}: PerformanceProviderProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    initPerformanceMonitor({
      enabled,
      debug,
      sampleRate: 1.0,
    });
  }, [enabled, debug]);

  return <>{children}</>;
}
