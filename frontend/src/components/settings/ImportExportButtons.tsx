/**
 * Input: 数据数组、文件名、导入回调
 * Output: Excel 导入/导出按钮组
 * Pos: 设置模块数据表格工具栏
 */

'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Upload, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ImportExportButtonsProps<T extends Record<string, unknown>> {
  data: T[];
  filename: string;
  columns: { key: string; label: string }[];
  onImport: (rows: Array<Record<string, unknown>>) => Promise<void>;
  importPreviewRows?: number;
}

export function ImportExportButtons<T extends Record<string, unknown>>({
  data,
  filename,
  columns,
  onImport,
  importPreviewRows = 5,
}: ImportExportButtonsProps<T>) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewRows, setPreviewRows] = useState<Array<Record<string, unknown>>>([]);
  const [allImportRows, setAllImportRows] = useState<Array<Record<string, unknown>>>([]);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = () => {
    if (data.length === 0) {
      toast.error('暂无数据可导出');
      return;
    }
    const sheetData = data.map((row) => {
      const obj: Record<string, unknown> = {};
      columns.forEach((col) => {
        obj[col.label] = row[col.key];
      });
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(sheetData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);
    toast.success('导出成功');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) return;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { header: columns.map((c) => c.label) });
        // 跳过标题行
        const rows = json.slice(1) as T[];
        setPreviewRows(rows.slice(0, importPreviewRows));
        setAllImportRows(rows);
        setImportDialogOpen(true);
      } catch {
        toast.error('文件解析失败，请检查格式');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    const allRows = allImportRows.length > 0 ? allImportRows : previewRows;
    if (allRows.length === 0) {
      toast.error('没有可导入的数据');
      return;
    }
    setImporting(true);
    try {
      await onImport(allRows);
      toast.success('导入成功');
      setImportDialogOpen(false);
    } catch {
      toast.error('导入失败');
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
          导出 Excel
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          导入 Excel
        </Button>
        <input ref={fileRef} id="import-file-input" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
      </div>

      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              导入预览
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              共检测到 {allImportRows.length} 条记录，预览前 {previewRows.length} 条：
            </p>
            <ScrollArea className="h-48 rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => (
                    <tr key={i} className="border-t">
                      {columns.map((col) => (
                        <td key={col.key} className="px-3 py-2 text-xs">
                          {String(row[col.key] ?? '-')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(false)}>取消</Button>
            <Button size="sm" onClick={handleImport} disabled={importing}>
              {importing ? '导入中...' : '确认导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
