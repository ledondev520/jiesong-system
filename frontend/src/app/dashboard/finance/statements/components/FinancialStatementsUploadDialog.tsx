/**
 * Input: 会计报表、科目余额表、明细账、账期与预览确认动作
 * Output: “选择三份来源 → 解析预览 → 单事务确认写入”的对话框
 * Pos: 财务报表唯一上传主界面；三类来源不能绕过预览直接写库
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

export type FinancialUploadFileType = 'statement' | 'trialBalance' | 'generalLedger';
export type FinancialUploadFiles = Record<FinancialUploadFileType, File | null>;

interface FinancialStatementsUploadDialogProps {
  open: boolean;
  uploadFiles: FinancialUploadFiles;
  uploadMonth: string;
  uploadYear: string;
  preview: FinancialStatementImportPreview | null;
  previewing: boolean;
  confirming: boolean;
  overwriteConfirmed: boolean;
  fileInputRefs: Record<FinancialUploadFileType, RefObject<HTMLInputElement | null>>;
  onClearFiles: () => void;
  onConfirm: () => void;
  onMonthChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onOverwriteConfirmedChange: (checked: boolean) => void;
  onPreview: () => void;
  onUploadFileChange: (type: FinancialUploadFileType, file: File | null) => void;
  onYearChange: (value: string) => void;
}

const sourceFields: Array<{
  type: FinancialUploadFileType;
  id: string;
  label: string;
  accept: string;
  hint: string;
}> = [
  { type: 'statement', id: 'statement-file', label: '会计报表（.xlsx）', accept: '.xlsx', hint: '资产负债表、利润表；现金流量表有则一并读取' },
  { type: 'trialBalance', id: 'trial-balance-file', label: '科目余额表（.xls / .xlsx）', accept: '.xls,.xlsx', hint: '保留科目层级、期初、本期、本年累计和期末借贷' },
  { type: 'generalLedger', id: 'general-ledger-file', label: '明细账（.xlsx）', accept: '.xlsx', hint: '保留期初、凭证、本期合计和本年累计行' },
];

const moneyFormatter = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const formatCny = (value: number | null) => (
  value === null ? '—' : `CNY ${moneyFormatter.format(value)}`
);

export function FinancialStatementsUploadDialog({
  open,
  uploadFiles,
  uploadMonth,
  uploadYear,
  preview,
  previewing,
  confirming,
  overwriteConfirmed,
  fileInputRefs,
  onClearFiles,
  onConfirm,
  onMonthChange,
  onOpenChange,
  onOverwriteConfirmedChange,
  onPreview,
  onUploadFileChange,
  onYearChange,
}: FinancialStatementsUploadDialogProps) {
  const busy = previewing || confirming;
  const hasAllFiles = sourceFields.every(({ type }) => Boolean(uploadFiles[type]));
  const overwriteRequired = Boolean(preview?.period.existing);
  const confirmDisabled = !preview?.ready || busy || (overwriteRequired && !overwriteConfirmed);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            导入账期财务数据
          </DialogTitle>
          <DialogDescription>
            同时上传会计报表、科目余额表和明细账；系统先核对企业、账期与借贷平衡，确认后才写入。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-3 sm:grid-cols-3">
            {sourceFields.map(({ type, id, label, accept, hint }) => {
              const file = uploadFiles[type];
              return (
                <div key={type} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                  <Label htmlFor={id}>{label}</Label>
                  <Input
                    id={id}
                    ref={fileInputRefs[type]}
                    type="file"
                    accept={accept}
                    className="cursor-pointer"
                    disabled={busy}
                    onChange={(event) => onUploadFileChange(type, event.target.files?.[0] ?? null)}
                  />
                  <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
                  {file && (
                    <p className="truncate text-xs font-medium" title={file.name}>
                      {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {Object.values(uploadFiles).some(Boolean) && (
            <div className="flex justify-end">
              <Button type="button" variant="ghost" size="sm" onClick={onClearFiles} disabled={busy}>
                <X className="h-4 w-4" />
                清空三份文件
              </Button>
            </div>
          )}

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
              />
            </div>
          </div>

          {!preview && (
            <p className="text-xs text-muted-foreground">
              第一步只解析三份文件，不会新增或覆盖任何账期。
            </p>
          )}

          {preview && (
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">三文件解析预览</span>
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

              <div className="flex flex-wrap gap-2 text-xs">
                <SemanticBadge tone="neutral">报表字段 {(preview.summary.balanceSheetFieldCount ?? 0) + (preview.summary.incomeStatementFieldCount ?? 0)} 个</SemanticBadge>
                <SemanticBadge tone="neutral">现金流字段 {preview.summary.cashFlowFieldCount ?? 0} 个</SemanticBadge>
                <SemanticBadge tone="neutral">科目余额 {preview.summary.accountBalanceRowCount ?? 0} 行</SemanticBadge>
                <SemanticBadge tone="neutral">明细账 {preview.summary.generalLedgerRowCount ?? 0} 行</SemanticBadge>
              </div>

              {preview.summary.accountingEquationDifference === 0
                && preview.summary.trialBalanceChecks?.periodDifference === 0
                && preview.summary.trialBalanceChecks?.endingDifference === 0 && (
                <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  资产负债表与科目余额表借贷平衡校验通过
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
                    确认覆盖 {preview.period.periodLabel}；该账期的报表、科目余额、明细账和来源校验将整体更新
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
            <Button type="button" onClick={onPreview} disabled={!hasAllFiles || busy}>
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              {previewing ? '解析中...' : '解析三份文件'}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={onPreview} disabled={!hasAllFiles || busy}>
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
