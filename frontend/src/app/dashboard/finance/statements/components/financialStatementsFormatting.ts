/**
 * Input: 财务报表数值
 * Output: 页面展示所需的金额、百分比和盈亏样式
 * Pos: 财务报表页格式化工具
 */

export function fmtAmount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `¥${val.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtWan(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  const wan = val / 10000;
  return `¥${wan.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}万`;
}

export function fmtPercent(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

export function profitColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'text-muted-foreground';
  return val >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive';
}
