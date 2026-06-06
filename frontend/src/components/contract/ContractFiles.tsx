/**
 * Input: contractId、contractType、文件列表 API
 * Output: 合同附件管理区域（上传、列表、下载、删除、预览）
 * Pos: 合同详情页通用附件组件，支持采购/出口合同复用
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Paperclip, Upload, Loader2, FileText, Download, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ContractFile, ContractType } from '@/services/contractFile.service';
import {
  uploadContractFile,
  deleteContractFile,
  getContractFileDownloadUrl,
} from '@/services/contractFile.service';

interface ContractFilesProps {
  contractId: string;
  contractType: ContractType;
  files: ContractFile[];
  onChange: (files: ContractFile[]) => void;
  title?: string;
  description?: string;
  emptyHint?: string;
}

export default function ContractFiles({
  contractId,
  contractType,
  files,
  onChange,
  title = '合同附件',
  description = '支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB',
  emptyHint = '暂无附件，点击「上传附件」归档合同文件',
}: ContractFilesProps) {
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<ContractFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPreviewable = (file: ContractFile) => {
    const mime = file.mimeType || file.fileType || '';
    return mime.startsWith('image/') || mime === 'application/pdf';
  };

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      try {
        const res = await uploadContractFile(contractId, contractType, file);
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
    [contractId, contractType, files, onChange]
  );

  const handleDelete = useCallback(
    async (fileId: string, fileName: string) => {
      try {
        await deleteContractFile(fileId);
        onChange(files.filter((f) => f.id !== fileId));
        toast.success(`「${fileName}」已删除`);
      } catch {
        toast.error('删除附件失败');
      }
    },
    [files, onChange]
  );

  const formatFileSize = (size: number) => {
    if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-muted-foreground" />
              <CardTitle>{title}</CardTitle>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  上传附件
                </>
              )}
            </Button>
            <input
              id="contract-file-upload"
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.docx"
              onChange={handleUpload}
            />
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Paperclip className="h-8 w-8 opacity-30" />
              <p className="text-sm">{emptyHint}</p>
            </div>
          ) : (
            <div className="divide-y">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.fileName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.fileSize)} ·{' '}
                        {format(new Date(file.uploadedAt), 'yyyy-MM-dd HH:mm')}
                        {file.description ? ` · ${file.description}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                    {isPreviewable(file) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setPreviewFile(file)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" asChild>
                      <a
                        href={getContractFileDownloadUrl(file.id)}
                        target="_blank"
                        download={file.fileName}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(file.id, file.fileName)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 预览弹窗 */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
      >
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader className="flex flex-row items-center justify-between">
            <DialogTitle className="truncate pr-8">
              {previewFile?.fileName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 h-full overflow-hidden">
            {previewFile &&
              (previewFile.mimeType || previewFile.fileType)?.startsWith(
                'image/'
              ) ? (
              <img
                src={getContractFileDownloadUrl(previewFile.id)}
                alt={previewFile.fileName}
                className="w-full h-full object-contain"
              />
            ) : previewFile ? (
              <iframe
                src={getContractFileDownloadUrl(previewFile.id)}
                className="w-full h-full border rounded"
                title={previewFile.fileName}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
