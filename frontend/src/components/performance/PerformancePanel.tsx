/**
 * 性能监控面板组件
 */
'use client';

import { useEffect, useState } from 'react';
import { getPerformanceMetrics, type PerformanceMetrics } from '@/lib/performance-monitor';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Clock, Zap, Gauge } from 'lucide-react';

interface PerformancePanelProps {
  className?: string;
}

interface MetricItemProps {
  label: string;
  value?: number;
  unit?: string;
  threshold?: { good: number; poor: number };
  icon?: React.ReactNode;
}

function MetricItem({ label, value, unit = 'ms', threshold, icon }: MetricItemProps) {
  const getStatus = (val: number) => {
    if (!threshold) return 'neutral';
    if (val <= threshold.good) return 'good';
    if (val <= threshold.poor) return 'fair';
    return 'poor';
  };

  const status = value !== undefined ? getStatus(value) : 'neutral';

  const statusColors = {
    good: 'bg-green-500',
    fair: 'bg-yellow-500',
    poor: 'bg-red-500',
    neutral: 'bg-gray-400',
  };

  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
      <div className="flex items-center gap-3">
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-semibold">
          {value !== undefined ? (unit === 'ms' ? `${value.toFixed(0)}ms` : value.toFixed(3)) : '-'}
        </span>
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      </div>
    </div>
  );
}

export default function PerformancePanel({ className }: PerformancePanelProps) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>(() => getPerformanceMetrics());

  useEffect(() => {
    // 定期更新
    const interval = setInterval(() => {
      setMetrics(getPerformanceMetrics());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="w-4 h-4" />
          性能监控
          <Badge variant="outline" className="ml-auto text-xs">
            Real-time
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricItem
          label="LCP (最大内容渲染)"
          value={metrics.lcp}
          threshold={{ good: 2500, poor: 4000 }}
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricItem
          label="INP (交互延迟)"
          value={metrics.inp}
          threshold={{ good: 200, poor: 500 }}
          icon={<Zap className="w-4 h-4" />}
        />
        <MetricItem
          label="CLS (布局偏移)"
          value={metrics.cls}
          unit=""
          threshold={{ good: 0.1, poor: 0.25 }}
          icon={<Gauge className="w-4 h-4" />}
        />
        <MetricItem
          label="FCP (首次内容渲染)"
          value={metrics.fcp}
          threshold={{ good: 1800, poor: 3000 }}
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricItem
          label="TTFB (首字节时间)"
          value={metrics.ttfb}
          threshold={{ good: 800, poor: 1800 }}
          icon={<Clock className="w-4 h-4" />}
        />
        {metrics.pageLoadTime && (
          <MetricItem
            label="页面加载时间"
            value={metrics.pageLoadTime}
            threshold={{ good: 3000, poor: 5000 }}
            icon={<Clock className="w-4 h-4" />}
          />
        )}
      </CardContent>
    </Card>
  );
}
