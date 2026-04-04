/**
 * Input: 系统导出服务（exportSystemData）
 * Output: 数据导出选择与下载表单
 * Pos: 设置页 > 数据导出 Tab，允许管理员按模块导出 CSV
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { exportSystemData, type SystemExportType } from '@/services/system.service';

const exportTargets: Array<{ type: SystemExportType; label: string; desc: string }> = [
  { type: 'suppliers', label: '供应商', desc: '导出供应商主数据与别名信息' },
  { type: 'stores', label: '门店', desc: '导出门店与港口基础数据' },
  { type: 'products', label: '商品', desc: '导出商品主数据与分类信息' },
  { type: 'purchases', label: '采购合同', desc: '导出采购合同与付款状态' },
  { type: 'sales', label: '出口合同', desc: '导出出口合同、装箱明细与收款状态' },
  { type: 'inventory', label: '库存', desc: '导出库存状态与关联合同' },
  { type: 'payments', label: '收付款', desc: '导出财务收付款记录' },
];

/**
 * 职责：渲染数据导出类型选择器与下载触发按钮
 */
export function DataExportTab() {
  const [selectedExportType, setSelectedExportType] = useState<SystemExportType>('suppliers');
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    const target = exportTargets.find((item) => item.type === selectedExportType);
    const label = target?.label ?? selectedExportType;

    setExporting(true);
    try {
      await exportSystemData(selectedExportType, `${label}.csv`);
      toast.success(`${label}数据导出成功`);
    } catch (error) {
      const message = error instanceof Error ? error.message : '导出失败';
      toast.error(message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>数据导出</CardTitle>
          <CardDescription>选择导出类型后生成并下载对应 CSV 文件，支持按业务模块分别导出。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">导出类型</label>
            <Select
              value={selectedExportType}
              onValueChange={(value) => setSelectedExportType(value as SystemExportType)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择导出类型" />
              </SelectTrigger>
              <SelectContent>
                {exportTargets.map((target) => (
                  <SelectItem key={target.type} value={target.type}>
                    {target.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedExportType && (
            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              {exportTargets.find((target) => target.type === selectedExportType)?.desc}
            </div>
          )}

          <Button
            className="w-full"
            onClick={handleExport}
            disabled={exporting}
            data-testid="system-export-button"
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? '导出中...' : '导出数据'}
          </Button>
        </CardContent>
      </Card>

      <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">导出说明</p>
        <p>• 导出文件为 UTF-8 编码的 CSV 格式，可用 Excel 打开（注意设置编码）。</p>
        <p>• 导出操作会被记录到系统日志，可在「运维中心 → 系统日志」中查看。</p>
      </div>
    </div>
  );
}
