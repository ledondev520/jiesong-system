/**
 * Input: 采购合同生产资料完整性、采购明细与生产实物图
 * Output: 完工缺项、汇总指标、批量录入与选填照片归档
 * Pos: 采购详情生产阶段 Module，录入结果直接供待装柜导入使用
 */

'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Boxes, Loader2, PackageCheck, PencilLine, Scale } from 'lucide-react';
import { toast } from 'sonner';
import type { PurchaseContract, PurchaseItem } from '@/types';
import type { ContractFile } from '@/services/contractFile.service';
import { purchaseService, type PurchaseProductionDetailPayload } from '@/services/purchase.service';
import ContractFiles from '@/components/contract/ContractFiles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ProductionFormRow = {
  id: string;
  productName: string;
  specification: string;
  boxes: string;
  grossWeight: string;
  netWeight: string;
  volume: string;
  length: string;
  width: string;
  height: string;
};

interface PurchaseProductionPanelProps {
  contract: PurchaseContract;
  photoFiles: ContractFile[];
  onPhotoFilesChange: (files: ContractFile[]) => void;
  onUpdated: () => void | Promise<void>;
}

const toText = (value: number | null | undefined) => (
  value === null || value === undefined ? '' : String(value)
);

const toNullableNumber = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const buildFormRows = (items: PurchaseItem[] = []): ProductionFormRow[] => items.map((item) => ({
  id: item.id,
  productName: item.product?.customsName || '未知商品',
  specification: item.specification || item.product?.specification || '',
  boxes: toText(item.boxes),
  grossWeight: toText(item.grossWeight),
  netWeight: toText(item.netWeight),
  volume: toText(item.volume),
  length: toText(item.length),
  width: toText(item.width),
  height: toText(item.height),
}));

