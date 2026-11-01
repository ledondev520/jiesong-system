/**
 * Input: 订单 ID、正在编辑的装箱行（新增为 null）、商品与库存（按需加载）、是否已发运
 * Output: 添加/编辑装箱明细弹窗；采购来源行锁定数量/箱数/毛净重/体积/尺寸，仅可改售价和备注
 * Pos: /dashboard/orders/[id] 货柜页签；由父级在打开时按行 key 挂载，初值即该行
 */
"use client";

import { useMemo, useState } from "react";
import { LockKeyhole, PackageCheck, Search } from "lucide-react";
import { toast } from "sonner";
import type { Inventory, PackingItem, Product } from "@/types";
import { salesService } from "@/services/sales.service";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialForm = (item: PackingItem | null, products: Product[]) => {
  if (!item) {
    return {
      productId: "",
      storeId: "",
      quantity: 0,
      boxes: 0,
      unitPrice: 0,
      grossWeight: 0,
      netWeight: 0,
      volume: 0,
      note: "",
      length: 0,
      width: 0,
      height: 0,
    };
  }
  const product = item.product || products.find((p) => p.id === item.productId);
  const sourceLocked = Boolean(item.purchaseItemId);
  return {
    productId: item.productId,
    storeId: item.storeId || "",
    quantity: item.quantity,
    boxes: item.boxes || 0,
    unitPrice: item.unitPrice || 0,
    grossWeight: item.grossWeight || 0,
    netWeight: item.netWeight || 0,
    volume: item.volume || 0,
    note: item.note || "",
    length: item.length || (!sourceLocked ? product?.length : 0) || 0,
    width: item.width || (!sourceLocked ? product?.width : 0) || 0,
    height: item.height || (!sourceLocked ? product?.height : 0) || 0,
  };
};

type ItemForm = ReturnType<typeof initialForm>;
type NumberField = Exclude<keyof ItemForm, "productId" | "storeId" | "note">;

