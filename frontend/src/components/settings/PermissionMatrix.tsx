/**
 * Input: 角色枚举、权限定义
 * Output: 角色-权限矩阵表格（勾选框展示）
 * Pos: 系统设置 > 用户管理 > 权限矩阵
 *
 * Note: 当前为前端展示矩阵，映射各角色默认权限范围，无独立后端存储。
 */

"use client";

import { Role } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface Permission {
  key: string;
  label: string;
}

const PERMISSIONS: Permission[] = [
  { key: "dashboard", label: "经营看板" },
  { key: "purchase", label: "采购合同" },
  { key: "sales", label: "销售合同" },
  { key: "finance", label: "财务模块" },
  { key: "logistics", label: "库存物流" },
  { key: "customs", label: "报关管理" },
  { key: "settings", label: "系统管理" },
  { key: "import", label: "数据导入" },
  { key: "export", label: "数据导出" },
];

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  [Role.BOSS]: [
    "dashboard",
    "purchase",
    "sales",
    "finance",
    "logistics",
    "customs",
  ],
  [Role.ADMIN]: PERMISSIONS.map((p) => p.key),
  [Role.PURCHASE]: ["dashboard", "purchase", "logistics", "customs", "export"],
  [Role.SALES]: ["dashboard", "sales", "logistics", "customs", "export"],
  [Role.FINANCE]: ["dashboard", "finance", "logistics", "export"],
  [Role.WAREHOUSE]: ["dashboard", "logistics", "customs"],
};

const ROLE_META: Record<Role, { label: string; color: string }> = {
  [Role.BOSS]: {
    label: "老板（只读）",
    color: "bg-status-blue-soft text-status-blue border-status-blue/30",
  },
  [Role.ADMIN]: {
    label: "管理员",
    color: "bg-status-red-soft text-status-red border-status-red/30",
  },
  [Role.PURCHASE]: {
    label: "采购",
    color: "bg-status-blue-soft text-status-blue border-status-blue/30",
  },
  [Role.SALES]: {
    label: "销售",
    color: "bg-status-green-soft text-status-green border-status-green/30",
  },
  [Role.FINANCE]: {
    label: "财务",
    color: "bg-status-amber-soft text-status-amber border-status-amber/30",
  },
  [Role.WAREHOUSE]: {
    label: "仓库",
    color: "bg-muted text-muted-foreground border-border",
  },
};

export function PermissionMatrix() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">权限矩阵</CardTitle>
        <CardDescription>
          各角色默认功能权限一览；老板仅可查看业务，不含写入、生成文件和受限财务证据
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-[120px] text-muted-foreground">
                功能模块
              </TableHead>
              {Object.values(Role).map((role) => (
                <TableHead
                  key={role}
                  className="min-w-[100px] text-center text-muted-foreground"
                >
                  <Badge
                    variant="outline"
                    className={`text-[11px] ${ROLE_META[role].color}`}
                  >
                    {ROLE_META[role].label}
                  </Badge>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {PERMISSIONS.map((perm) => (
              <TableRow key={perm.key} className="hover:bg-muted/30">
                <TableCell className="text-sm font-medium">
                  {perm.label}
                </TableCell>
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
