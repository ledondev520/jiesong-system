/**
 * Input: 角色枚举、权限定义
 * Output: 角色-权限矩阵表格（勾选框展示）
 * Pos: 系统设置 > 用户管理 > 权限矩阵
 *
 * Note: 当前为前端展示矩阵，映射各角色默认权限范围，无独立后端存储。
 */

'use client';

import { Role } from '@/types';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Permission {
  key: string;
  label: string;
}

const PERMISSIONS: Permission[] = [
  { key: 'dashboard', label: '经营看板' },
  { key: 'purchase', label: '采购合同' },
  { key: 'sales', label: '销售合同' },
  { key: 'finance', label: '财务模块' },
  { key: 'logistics', label: '库存物流' },
  { key: 'customs', label: '报关管理' },
  { key: 'settings', label: '系统管理' },
  { key: 'import', label: '数据导入' },
  { key: 'export', label: '数据导出' },
];

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  [Role.ADMIN]: PERMISSIONS.map((p) => p.key),
  [Role.PURCHASE]: ['dashboard', 'purchase', 'logistics', 'customs', 'export'],
  [Role.SALES]: ['dashboard', 'sales', 'logistics', 'customs', 'export'],
  [Role.FINANCE]: ['dashboard', 'finance', 'logistics', 'export'],
  [Role.WAREHOUSE]: ['dashboard', 'logistics', 'customs'],
};

const ROLE_META: Record<Role, { label: string; color: string }> = {
  [Role.ADMIN]: { label: '管理员', color: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800' },
  [Role.PURCHASE]: { label: '采购', color: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  [Role.SALES]: { label: '销售', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800' },
  [Role.FINANCE]: { label: '财务', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800' },
  [Role.WAREHOUSE]: { label: '仓库', color: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:border-slate-800' },
};

export function PermissionMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">权限矩阵</CardTitle>
        <CardDescription>各角色默认功能权限一览（只读）</CardDescription>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[120px] text-muted-foreground">功能模块</TableHead>
              {Object.values(Role).map((role) => (
                <TableHead key={role} className="min-w-[100px] text-center text-muted-foreground">
                  <Badge variant="outline" className={`text-[11px] ${ROLE_META[role].color}`}>
                    {ROLE_META[role].label}
                  </Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((perm) => (
              <TableRow key={perm.key} className="hover:bg-muted/30">
                <TableCell className="text-sm font-medium">{perm.label}</TableCell>
                {Object.values(Role).map((role) => {
                  const allowed = ROLE_PERMISSIONS[role].includes(perm.key);
                  return (
                    <TableCell key={role} className="text-center">
                      <Checkbox checked={allowed} disabled />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
