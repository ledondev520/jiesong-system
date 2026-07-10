/**
 * Input: 上传工作簿、账期、只读解析预览与明确确认动作
 * Output: “选择文件 → 解析预览 → 确认写入”的月度会计报表对话框
 * Pos: 财务报表唯一上传主界面；不能从选择文件直接跳到数据库写入
 */

import type { RefObject } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  Loader2,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react';
import type { FinancialStatementImportPreview } from '@/services/financialStatements.service';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SemanticBadge } from '@/components/ui/semantic-badge';

interface FinancialStatementsUploadDialogProps {
  open: boolean;
  uploadFile: File | null;
  uploadMonth: string;
  uploadYear: string;
  preview: FinancialStatementImportPreview | null;
  previewing: boolean;
  confirming: boolean;
  overwriteConfirmed: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onClearFile: () => void;
  onConfirm: () => void;
  onMonthChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onOverwriteConfirmedChange: (checked: boolean) => void;
  onPreview: () => void;
  onUploadFileChange: (file: File | null) => void;
  onYearChange: (value: string) => void;
}

const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCny = (value: number | null) => (
  value === null ? '—' : `CNY ${moneyFormatter.format(value)}`
);

export function FinancialStatementsUploadDialog({
  open,
  uploadFile,
  uploadMonth,
  uploadYear,
  preview,
  previewing,
  confirming,
  overwriteConfirmed,
  fileInputRef,
  onClearFile,
  onConfirm,
  onMonthChange,
  onOpenChange,
  onOverwriteConfirmedChange,
  onPreview,
  onUploadFileChange,
  onYearChange,
}: FinancialStatementsUploadDialogProps) {
  const busy = previewing || confirming;
  const overwriteRequired = Boolean(preview?.period.existing);
  const confirmDisabled = !preview?.ready || busy || (overwriteRequired && !overwriteConfirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            上传月度会计报表 Excel
          </DialogTitle>
          <DialogDescription>
            上传包含「资产负债表」「利润表」两个 Sheet 的 .xlsx 文件；系统先解析预览，确认后才写入指定账期。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="excel-file">选择 Excel 文件（.xlsx）</Label>
            <div className="flex items-center gap-2">
              <Input
                id="excel-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="cursor-pointer"
                disabled={busy}
                onChange={(event) => onUploadFileChange(event.target.files?.[0] ?? null)}
              />
              {uploadFile && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="清除文件"
                  disabled={busy}
                  onClick={onClearFile}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {uploadFile && (
              <p className="truncate text-xs text-muted-foreground">
                已选择：{uploadFile.name}（{(uploadFile.size / 1024).toFixed(1)} KB）
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="upload-year">账期年份</Label>
              <Input
                id="upload-year"
                type="number"
                min="2000"
                max="2099"
                value={uploadYear}
                disabled={busy}
                onChange={(event) => onYearChange(event.target.value)}
                placeholder="例如 2026"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="upload-month">账期月份</Label>
              <Input
                id="upload-month"
                type="number"
                min="1"
                max="12"
                value={uploadMonth}
                disabled={busy}
                onChange={(event) => onMonthChange(event.target.value)}
                placeholder="1~12"
              />
            </div>
          </div>

          {!preview && (
            <p className="text-xs text-muted-foreground">
              第一步只解析当前文件，不会新增或覆盖任何账期。
            </p>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">解析预览</span>
                  <SemanticBadge tone={preview.ready ? 'success' : 'danger'}>
                    {preview.ready ? '可确认' : '存在阻塞'}
                  </SemanticBadge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {preview.period.periodLabel} · 报表日 {preview.period.reportDate}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  ['资产总计', preview.summary.totalAssets],
                  ['负债合计', preview.summary.totalLiabilities],
                  ['所有者权益', preview.summary.totalEquity],
                  ['本月营业收入', preview.summary.revenueMonth],
                  ['本月营业成本', preview.summary.costOfSalesMonth],
                  ['本月净利润', preview.summary.netProfitMonth],
                ].map(([label, value]) => (
                  <div key={String(label)} className="rounded-md border bg-background px-3 py-2">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-1 text-sm font-semibold tabular-nums">{formatCny(value as number | null)}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  已识别资产负债字段 {preview.summary.balanceSheetFieldCount} 个、利润表字段 {preview.summary.incomeStatementFieldCount} 个
                </span>
                <span>
                  本月成本费用合计 {formatCny(preview.summary.costStructure.total)}
                </span>
              </div>

              {preview.summary.accountingEquationDifference === 0 && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  资产 = 负债 + 所有者权益，平衡校验通过
                </div>
              )}

              {preview.blockers.map((message) => (
                <Alert key={message} variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>暂不可写入</AlertTitle>
                  <AlertDescription>{message}</AlertDescription>
                </Alert>
              ))}

              {preview.warnings.map((message) => (
                <div key={message} className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                  <SemanticBadge tone="warning" className="mt-0.5 shrink-0">复核</SemanticBadge>
                  <span>{message}</span>
                </div>
              ))}

              {overwriteRequired && (
                <div className="flex items-start gap-2 rounded-md border bg-background p-3">
                  <Checkbox
                    id="confirm-overwrite-period"
                    checked={overwriteConfirmed}
                    onCheckedChange={(checked) => onOverwriteConfirmedChange(checked === true)}
                  />
                  <Label htmlFor="confirm-overwrite-period" className="cursor-pointer leading-5">
                    确认覆盖 {preview.period.periodLabel}；原账期的资产负债表和利润表将被本次预览数据更新
                  </Label>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            取消
          </Button>
          {!preview ? (
            <Button type="button" onClick={onPreview} disabled={!uploadFile || busy}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              {previewing ? '解析中...' : '解析并预览'}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onPreview} disabled={!uploadFile || busy}>
                <RefreshCw className="h-4 w-4" />
                重新解析
              </Button>
              <Button type="button" onClick={onConfirm} disabled={confirmDisabled}>
                {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {confirming ? '写入中...' : '确认写入账期'}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
