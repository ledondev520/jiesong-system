/**
 * Input: 路由跳转能力（useRouter）
 * Output: 基础档案快捷入口卡片列表
 * Pos: 设置页 > 基础档案 Tab，提供商品/供应商/HSCode/港口/分类的快捷入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Package, Users, SearchCheck, Anchor, Tag, type LucideIcon,
} from 'lucide-react';

interface MasterLink {
  href: string;
  label: string;
  icon: LucideIcon;
  desc: string;
}

const masterDataLinks: MasterLink[] = [
  { href: '/dashboard/products', label: '商品管理', icon: Package, desc: '管理商品主档案与规格' },
  { href: '/dashboard/suppliers', label: '供应商管理', icon: Users, desc: '管理供应商信息与别名' },
  { href: '/dashboard/hs-codes', label: 'HSCode 查询', icon: SearchCheck, desc: '查询海关编码与退税率' },
  { href: '/dashboard/settings/ports', label: '港口管理', icon: Anchor, desc: '维护装卸港口基础数据' },
  { href: '/dashboard/settings/categories', label: '商品分类', icon: Tag, desc: '管理商品分类体系' },
];

/**
 * 职责：渲染基础档案快捷入口卡片列表
 */
export function MasterDataTab() {
  const router = useRouter();

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {masterDataLinks.map((item) => {
        const Icon = item.icon;
        return (
          <Card
            key={item.href}
            className="hover:border-primary/50 transition-colors cursor-pointer"
            onClick={() => router.push(item.href)}
          >
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{item.label}</CardTitle>
                <CardDescription>{item.desc}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
