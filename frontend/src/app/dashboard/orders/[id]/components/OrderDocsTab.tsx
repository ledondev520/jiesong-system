/**
 * Input: 出口订单装箱明细、附件列表、HS 处理入口回调
 * Output: 单证页签：报关 HS 编码汇总（缺 HS 警示 + 处理入口）与源文件附件
 * Pos: /dashboard/orders/[id] 单证；生成动作在页头「单证 ▾」菜单
 */
"use client";

import { useMemo } from "react";
import { AlertTriangle, FileSpreadsheet } from "lucide-react";
import type { SalesContract } from "@/types";
import type { ContractFile } from "@/services/contractFile.service";
import { BusinessWrite } from "@/lib/hooks/useBusinessReadOnly";
import ContractFiles from "@/components/contract/ContractFiles";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function OrderDocsTab({
  contract,
  files,
  onFilesChange,
  onResolveHs,
}: {
  contract: SalesContract;
  files: ContractFile[];
  onFilesChange: (files: ContractFile[]) => void;
  onResolveHs: () => void;
}) {
  const packingItems = contract.packingItems;

  // 按 HS + 商品名分组：相同 HS 的不同商品不合并
  const hsCodeList = useMemo(() => {
    const map = new Map<
      string,
      {
        hsCode: string;
        productName: string;
        quantity: number;
        totalPrice: number;
      }
    >();
    for (const item of packingItems ?? []) {
      const hs = item.product?.hsCode;
      if (!hs) continue;
      const productName = item.product?.customsName || "未知商品";
      const groupKey = `${hs}\u0000${productName}`;
      const existing = map.get(groupKey);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.totalPrice || 0;
      } else {
        map.set(groupKey, {
          hsCode: hs,
          productName,
          quantity: item.quantity,
          totalPrice: item.totalPrice || 0,
        });
      }
    }
    return [...map.values()];
  }, [packingItems]);

  const missingHsItems = (packingItems ?? [])
    .filter((item) => !item.product?.hsCode)
    .map((item) => item.product?.customsName || "未知商品");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            报关 HS 编码
          </CardTitle>
          <CardDescription>根据装箱明细自动汇总的海关申报信息</CardDescription>
        </CardHeader>
        <CardContent>
          {missingHsItems.length > 0 && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium">
                    仍有 {missingHsItems.length} 项装箱商品未匹配 HS 编码
                  </p>
                  <p>未匹配：{missingHsItems.join("、")}</p>
                  <p className="text-xs">
                    为避免申报遗漏，请先通过历史记录、AI
                    建议或人工确认补齐；申报三表会阻止不完整单据生成。
                  </p>
                </div>
                <BusinessWrite>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={onResolveHs}
                  >
                    处理未匹配 HS 编码
                  </Button>
                </BusinessWrite>
              </AlertDescription>
            </Alert>
          )}
          {hsCodeList.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">
              暂无报关信息，请先在装箱明细中添加带有 HS 编码的商品
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HS 编码</TableHead>
                    <TableHead>商品名称</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead className="text-right">总价 ($)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsCodeList.map((item) => (
                    <TableRow key={`${item.hsCode}-${item.productName}`}>
                      <TableCell className="font-mono text-sm font-medium">
                        {item.hsCode}
                      </TableCell>
                      <TableCell>{item.productName}</TableCell>
                      <TableCell className="text-right">
                        {item.quantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        ${item.totalPrice.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContractFiles
        contractId={contract.id}
        contractType="SALES"
        files={files}
        onChange={onFilesChange}
        title="源文件附件"
        description="支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB，归档 WPS 出货合同、装箱单、报关单、退税联、提单等原始文件"
        emptyHint="暂无附件，点击「上传附件」归档出货源文件"
      />
    </div>
  );
}
