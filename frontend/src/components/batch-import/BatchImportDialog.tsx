'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export interface ImportColumn {
  key: string;
  label: string;
  required?: boolean;
  validate?: (value: unknown) => string | null;
}

export interface ImportRow {
  [key: string]: unknown;
  _rowNum?: number;
  _errors?: string[];
}

export interface BatchImportResult {
  success: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

interface BatchImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  columns: ImportColumn[];
  templateData?: Record<string, unknown>[];
  onImport: (data: ImportRow[]) => Promise<BatchImportResult>;
  onSuccess?: () => void;
}

export function BatchImportDialog({
  open,
  onOpenChange,
  title,
  description,
  columns,
  templateData,
  onImport,
  onSuccess,
}: BatchImportDialogProps) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload');
  const [parsedData, setParsedData] = useState<ImportRow[]>([]);
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null);
  const [progress, setProgress] = useState(0);

  // 下载模板
  const downloadTemplate = () => {
    const template = templateData || [columns.reduce((acc, col) => ({ ...acc, [col.label]: '' }), {})];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '模板');
    XLSX.writeFile(wb, `${title}_导入模板.xlsx`);
  };

  // 解析文件
  const parseFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet);

        // 转换列名并验证
        const validatedData: ImportRow[] = jsonData.map((row, index) => {
          const convertedRow: ImportRow = { _rowNum: index + 2 };
          const errors: string[] = [];

          columns.forEach((col) => {
            // 尝试匹配列名（支持中文列名）
            const value = row[col.label] ?? row[col.key] ?? null;
            convertedRow[col.key] = value;

            // 必填验证
            if (col.required && (value === null || value === undefined || value === '')) {
              errors.push(`${col.label} 不能为空`);
            }

            // 自定义验证
            if (col.validate && value !== null && value !== undefined && value !== '') {
              const error = col.validate(value);
              if (error) errors.push(error);
            }
          });

          if (errors.length > 0) {
            convertedRow._errors = errors;
          }

          return convertedRow;
        });

        setParsedData(validatedData);
        setStep('preview');

        const errorCount = validatedData.filter((r) => r._errors?.length).length;
        if (errorCount > 0) {
          toast.warning(`发现 ${errorCount} 行数据有问题，请检查`);
        }
      } catch {
        toast.error('文件解析失败，请检查文件格式');
      }
    };
    reader.readAsBinaryString(file);
  };

  // 文件拖拽
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        parseFile(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });

  // 执行导入
  const handleImport = async () => {
    const validData = parsedData.filter((row) => !row._errors?.length);
    if (validData.length === 0) {
      toast.error('没有有效的数据可导入');
      return;
    }

    setStep('importing');
    setProgress(0);

    try {
      const result = await onImport(validData);
      setImportResult(result);
      setStep('result');

      if (result.failed === 0) {
        toast.success(`成功导入 ${result.success} 条数据`);
        onSuccess?.();
      } else {
        toast.warning(`导入完成：${result.success} 成功，${result.failed} 失败`);
      }
    } catch {
      toast.error('导入失败，请稍后重试');
      setStep('preview');
    }
  };

  // 关闭并重置
  const handleClose = () => {
    setStep('upload');
    setParsedData([]);
    setImportResult(null);
    setProgress(0);
    onOpenChange(false);
  };

  const errorCount = parsedData.filter((r) => r._errors?.length).length;
  const validCount = parsedData.length - errorCount;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted'
              }`}
            >
              <input id="batch-import-file" name="batch-import-file" {...getInputProps()} />
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-lg font-medium">
                {isDragActive ? '释放文件以上传' : '拖拽文件到此处，或点击选择'}
              </p>
              <p className="text-sm text-muted-foreground mt-2">
                支持 Excel (.xlsx, .xls) 和 CSV 格式
              </p>
            </div>

            <div className="flex justify-center">
              <Button variant="outline" onClick={downloadTemplate}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                下载模板
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="text-green-600">✓ {validCount} 行有效</span>
                {errorCount > 0 && (
                  <span className="text-red-600 ml-4">✗ {errorCount} 行有误</span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setStep('upload')}>
                重新上传
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">行号</TableHead>
                    {columns.map((col) => (
                      <TableHead key={col.key}>
                        {col.label}
                        {col.required && <span className="text-red-500">*</span>}
                      </TableHead>
                    ))}
                    <TableHead>状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((row) => (
                    <TableRow key={row._rowNum} className={row._errors?.length ? 'bg-red-50' : ''}>
                      <TableCell>{row._rowNum}</TableCell>
                      {columns.map((col) => (
                        <TableCell key={col.key}>{String(row[col.key] ?? '')}</TableCell>
                      ))}
                      <TableCell>
                        {row._errors?.length ? (
                          <div className="flex items-center text-red-600" title={row._errors.join(', ')}>
                            <AlertCircle className="h-4 w-4 mr-1" />
                            {row._errors.length} 个错误
                          </div>
                        ) : (
                          <div className="flex items-center text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            有效
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={handleClose}>取消</Button>
              <Button onClick={handleImport} disabled={validCount === 0}>
                导入 {validCount} 行数据
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'importing' && (
          <div className="py-12 text-center space-y-4">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p>正在导入数据...</p>
            <Progress value={progress} className="w-64 mx-auto" />
          </div>
        )}

        {step === 'result' && importResult && (
          <div className="space-y-4">
            <div className="text-center py-6">
              {importResult.failed === 0 ? (
                <>
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-green-600">导入成功</h3>
                  <p className="text-muted-foreground">成功导入 {importResult.success} 条数据</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="h-8 w-8 text-yellow-600" />
                  </div>
                  <h3 className="text-xl font-semibold">导入完成</h3>
                  <p className="text-muted-foreground">
                    <span className="text-green-600">{importResult.success} 成功</span> ·{' '}
                    <span className="text-red-600">{importResult.failed} 失败</span>
                  </p>
                </>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="border rounded-lg p-4 bg-red-50">
                <h4 className="font-medium mb-2">错误详情</h4>
                <ul className="text-sm space-y-1">
                  {importResult.errors.slice(0, 10).map((error, idx) => (
                    <li key={idx}>第 {error.row} 行：{error.message}</li>
                  ))}
                  {importResult.errors.length > 10 && (
                    <li>...还有 {importResult.errors.length - 10} 个错误</li>
                  )}
                </ul>
              </div>
            )}

            <DialogFooter>
              <Button onClick={handleClose}>完成</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
