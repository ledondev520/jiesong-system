/**
 * Input: 选中动作回调
 * Output: 「单证 ▾」菜单：生成出口四单、报关单草稿、船司装箱单核对
 * Pos: 订单详情页头；出口单证只有四单一条路径（申报三表与出口工作簿已并入四单）
 */
"use client";

import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OrderDocAction =
  | "exportPacket"
  | "customsDraft"
  | "packingCheck";

// 与后端一致（OD-8）：SALES 仅报关草稿/装箱核对；出口四单仅 ADMIN。
const ROLE_ACTIONS: Record<string, OrderDocAction[]> = {
  SALES: ["customsDraft", "packingCheck"],
};

export function OrderDocsMenu({
  onSelect,
  role,
}: {
  onSelect: (action: OrderDocAction) => void;
  role?: string;
}) {
  // 角色未知（登录态还在恢复）时一律不显示，避免短暂暴露本不该有的入口
  const allowed = (action: OrderDocAction) =>
    !!role && (!ROLE_ACTIONS[role] || ROLE_ACTIONS[role].includes(action));
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <FileText className="mr-2 h-4 w-4" />
          单证
          <ChevronDown className="ml-1 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {allowed("exportPacket") && (
          <DropdownMenuItem onSelect={() => onSelect("exportPacket")}>
            生成出口四单（合同 / 发票 / 箱单 / 报关预录信息）
          </DropdownMenuItem>
        )}
        {allowed("customsDraft") && (
          <DropdownMenuItem onSelect={() => onSelect("customsDraft")}>
            报关单草稿
          </DropdownMenuItem>
        )}
        {allowed("packingCheck") && (
          <DropdownMenuItem onSelect={() => onSelect("packingCheck")}>
            船司装箱单核对
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
