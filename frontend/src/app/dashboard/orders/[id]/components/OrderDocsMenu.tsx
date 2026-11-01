/**
 * Input: 选中动作回调
 * Output: 「单证 ▾」菜单：生成出口单证、报关单草稿、船司装箱单核对，另附导出出口工作簿与申报三表
 * Pos: 订单详情页头；替代原先三个含义相近的页头按钮（UX 规范 §4.2、§12）
 */
"use client";

import { ChevronDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type OrderDocAction =
  | "exportPacket"
  | "customsDraft"
  | "packingCheck"
  | "exportWorkbook"
  | "threeForms";

export function OrderDocsMenu({
  onSelect,
}: {
  onSelect: (action: OrderDocAction) => void;
}) {
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
        <DropdownMenuItem onSelect={() => onSelect("exportPacket")}>
          生成出口单证（外销合同 / 商业发票 / 装箱单）
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("customsDraft")}>
          报关单草稿
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("packingCheck")}>
          船司装箱单核对
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          其他
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onSelect("exportWorkbook")}>
          导出出口工作簿
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onSelect("threeForms")}>
          申报三表（报关 / 核销 / 退税）
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
