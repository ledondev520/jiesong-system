/**
 * Input: 当前出口合同与后端返回的已完工采购剩余量
 * Output: 按采购来源和箱数批量创建装箱明细
 * Pos: 出口合同装柜阶段的采购资料复用 Module
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, PackagePlus, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { salesService, type AvailablePurchasePackingItem } from '@/services/sales.service';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';

interface ImportPurchaseItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContractId: string;
  onImported: () => void | Promise<void>;
}

export function ImportPurchaseItemsDialog({
  open,
  onOpenChange,
  salesContractId,
  onImported,
}: ImportPurchaseItemsDialogProps) {
  const [items, setItems] = useState<AvailablePurchasePackingItem[]>([]);
  const [selectedBoxes, setSelectedBoxes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setSelectedBoxes({});
    void salesService.getAvailablePurchaseItems(salesContractId)
      .then((response) => {
        if (active) setItems(response.data || []);
      })
      .catch((error: unknown) => {
        if (active) {
          setItems([]);
          toast.error(error instanceof Error ? error.message : '已完工采购资料加载失败');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [open, salesContractId]);

  const selectedCount = useMemo(
    () => Object.keys(selectedBoxes).length,
    [selectedBoxes],
  );

  const toggleItem = (item: AvailablePurchasePackingItem, checked: boolean) => {
    setSelectedBoxes((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[item.id];
        return next;
      }
      return { ...current, [item.id]: String(item.remaining.boxes) };
    });
  };

  const handleImport = async () => {
    const selections = Object.entries(selectedBoxes).map(([purchaseItemId, value]) => ({
      purchaseItemId,
      boxes: Number(value),
    }));
    for (const selection of selections) {
      const item = items.find((entry) => entry.id === selection.purchaseItemId);
      if (!item || !Number.isInteger(selection.boxes) || selection.boxes <= 0 || selection.boxes > item.remaining.boxes) {
        toast.error(`${item?.product.customsName || '采购明细'} 的导入箱数应为 1 至 ${item?.remaining.boxes || 0} 的整数`);
        return;
      }
    }
    if (selections.length === 0) {
      toast.error('请先选择要导入的采购明细');
      return;
    }

    setSaving(true);
    try {
      const response = await salesService.importPurchaseItems(salesContractId, selections);
      const importedCount = response.data?.importedCount || selections.length;
      toast.success(`已导入 ${importedCount} 条装箱明细`);
      onOpenChange(false);
      await onImported();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '采购明细导入失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: '48rem' }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            从已完工采购导入
          </DialogTitle>
          <DialogDescription>
            选择本次要装入的箱数，系统会按采购完工资料同比例带入数量、毛净重、体积、规格和采购成本；同一采购明细可拆分到多个货柜。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {loading ? (
            <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />加载已完工采购资料...
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={Boxes}
              title="没有可导入的已完工采购"
              description="请先在采购合同中补齐规格、箱数、毛净重和体积，并确认生产完成。"
            />
          ) : (
            items.map((item) => {
              const selected = Object.prototype.hasOwnProperty.call(selectedBoxes, item.id);
              const checkboxLabel = `选择 ${item.purchaseContract.contractNo} ${item.product.customsName}`;
              return (
                <div key={item.id} className="rounded-xl border border-border/60 p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id={`purchase-source-${item.id}`}
                      aria-label={checkboxLabel}
                      checked={selected}
                      onCheckedChange={(checked) => toggleItem(item, checked === true)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="font-mono">{item.purchaseContract.contractNo}</Badge>
                            <p className="font-medium">{item.product.customsName}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.purchaseContract.supplier.name} · {item.specification}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium tabular-nums">剩余 {item.remaining.boxes} 箱 · {item.remaining.grossWeight.toLocaleString()} kg · {item.remaining.volume.toFixed(2)} CBM</p>
                          <p className="text-xs text-muted-foreground">原始 {item.boxes} 箱，已排 {item.allocated.boxes} 箱</p>
                        </div>
                      </div>

                      {selected ? (
                        <div className="mt-3 grid gap-3 rounded-lg bg-muted/35 p-3 sm:grid-cols-[180px_1fr] sm:items-end">
                          <div className="space-y-1.5">
                            <Label htmlFor={`import-boxes-${item.id}`}>导入箱数（{item.product.customsName}）</Label>
                            <Input
                              id={`import-boxes-${item.id}`}
                              type="number"
                              min="1"
                              max={item.remaining.boxes}
                              step="1"
                              value={selectedBoxes[item.id]}
                              onChange={(event) => setSelectedBoxes((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))}
                            />
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1"><Boxes className="h-3.5 w-3.5" />按箱数拆分</span>
                            <span className="flex items-center gap-1"><Scale className="h-3.5 w-3.5" />重量同比例</span>
                            <span>体积同比例</span>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>取消</Button>
          <Button onClick={() => void handleImport()} disabled={saving || selectedCount === 0}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackagePlus className="mr-1.5 h-4 w-4" />}
            导入到当前货柜
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
