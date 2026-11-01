/**
 * Input: 采购合同详情（含商品明细）、开关与关闭回调
 * Output: 采购列表页的合同详情弹窗（金额汇总、商品明细、备注）
 * Pos: 采购列表页（ContractsPageContent）拆出的只读展示组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { format } from "date-fns";
import { Loader2, Package, ShoppingCart } from "lucide-react";
import { AmountText } from "@/components/ui/amount-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusPill, type PurchaseContractDetail } from "./purchaseListHelpers";

interface PurchaseDetailDialogProps {
  open: boolean;
  loading: boolean;
  detail: PurchaseContractDetail | null;
  onClose: () => void;
}

export function PurchaseDetailDialog({
  open,
  loading,
  detail,
  onClose,
}: PurchaseDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {loading ? (
          <DialogHeader>
            <DialogTitle>加载中...</DialogTitle>
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </DialogHeader>
        ) : detail ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5" />
                采购合同详情：{detail.contractNo}
              </DialogTitle>
              <DialogDescription>
                供应商：{detail.supplier?.name || "未知"}
                {" | "}
                {detail.signedAt
                  ? `签订日期：${format(new Date(detail.signedAt), "yyyy-MM-dd")}`
                  : "未设置签订日期"}
                {detail.storeName && <> | 发货店铺：{detail.storeName}</>}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* 金额汇总 */}
              <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted p-4 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">合同金额</p>
                  <p className="text-xl font-bold">
                    ¥{detail.totalAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">已付款</p>
                  <AmountText tone="success" size="lg">
                    ¥{detail.paidAmount.toLocaleString()}
                  </AmountText>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">状态</p>
                  <div className="mt-1">
                    <StatusPill status={detail.status} />
                  </div>
                </div>
              </div>

              {/* 商品明细 */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 font-medium">
                  <Package className="h-4 w-4" />
                  商品明细
                </h4>
                {detail.items && detail.items.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>商品名称</TableHead>
                        <TableHead>规格</TableHead>
                        <TableHead>数量</TableHead>
                        <TableHead className="text-right">单价 (¥)</TableHead>
                        <TableHead className="text-right">小计 (¥)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product?.customsName || "未知商品"}
                          </TableCell>
                          <TableCell>
                            {item.specification ||
                              item.product?.specification ||
                              "-"}
                          </TableCell>
                          <TableCell>
                            {item.quantity} {item.unit || item.product?.unit}
                          </TableCell>
                          <TableCell className="text-right">
                            ¥{item.unitPrice.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ¥{item.totalPrice.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="py-4 text-center text-muted-foreground">
                    暂无商品明细
                  </p>
                )}
              </div>

              {/* 备注 */}
              {detail.note && (
                <div className="rounded bg-muted p-3">
                  <p className="text-sm text-muted-foreground">
                    备注：{detail.note}
                  </p>
                </div>
              )}
            </div>
          </>
        ) : (
          <DialogHeader>
            <DialogTitle>合同详情</DialogTitle>
            <DialogDescription>暂无数据</DialogDescription>
          </DialogHeader>
        )}
      </DialogContent>
    </Dialog>
  );
}
