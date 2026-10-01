/**
 * Input: contractId、contractType、文件列表 API
 * Output: 合同附件管理区域（上传、系统生成 XLSX 展示、列表、下载、删除、预览）
 * Pos: 合同详情页通用附件组件，支持采购/出口合同复用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { BusinessWrite, useBusinessReadOnly } from '@/lib/hooks/useBusinessReadOnly';
import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Upload,
  Loader2,
  FileText,
  FileSpreadsheet,
  FileImage,
  File,
  Download,
  Trash2,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ContractFile, ContractFileCategory, ContractType } from '@/services/contractFile.service';
import {
  uploadContractFile,
  deleteContractFile,
  getContractFileDownloadUrl,
} from '@/services/contractFile.service';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORY_LABELS: Record<ContractFileCategory, string> = {
  OTHER: '其他附件',
  SIGNED_CONTRACT: '供应商盖章件',
  PRODUCTION_PHOTO: '生产实物图',
  SUPPLIER_INVOICE: '供应商发票',
  CARRIER_DOCUMENT: '船司文件',
  SYSTEM_GENERATED_WORD: '系统生成 Word',
  SYSTEM_GENERATED_PDF: '系统生成 PDF',
  SYSTEM_GENERATED_XLSX: '系统生成 Excel',
};

interface ContractFilesProps {
  contractId: string;
  contractType: ContractType;
  files: ContractFile[];
  onChange: (files: ContractFile[]) => void;
  title?: string;
  description?: string;
  emptyHint?: string;
  categoryOptions?: Array<{ value: ContractFileCategory; label: string }>;
  accept?: string;
}

/**
 * 职责：根据文件类型返回对应图标
 */
function FileTypeIcon({ fileName, className }: { fileName: string; className?: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx'].includes(ext)) {
    return <FileText className={cn('text-blue-600', className)} />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <FileSpreadsheet className={cn('text-emerald-600', className)} />;
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return <FileImage className={cn('text-violet-600', className)} />;
  }
  return <File className={cn('text-slate-500', className)} />;
}

/**
 * 职责：根据文件类型返回背景色
 */
function FileTypeBg({ fileName }: { fileName: string }) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['pdf', 'doc', 'docx'].includes(ext)) {
    return 'bg-blue-50 dark:bg-blue-950';
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return 'bg-emerald-50 dark:bg-emerald-950';
  }
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
    return 'bg-violet-50 dark:bg-violet-950';
  }
  return 'bg-slate-50 dark:bg-slate-900';
}

export default function ContractFiles({
  contractId,
  contractType,
  files,
  onChange,
  title = '合同附件',
  description = '支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB',
  emptyHint = '暂无附件，点击「上传附件」归档合同文件',
  categoryOptions,
  accept = '.pdf,.jpg,.jpeg,.png,.xlsx,.docx',
}: ContractFilesProps) {
  const readOnly = useBusinessReadOnly();
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<ContractFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolvedCategoryOptions = categoryOptions?.length
    ? categoryOptions
    : [{ value: 'OTHER' as ContractFileCategory, label: CATEGORY_LABELS.OTHER }];
  const [uploadCategory, setUploadCategory] = useState<ContractFileCategory>(resolvedCategoryOptions[0].value);

  const isPreviewable = (file: ContractFile) => {
    const mime = file.mimeType || file.fileType || '';
    return mime.startsWith('image/') || mime === 'application/pdf';
  };

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || readOnly) return;

      setUploading(true);
      try {
        const res = await uploadContractFile(contractId, contractType, file, undefined, uploadCategory);
        if (res.data) {
          onChange([res.data, ...files]);
          toast.success(`「${file.name}」上传成功`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : '附件上传失败');
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [contractId, contractType, files, onChange, uploadCategory, readOnly]
  );

  const handleDelete = useCallback(
    async (fileId: string, fileName: string) => {
      if (readOnly) return;
      try {
        await deleteContractFile(fileId);
        onChange(files.filter((f) => f.id !== fileId));
        toast.success(`「${fileName}」已删除`);
      } catch {
        toast.error('删除附件失败');
      }
    },
    [files, onChange, readOnly]
  );

  const formatFileSize = (size: number) => {
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  return (
    <>
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-medium">{title}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {!readOnly && resolvedCategoryOptions.length > 1 ? (
                <Select value={uploadCategory} onValueChange={(value) => setUploadCategory(value as ContractFileCategory)}>
                  <SelectTrigger className="h-8 w-[150px] text-xs" aria-label="附件类型">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {resolvedCategoryOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <BusinessWrite><Button
                variant="outline"
                size="sm"
                className="h-8 rounded-md text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />上传中...</>
                ) : (
                  <><Upload className="mr-1.5 h-3.5 w-3.5" />上传附件</>
                )}
              </Button></BusinessWrite>
            </div>
            <input
              id="contract-file-upload"
              disabled={readOnly}
              ref={fileInputRef}
              type="file"
              aria-label="上传合同附件"
              className="hidden"
              accept={accept}
              onChange={handleUpload}
            />
          </div>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 py-10 text-muted-foreground">
              <File className="h-8 w-8 opacity-30" />
              <p className="text-sm">{emptyHint}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="group flex items-center gap-3 rounded-lg border border-border/40 bg-card p-3 transition-all hover:border-border/80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
                >
                  <div
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-md',
                      FileTypeBg({ fileName: file.fileName })
                    )}
                  >
                    <FileTypeIcon fileName={file.fileName} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={file.fileName}>
                      {file.fileName}
                    </p>
                    <Badge variant="outline" className="mt-1 rounded px-1.5 py-0 text-[10px] font-normal">
                      {CATEGORY_LABELS[file.category || 'OTHER']}
                    </Badge>
                    <p className="text-[11px] text-muted-foreground">
                      {formatFileSize(file.fileSize)} · {format(new Date(file.uploadedAt), 'yyyy-MM-dd')}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                    {isPreviewable(file) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-md"
                        aria-label={`预览${file.fileName}`}
                        onClick={() => setPreviewFile(file)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 rounded-md" asChild>
                      <a
                        href={getContractFileDownloadUrl(file.id)}
                        target="_blank"
                        download={file.fileName}
                        aria-label={`下载${file.fileName}`}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <BusinessWrite><Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md text-destructive hover:text-destructive"
                      aria-label={`删除${file.fileName}`}
                      onClick={() => handleDelete(file.id, file.fileName)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button></BusinessWrite>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 预览弹窗 */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="h-[80vh] max-w-4xl">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="truncate pr-8">{previewFile?.fileName}</DialogTitle>
          </DialogHeader>
          <div className="h-full flex-1 overflow-hidden">
            {previewFile &&
            (previewFile.mimeType || previewFile.fileType)?.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getContractFileDownloadUrl(previewFile.id)}
                alt={previewFile.fileName}
                className="h-full w-full object-contain"
              />
            ) : previewFile ? (
              <iframe
                src={getContractFileDownloadUrl(previewFile.id)}
                className="h-full w-full rounded border"
                title={previewFile.fileName}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