export function PackingItemDialog({
  salesContractId,
  editingItem,
  products,
  inventories,
  referenceDataLoading,
  hasShipped,
  onOpenChange,
  onSaved,
}: {
  salesContractId: string;
  editingItem: PackingItem | null;
  products: Product[];
  inventories: Inventory[];
  referenceDataLoading: boolean;
  hasShipped: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [itemForm, setItemForm] = useState(() =>
    initialForm(editingItem, products),
  );
  const [productSearch, setProductSearch] = useState("");
  const sourceFieldsLocked = Boolean(editingItem?.purchaseItemId);

  const stockedProductIds = useMemo(
    () =>
      new Set(
        inventories
          .filter((inv) => inv.quantity > 0)
          .map((inv) => inv.productId),
      ),
    [inventories],
  );

  // 有库存的商品优先
  const sortedProducts = useMemo(() => {
    const keyword = productSearch.trim().toLowerCase();
    const filtered = keyword
      ? products.filter(
          (p) =>
            p.customsName?.toLowerCase().includes(keyword) ||
            p.specification?.toLowerCase().includes(keyword),
        )
      : products;
    return [...filtered].sort(
      (a, b) =>
        Number(stockedProductIds.has(b.id)) -
        Number(stockedProductIds.has(a.id)),
    );
  }, [products, productSearch, stockedProductIds]);

  const setNumber =
    (field: NumberField, parse: (raw: string) => number) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setItemForm((prev) => ({
        ...prev,
        [field]: parse(event.target.value) || 0,
      }));
  const float = (raw: string) => parseFloat(raw);
  const int = (raw: string) => parseInt(raw);

  /** 选择商品时自动填充体积/重量/尺寸 */
  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setItemForm((prev) =>
      product
        ? {
            ...prev,
            productId,
            grossWeight: product.grossWeight || prev.grossWeight,
            netWeight: product.netWeight || prev.netWeight,
            volume: product.volume || prev.volume,
            length: product.length || 0,
            width: product.width || 0,
            height: product.height || 0,
          }
        : { ...prev, productId },
    );
  };

  const handleSave = async () => {
    if (!itemForm.productId) {
      toast.error("请选择商品");
      return;
    }
    try {
      if (editingItem) {
        await salesService.updatePackingItem(
          salesContractId,
          editingItem.id,
          itemForm,
        );
        toast.success("商品更新成功");
      } else {
        await salesService.addPackingItem(salesContractId, itemForm);
        toast.success("商品添加成功");
      }
      onOpenChange(false);
      onSaved();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    }
  };

  const dimensionInput = (
    field: "length" | "width" | "height",
    label: string,
  ) => (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label} (mm)</label>
      <Input
        aria-label={label}
        type="number"
        value={itemForm[field] || ""}
        placeholder="500"
        disabled={sourceFieldsLocked}
        onChange={setNumber(field, float)}
      />
    </div>
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "编辑商品" : "添加商品到货柜"}
          </DialogTitle>
          <DialogDescription>
            {sourceFieldsLocked
              ? "采购来源资料保持锁定，仅补充出口售价和备注。"
              : "填写商品信息和规格尺寸，尺寸将用于3D可视化。"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {sourceFieldsLocked ? (
            <Alert>
              <LockKeyhole className="h-4 w-4" />
              <AlertDescription>
                数量、箱数、毛净重、体积和尺寸来自采购完工资料。若需改变箱数，请删除后重新导入，系统会重新计算剩余可排数量。
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <label className="text-sm font-medium">商品 *</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索商品名称..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="pl-9"
                disabled={!!editingItem || referenceDataLoading}
              />
            </div>
            <Select
              value={itemForm.productId}
              onValueChange={handleProductChange}
              disabled={!!editingItem || referenceDataLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="选择商品（有库存的优先显示）" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {referenceDataLoading ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    加载商品和库存中...
                  </div>
                ) : sortedProducts.length === 0 ? (
                  <div className="p-2 text-center text-sm text-muted-foreground">
                    {productSearch ? "未找到匹配商品" : "暂无商品"}
                  </div>
                ) : (
                  sortedProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex items-center gap-2">
                        {stockedProductIds.has(p.id) && (
                          <PackageCheck className="h-3 w-3 flex-shrink-0 text-primary" />
                        )}
                        <span>{p.customsName}</span>
                        {p.length && p.width && p.height && (
                          <span className="text-xs text-muted-foreground">
                            ({p.length}×{p.width}×{p.height}mm)
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              <PackageCheck className="mr-1 inline h-3 w-3 text-primary" />
              表示有库存
            </p>
          </div>

          {itemForm.productId && (
            <div className="rounded-lg border border-primary/22 bg-primary/7 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-primary">
                  商品规格尺寸（用于3D可视化）
                </span>
                {(itemForm.length === 0 ||
                  itemForm.width === 0 ||
                  itemForm.height === 0) && (
                  <span className="text-xs text-primary/80">
                    请填写尺寸以获得准确的3D效果
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {dimensionInput("length", "长度")}
                {dimensionInput("width", "宽度")}
                {dimensionInput("height", "高度")}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">数量</label>
              <Input
                aria-label="数量"
                type="number"
                value={itemForm.quantity}
                disabled={sourceFieldsLocked || hasShipped}
                onChange={setNumber("quantity", float)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">箱数</label>
              <Input
                aria-label="箱数"
                type="number"
                value={itemForm.boxes}
                disabled={sourceFieldsLocked}
                onChange={setNumber("boxes", int)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">单价 (USD)</label>
              <Input
                aria-label="单价"
                type="number"
                step="0.01"
                value={itemForm.unitPrice || ""}
                placeholder="0.00"
                onChange={setNumber("unitPrice", float)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">总价 (USD)</label>
              <div className="h-10 rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium text-primary">
                ${(itemForm.unitPrice * itemForm.quantity).toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground">
                自动计算: 单价 × 数量
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">毛重 (kg)</label>
              <Input
                aria-label="毛重"
                type="number"
                step="0.01"
                value={itemForm.grossWeight}
                disabled={sourceFieldsLocked}
                onChange={setNumber("grossWeight", float)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">净重 (kg)</label>
              <Input
                aria-label="净重"
                type="number"
                step="0.01"
                value={itemForm.netWeight}
                disabled={sourceFieldsLocked}
                onChange={setNumber("netWeight", float)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">体积 (CBM)</label>
              <Input
                aria-label="体积"
                type="number"
                step="0.0001"
                value={itemForm.volume}
                disabled={sourceFieldsLocked}
                onChange={setNumber("volume", float)}
              />
              {itemForm.length > 0 &&
                itemForm.width > 0 &&
                itemForm.height > 0 &&
                itemForm.boxes > 0 && (
                  <p className="text-xs text-primary">
                    预估:{" "}
                    {(
                      ((itemForm.length * itemForm.width * itemForm.height) /
                        1e9) *
                      itemForm.boxes
                    ).toFixed(4)}{" "}
                    CBM （{itemForm.length}×{itemForm.width}×{itemForm.height}
                    mm × {itemForm.boxes}箱）
                  </p>
                )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">备注</label>
            <Input
              value={itemForm.note}
              onChange={(e) =>
                setItemForm((prev) => ({ ...prev, note: e.target.value }))
              }
              placeholder="可选备注"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={referenceDataLoading}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
