/**
 * Input: 商品目录、批量选择状态
 * Output: 批量商品选择器弹窗
 * Pos: 采购合同创建入口（CreatePurchasePageContent 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BatchProductDialog({
  showBatchSelector,
  setShowBatchSelector,
  batchSearch,
  setBatchSearch,
  selectedProductIds,
  setSelectedProductIds,
  filteredBatchProducts,
  handleBatchAdd,
}: {
  showBatchSelector: boolean;
  setShowBatchSelector: (open: boolean) => void;
  batchSearch: string;
  setBatchSearch: (value: string) => void;
  selectedProductIds: Set<string>;
  setSelectedProductIds: (ids: Set<string>) => void;
  filteredBatchProducts: Product[];
  handleBatchAdd: () => void;
}) {
  return (
    <>
      <Dialog open={showBatchSelector} onOpenChange={setShowBatchSelector}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              批量添加商品
            </DialogTitle>
            <DialogDescription>
              选择本次购销合同要采购的一个或多个商品。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品名称..."
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                className="h-9 rounded-md pl-9 text-xs"
              />
            </div>
            <div className="max-h-[320px] overflow-y-auto rounded-md border border-border/40">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="w-10 text-center">
                      <input
                        id="batch-select-all"
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-border"
                        checked={
                          filteredBatchProducts.length > 0 &&
                          filteredBatchProducts.every((p) =>
                            selectedProductIds.has(p.id),
                          )
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedProductIds(
                              new Set(filteredBatchProducts.map((p) => p.id)),
                            );
                          } else {
                            setSelectedProductIds(new Set());
                          }
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs">商品名称</TableHead>
                    <TableHead className="text-xs">规格</TableHead>
                    <TableHead className="text-xs">单位</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBatchProducts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="py-6 text-center text-xs text-muted-foreground"
                      >
                        未找到匹配商品
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredBatchProducts.map((product) => (
                      <TableRow
                        key={product.id}
                        className="cursor-pointer"
                        onClick={() => {
                          const next = new Set(selectedProductIds);
                          if (next.has(product.id)) {
                            next.delete(product.id);
                          } else {
                            next.add(product.id);
                          }
                          setSelectedProductIds(next);
                        }}
                      >
                        <TableCell className="text-center">
                          <input
                            id={`batch-product-${product.id}`}
                            type="checkbox"
                            className="h-3.5 w-3.5 rounded border-border"
                            checked={selectedProductIds.has(product.id)}
                            onChange={() => {}}
                          />
                        </TableCell>
                        <TableCell className="text-sm">
                          {product.customsName}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.specification || "-"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product.unit || "-"}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                已选择 {selectedProductIds.size} 项
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  onClick={() => {
                    setSelectedProductIds(new Set());
                    setShowBatchSelector(false);
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  className="h-8 rounded-md text-xs"
                  onClick={handleBatchAdd}
                  disabled={selectedProductIds.size === 0}
                >
                  确认添加
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
