'use client';

import type { ComponentType } from 'react';
import {
  Box,
  Download,
  Factory,
  Flame,
  Layers,
  Lightbulb,
  Package,
  ShoppingCart,
  Sofa,
  Utensils,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TemplateItem } from '@/services/procurementTemplate.service';

type IconComponent = ComponentType<{ className?: string }>;

export const categoryIcons: Record<string, IconComponent> = {
  餐厅设备: Utensils,
  餐具用品: ShoppingCart,
  装修材料: Box,
  灯具照明: Lightbulb,
  灯光照明: Lightbulb,
  家具软装: Sofa,
  家具家居: Sofa,
  后厨设备: Wrench,
  厨房设备: Wrench,
  传送设备: Factory,
  火锅器材: Flame,
  装饰配件: Layers,
  食材物料: Package,
  其他配件: Package,
};

export const priorityConfig = {
  强烈建议: {
    badge: 'bg-red-100 text-red-700 border-red-200',
    row: 'bg-red-50/40 dark:bg-red-950/20',
    dot: 'bg-red-500',
    label: '必备',
  },
  建议: {
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    row: 'bg-amber-50/30 dark:bg-amber-950/10',
    dot: 'bg-amber-500',
    label: '推荐',
  },
  可选: {
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    row: '',
    dot: 'bg-blue-400',
    label: '参考',
  },
} as const;

export function PriorityBadge({ priority }: { priority: string }) {
  const config = priorityConfig[priority as keyof typeof priorityConfig] || priorityConfig.可选;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${config.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

export function CategoryCard({ category, items }: { category: string; items: TemplateItem[] }) {
  const Icon = categoryIcons[category] || Package;
  const mustHave = items.filter((item) => item.priority === '强烈建议');
  const recommended = items.filter((item) => item.priority === '建议');

  return (
    <Card className="flex flex-col border-2">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-primary" />
            {category}
          </span>
          <Badge variant="secondary" className="text-xs">
            {items.length}种
          </Badge>
        </CardTitle>
        <CardDescription className="flex gap-3 text-xs">
          {mustHave.length > 0 ? <span className="font-medium text-red-600">必备 {mustHave.length} 种</span> : null}
          {recommended.length > 0 ? <span className="text-amber-600">推荐 {recommended.length} 种</span> : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {items.map((item) => {
            const config = priorityConfig[item.priority as keyof typeof priorityConfig] || priorityConfig.可选;

            return (
              <div key={item.name} className={`flex items-start justify-between gap-2 rounded-md p-2 text-sm ${config.row}`}>
                <div className="flex min-w-0 items-start gap-1.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${config.dot}`} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.name}</div>
                    {item.supplement ? (
                      <div className="truncate text-xs text-muted-foreground">{item.supplement}</div>
                    ) : null}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  <div className="text-muted-foreground">
                    {item.avgQtyPerStore != null ? `均${item.avgQtyPerStore}${item.unit !== '—' ? item.unit : ''}` : '参考'}
                  </div>
                  <div className="text-muted-foreground/70">{item.storeCount}家采购</div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function downloadMustHaveCSV(items: TemplateItem[], templateStore: string) {
  const bom = '\uFEFF';
  const headers = ['物品名称', '补充说明', '品类', '出现门店数', '建议采购量', '单位', '参考厂家'];
  const rows = items
    .filter((item) => item.priority === '强烈建议')
    .map((item) => [
      item.name,
      item.supplement || '',
      item.category,
      item.storeCount,
      item.avgQtyPerStore ?? '',
      item.unit !== '—' ? item.unit : '',
      item.manufacturers.join('、'),
    ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `开业必备采购清单（${templateStore}模板）.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export const sharedIcons = {
  Download,
  Package,
};