export function PurchaseProductionPanel({
  contract,
  photoFiles,
  onPhotoFilesChange,
  onUpdated,
}: PurchaseProductionPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<ProductionFormRow[]>(() => buildFormRows(contract.items));
  const readiness = contract.productionReadiness;
  const itemById = useMemo(
    () => new Map((contract.items || []).map((item) => [item.id, item])),
    [contract.items],
  );

  const openEditor = () => {
    setRows(buildFormRows(contract.items));
    setDialogOpen(true);
  };

  const updateRow = (id: string, field: keyof ProductionFormRow, value: string) => {
    setRows((current) => current.map((row) => (
      row.id === id ? { ...row, [field]: value } : row
    )));
  };

  const handleSave = async () => {
    const payload: PurchaseProductionDetailPayload[] = rows.map((row) => ({
      id: row.id,
      specification: row.specification.trim(),
      boxes: toNullableNumber(row.boxes),
      grossWeight: toNullableNumber(row.grossWeight),
      netWeight: toNullableNumber(row.netWeight),
      volume: toNullableNumber(row.volume),
      length: toNullableNumber(row.length),
      width: toNullableNumber(row.width),
      height: toNullableNumber(row.height),
    }));

    for (const item of payload) {
      const source = itemById.get(item.id);
      const name = source?.product?.customsName || item.id;
      if (item.boxes !== null && (!Number.isInteger(item.boxes) || item.boxes < 0)) {
        toast.error(`${name} 的箱数必须为非负整数`);
        return;
      }
      const numericValues = [item.grossWeight, item.netWeight, item.volume, item.length, item.width, item.height];
      if (numericValues.some((value) => value !== null && value < 0)) {
        toast.error(`${name} 的重量、体积和尺寸不能为负数`);
        return;
      }
      if (item.grossWeight && item.netWeight && item.netWeight > item.grossWeight) {
        toast.error(`${name} 的净重不能大于毛重`);
        return;
      }
      const dimensionCount = [item.length, item.width, item.height].filter((value) => value && value > 0).length;
      if (dimensionCount > 0 && dimensionCount < 3) {
        toast.error(`${name} 的单箱长宽高需成套填写`);
        return;
      }
    }

    setSaving(true);
    try {
      await purchaseService.updateProductionDetails(contract.id, payload);
      toast.success('生产资料已保存');
      setDialogOpen(false);
      await onUpdated();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '生产资料保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>
              <h2 className="flex items-center gap-2 text-sm font-medium">
                <PackageCheck className="h-4 w-4" />
                生产与货物资料
              </h2>
            </CardTitle>
            <CardDescription className="mt-1">
              供应商确认完工后，按商品录入规格、总箱数、总毛净重和总体积；单箱尺寸可选填。
            </CardDescription>
            {contract.productionCompletedAt ? (
              <p className="mt-1 text-xs text-muted-foreground">
                确认完工时间：{new Date(contract.productionCompletedAt).toLocaleString('zh-CN', { hour12: false })}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={readiness?.ready ? 'default' : 'outline'}>
              {readiness?.ready ? '资料完整，可确认完工' : `待补 ${readiness?.incompleteItemCount || contract.items?.length || 0} 条明细`}
            </Badge>
            <Button size="sm" variant="outline" onClick={openEditor} disabled={!contract.items?.length}>
              <PencilLine className="mr-1.5 h-3.5 w-3.5" />
              {readiness?.ready ? '更新生产资料' : '录入生产资料'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: '总箱数', value: `${readiness?.totals.boxes || 0} 箱`, icon: Boxes },
              { label: '总毛重', value: `${(readiness?.totals.grossWeight || 0).toLocaleString()} kg`, icon: Scale },
              { label: '总净重', value: `${(readiness?.totals.netWeight || 0).toLocaleString()} kg`, icon: Scale },
              { label: '总体积', value: `${(readiness?.totals.volume || 0).toFixed(2)} CBM`, icon: PackageCheck },
            ].map((metric) => (
              <div key={metric.label} className="rounded-lg border border-border/50 bg-muted/25 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <metric.icon className="h-3.5 w-3.5" />{metric.label}
                </div>
                <p className="mt-1 text-base font-semibold tabular-nums">{metric.value}</p>
              </div>
            ))}
          </div>

          {!readiness?.ready && readiness?.items?.length ? (
            <div role="alert" className="rounded-lg border border-amber-300/70 bg-amber-50/70 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">确认生产完成前还需补齐</p>
                  <ul className="mt-1 space-y-1 text-xs">
                    {readiness.items.filter((item) => !item.ready).map((item) => {
                      const source = item.id ? itemById.get(item.id) : undefined;
                      return (
                        <li key={item.id}>
                          {source?.product?.customsName || item.id || '未知商品'}：{item.issues.map((issue) => issue.label).join('、')}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2">
            {(contract.items || []).map((item) => {
              const itemState = readiness?.items.find((entry) => entry.id === item.id);
              return (
                <div key={item.id} className="rounded-lg border border-border/50 p-3 only:md:col-span-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{item.product?.customsName || '未知商品'}</p>
                      <p className="text-xs text-muted-foreground">{item.specification || '规格待补充'}</p>
                    </div>
                    <Badge variant={itemState?.ready ? 'secondary' : 'outline'}>
                      {itemState?.ready ? '完整' : '待补'}
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-muted-foreground">箱数</span><span className="text-right tabular-nums">{item.boxes || '—'}</span>
                    <span className="text-muted-foreground">毛重 / 净重</span><span className="text-right tabular-nums">{item.grossWeight || '—'} / {item.netWeight || '—'} kg</span>
                    <span className="text-muted-foreground">体积</span><span className="text-right tabular-nums">{item.volume || '—'} CBM</span>
                    <span className="text-muted-foreground">单箱尺寸</span>
                    <span className="text-right tabular-nums">
                      {item.length && item.width && item.height ? `${item.length}×${item.width}×${item.height} mm` : '按体积推算'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <ContractFiles
        contractId={contract.id}
        contractType="PURCHASE"
        files={photoFiles}
        onChange={onPhotoFilesChange}
        title="生产实物图（选填）"
        description="供应商完工后可上传 JPG/PNG 实物图留档；照片不是确认完工的强制条件。"
        emptyHint="暂无生产实物图，可直接继续补录箱规和重量资料"
        categoryOptions={[{ value: 'PRODUCTION_PHOTO', label: '生产实物图' }]}
        accept=".jpg,.jpeg,.png"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" style={{ maxWidth: '56rem' }}>
          <DialogHeader>
            <DialogTitle>录入生产资料</DialogTitle>
            <DialogDescription>
              可先保存部分资料；只有所有商品的规格、箱数、总毛重、总净重和总体积完整后，才能确认生产完成。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {rows.map((row) => (
              <Card key={row.id} className="border-border/60 shadow-none">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">{row.productName}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor={`production-spec-${row.id}`}>
                      规格<span className="sr-only">（{row.productName}）</span>
                    </Label>
                    <Input id={`production-spec-${row.id}`} value={row.specification} onChange={(event) => updateRow(row.id, 'specification', event.target.value)} placeholder="例如：800×800mm，4片/箱" />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <ProductionNumberField row={row} field="boxes" label="箱数" unit="箱" onChange={updateRow} />
                    <ProductionNumberField row={row} field="grossWeight" label="总毛重" unit="kg" onChange={updateRow} />
                    <ProductionNumberField row={row} field="netWeight" label="总净重" unit="kg" onChange={updateRow} />
                    <ProductionNumberField row={row} field="volume" label="总体积" unit="CBM" onChange={updateRow} />
                  </div>
                  <div className="rounded-lg bg-muted/35 p-3">
                    <p className="mb-2 text-xs font-medium">单箱尺寸（选填，未填时按总体积 ÷ 箱数推算）</p>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <ProductionNumberField row={row} field="length" label="单箱长度" unit="mm" onChange={updateRow} />
                      <ProductionNumberField row={row} field="width" label="单箱宽度" unit="mm" onChange={updateRow} />
                      <ProductionNumberField row={row} field="height" label="单箱高度" unit="mm" onChange={updateRow} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={() => void handleSave()} disabled={saving || rows.length === 0}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />}
              保存生产资料
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductionNumberField({
  row,
  field,
  label,
  unit,
  onChange,
}: {
  row: ProductionFormRow;
  field: 'boxes' | 'grossWeight' | 'netWeight' | 'volume' | 'length' | 'width' | 'height';
  label: string;
  unit: string;
  onChange: (id: string, field: keyof ProductionFormRow, value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`production-${field}-${row.id}`}>
        {label}<span className="sr-only">（{row.productName}）</span>
      </Label>
      <div className="relative">
        <Input
          id={`production-${field}-${row.id}`}
          type="number"
          min="0"
          step={field === 'boxes' ? '1' : 'any'}
          value={row[field]}
          onChange={(event) => onChange(row.id, field, event.target.value)}
          className="pr-12"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{unit}</span>
      </div>
    </div>
  );
}
