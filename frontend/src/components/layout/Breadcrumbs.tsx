/**
 * Input: 当前 pathname、路由配置
 * Output: 面包屑导航组件
 * Pos: 全局面包屑，显示用户当前位置
 */

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { cn } from '@/lib/utils';

const routeLabelMap: Record<string, string> = {
  dashboard: '工作台',
  contracts: '采购合同',
  purchase: '采购',
  sales: '出口合同',
  suppliers: '供应商',
  products: '商品档案',
  inventory: '库存',
  'inventory-status': '库存状态',
  finance: '财务',
  payments: '收付管理',
  statements: '财务报表',
  'bank-flow': '银行流水',
  'hs-codes': 'HS编码',
  'tax-refunds': '出口退税',
  'customs-declarations': '报关单',
  settings: '设置',
  users: '用户管理',
  import: '导入记录',
  about: '关于',
  dev: '开发',
  ai: 'AI助手',
  create: '创建',
  edit: '编辑',
  template: '模板',
  templates: '模板管理',
};

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  if (!pathname || pathname === '/dashboard') return null;

  const segments = pathname
    .replace(/^\/dashboard\/?/, '')
    .split('/')
    .filter(Boolean);

  /**
   * 判断 segment 是否为 cuid / uuid 等数据库 ID（长度 >20 的字母数字混合）
   * 是则替换为"详情"，避免面包屑显示无意义的随机字符串
   */
  const isDbId = (s: string) => /^[a-z0-9]{20,}$/i.test(s);

  const crumbs = segments.map((segment, index) => {
    const href = '/dashboard/' + segments.slice(0, index + 1).join('/');
    let label = routeLabelMap[segment] || segment;
    if (isDbId(segment)) {
      label = '详情';
    }
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav
      aria-label="面包屑"
      className={cn(
        'flex items-center gap-1.5 text-sm text-muted-foreground',
        className,
      )}
    >
      <Link
        href="/dashboard"
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
      >
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">工作台</span>
      </Link>

      {crumbs.map((crumb) => (
        <div key={crumb.href} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.href}
              className="rounded-md px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
            >
              {crumb.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
