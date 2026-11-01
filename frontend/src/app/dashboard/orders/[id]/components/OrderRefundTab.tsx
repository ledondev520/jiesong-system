/**
 * Input: 打开退税准备弹窗的回调
 * Output: 退税页签：说明 + 「检查退税材料」入口（准备度与阻塞项由 TaxRefundPreparationDialog 读取后端）
 * Pos: /dashboard/orders/[id] 退税（UX 规范 §4.2）
 */
"use client";

import { FileCheck2 } from "lucide-react";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OrderRefundTab({ onOpen }: { onOpen: () => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">出口退税</CardTitle>
        <CardDescription>
          核对报关单、进项发票与收汇是否齐全，列出阻塞退税的事项。检查不等于正式申报。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <BusinessWrite>
          <Button variant="outline" onClick={onOpen}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            检查退税材料
          </Button>
        </BusinessWrite>
      </CardContent>
    </Card>
  );
}
