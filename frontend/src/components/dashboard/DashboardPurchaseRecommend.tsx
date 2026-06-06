/**
 * Input: procurementTemplateService
 * Output: Dashboard 采购建议摘要卡片
 * Pos: Dashboard 经营中台模块
 */

'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Package, AlertCircle, Star, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { procurementTemplateService, type TemplateItem } from '@/services/procurementTemplate.service';
import { useRouter } from 'next/navigation';

interface PriorityStats {
  label: string;
  count: number;
  color: string;
  bg: string;
}

export function DashboardPurchaseRecommend() {
  const router = useRouter();
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await procurementTemplateService.getUniversalTemplate();
        setItems(response?.data?.items || []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const stats: PriorityStats[] = [
    {
      label: '强烈建议',
      count: items.filter((i) => i.priority === '强烈建议').length,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
    },
    {
      label: '建议',
      count: items.filter((i) => i.priority === '建议').length,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
    },
    {
      label: '可选',
      count: items.filter((i) => i.priority === '可选').length,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
    },
  ];

  const topItems = items
    .filter((i) => i.priority === '强烈建议')
    .slice(0, 5);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/30 bg-card/60 p-5 backdrop-blur-sm">
        <div className="h-32 animate-pulse rounded-xl bg-muted/50" />
      </div>
    );
  }

  if (items.length === 0) {
    return null;
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45, duration: 0.4 }}
      className="rounded-2xl border border-border/30 bg-card/60 p-5 backdrop-blur-sm"
    >
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight text-foreground">采购建议</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => router.push('/dashboard/store-recommend')}
        >
          查看全部
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 优先级统计 */}
      <div className="mb-4 grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex flex-col items-center rounded-xl border border-border/20 bg-card/40 p-2.5"
          >
            <span className={`text-lg font-bold ${s.color}`}>{s.count}</span>
            <span className="text-xs text-muted-foreground/70">{s.label}</span>
          </div>
        ))}
      </div>

      {/* 强烈建议列表 */}
      {topItems.length > 0 && (
        <div className="space-y-1.5">
          {topItems.map((item, i) => (
            <motion.div
              key={item.name + item.supplement}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.05, duration: 0.25 }}
              className="flex items-center justify-between rounded-lg border border-border/10 bg-card/30 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                <span className="truncate text-sm text-foreground">{item.name}</span>
                <span className="truncate text-xs text-muted-foreground/60">{item.supplement}</span>
              </div>
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {item.storeCount} 家门店
              </Badge>
            </motion.div>
          ))}
        </div>
      )}
    </motion.section>
  );
}
