/**
 * Input: 上传弹窗状态、文件、账期参数与提交动作
 * Output: 月度会计报表 Excel 上传导入对话框
 * Pos: 财务报表页导入交互分区
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
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
import { Loader2, Upload, X } from 'lucide-react';

interface FinancialStatementsUploadDialogProps {
  open: boolean;
  uploadFile: File | null;
  uploadMonth: string;
  uploadYear: string;
  uploading: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onClearFile: () => void;
  onMonthChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
  onUploadFileChange: (file: File | null) => void;
  onYearChange: (value: string) => void;
}

export function FinancialStatementsUploadDialog({
  open,
  uploadFile,
  uploadMonth,
  uploadYear,
  uploading,
  fileInputRef,
  onClearFile,
  onMonthChange,
  onOpenChange,
  onSubmit,
  onUploadFileChange,
  onYearChange,
}: FinancialStatementsUploadDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            上传月度会计报表 Excel
          </DialogTitle>
          <DialogDescription>
            上传包含「资产负债表」「利润表」两个 Sheet 的 Excel 文件，解析后写入指定账期。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="excel-file">选择 Excel 文件（.xlsx / .xls）</Label>
            <div className="flex items-center gap-2">
              <Input
                id="excel-file"
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="cursor-pointer"
                onChange={(event) => onUploadFileChange(event.target.files?.[0] ?? null)}
              />
              {uploadFile && (
                <Button variant="ghost" size="icon" className="shrink-0" onClick={onClearFile}>
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
                onChange={(event) => onYearChange(event.target.value)}
                placeholder="例如 2025"
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
                onChange={(event) => onMonthChange(event.target.value)}
                placeholder="1~12"
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            账期标签将自动生成为「{uploadYear}年{uploadMonth}账期」，若已有相同账期则覆盖更新。
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!uploadFile || uploading}>
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                解析中...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                解析并导入
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
