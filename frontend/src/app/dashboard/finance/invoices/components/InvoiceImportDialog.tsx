/**
 * Input: 导入弹窗状态、文件、发票类型与提交动作
 * Output: 发票导入对话框
 * Pos: 发票台账页导入交互分区
 */

'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Upload, X, FileUp } from 'lucide-react';
import { previewInvoiceImport, importInvoices } from '@/services/bankFlow.service';

interface PreviewItem {
  invDate?: string;
  seller?: string;
  amount?: number;
  tax?: number;
  total?: number;
}

interface PreviewResult {
  preview: PreviewItem[];
  mapping: Record<string, string>;
  totalRows: number;
  validRows: number;
  errorRows: number;
  errors: Array<{ row: number; reason: string; data: unknown }>;
}

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  batchId: string | null;
  errors: Array<{ reason: string; data: unknown }>;
  parseErrors: Array<{ row: number; reason: string; data: unknown }>;
  preview: unknown[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function InvoiceImportDialog({ open, onOpenChange, onSuccess }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [invoiceType, setInvoiceType] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const reset = () => {
    setFile(null);
    setInvoiceType('all');
    setPreview(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handlePreview = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await previewInvoiceImport(file, invoiceType);
      setPreview(res as unknown as PreviewResult);
      setResult(null);
    } catch {
      /* toast handled by axios interceptor */
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await importInvoices(file, invoiceType);
      setResult(res as unknown as ImportResult);
      setPreview(null);
      onSuccess?.();
    } catch {
      /* toast handled by axios interceptor */
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            导入发票
          </DialogTitle>
          <DialogDescription>
            支持 Excel (.xlsx/.xls) 或 CSV 格式的发票清单批量导入。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>选择文件</Label>
            <div className="flex items-center gap-2">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="cursor-pointer"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setResult(null); }}
              />
              {file && (
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => { setFile(null); setPreview(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            {file && <p className="text-xs text-muted-foreground">已选择：{file.name}（{(file.size / 1024).toFixed(1)} KB）</p>}
          </div>

          <div className="space-y-2">
            <Label>发票类型筛选</Label>
            <Select value={invoiceType} onValueChange={setInvoiceType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                <SelectItem value="input">进项发票</SelectItem>
                <SelectItem value="output">销项发票</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {preview && preview.mapping && Object.keys(preview.mapping).length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">列映射预览</Label>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">系统字段</TableHead>
                      <TableHead>Excel 列名</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(preview.mapping).map(([key, val]) => (
                      <TableRow key={key}>
                        <TableCell className="text-xs font-medium">{key}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{String(val)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {preview && preview.preview.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">数据预览（前 {Math.min(preview.preview.length, 10)} 条）</Label>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">开票日期</TableHead>
                      <TableHead>销方</TableHead>
                      <TableHead className="text-right w-[80px]">金额</TableHead>
                      <TableHead className="text-right w-[80px]">税额</TableHead>
                      <TableHead className="text-right w-[90px]">价税合计</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.preview.slice(0, 10).map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs tabular-nums">{item.invDate || '-'}</TableCell>
                        <TableCell className="text-xs max-w-[140px] truncate">{item.seller || '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{typeof item.amount === 'number' ? item.amount.toFixed(2) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums">{typeof item.tax === 'number' ? item.tax.toFixed(2) : '-'}</TableCell>
                        <TableCell className="text-xs text-right tabular-nums font-medium">{typeof item.total === 'number' ? item.total.toFixed(2) : '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                共解析 {preview.validRows} 条有效数据，{preview.errorRows} 条错误
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-lg border bg-muted/40 p-3">
              <p className="text-sm font-medium">导入结果</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-600">{result.success}</p>
                  <p className="text-[10px] text-muted-foreground">成功导入</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-orange-500">{result.skipped}</p>
                  <p className="text-[10px] text-muted-foreground">重复跳过</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-600">{result.failed}</p>
                  <p className="text-[10px] text-muted-foreground">失败</p>
                </div>
              </div>
              {result.parseErrors && result.parseErrors.length > 0 && (
                <div className="max-h-[120px] overflow-y-auto text-xs text-red-600 space-y-1">
                  {result.parseErrors.slice(0, 10).map((e, i) => (
                    <p key={i}>第{e.row}行：{e.reason}</p>
                  ))}
                  {result.parseErrors.length > 10 && <p>...等共 {result.parseErrors.length} 条错误</p>}
                </div>
              )}
            </div>
          )}

          {preview && preview.errorRows > 0 && !result && (
            <div className="max-h-[120px] overflow-y-auto rounded-md border p-2 text-xs text-red-600 space-y-1">
              {preview.errors.map((e, i) => (
                <p key={i}>第{e.row}行：{e.reason}</p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={uploading}>
            取消
          </Button>
          {preview && !result ? (
            <Button onClick={handleImport} disabled={uploading || preview.validRows === 0}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileUp className="mr-2 h-4 w-4" />}
              确认导入
            </Button>
          ) : (
            <Button onClick={handlePreview} disabled={!file || uploading}>
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              解析预览
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
