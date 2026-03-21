/**
 * Input: opsExecutionService（门店采购清单模板 API）
 * Output: 门店采购清单Tab组件（生成、保存模板、一键导出）
 * Pos: 经营执行中台 - 门店采购清单子Tab
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import { ClipboardList, Download, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  opsExecutionService,
  type PurchaseChecklistResult,
} from '@/services/opsExecution.service';

const STORE_TYPE_OPTIONS = ['标准店', '旗舰店'] as const;
const OPENING_STAGE_OPTIONS = ['筹备期', '试营业', '正式营业'] as const;

/**
 * 职责：渲染门店采购清单Tab
 * 思路：
 *   1. 用户选择店型和开店阶段
 *   2. 点击生成，调接口返回采购清单
 *   3. 支持修改模板名并保存/一键导出
 */
export function PurchaseChecklistTab() {
  const [storeType, setStoreType] = useState<(typeof STORE_TYPE_OPTIONS)[number]>('标准店');
  const [openingStage, setOpeningStage] = useState<(typeof OPENING_STAGE_OPTIONS)[number]>('筹备期');
  const [templateName, setTemplateName] = useState('标准店-筹备期');
  const [result, setResult] = useState<PurchaseChecklistResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const response = await opsExecutionService.generatePurchaseChecklist({
        storeType,
        openingStage,
      });
      const next = response.data || null;
      setResult(next);
      if (next?.templateName) setTemplateName(next.templateName);
    } catch {
      toast.error('生成采购清单失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!result) { toast.error('请先生成采购清单'); return; }
    setSaving(true);
    try {
      await opsExecutionService.savePurchaseChecklistTemplate({
        storeType,
        openingStage,
        templateName: templateName.trim() || result.templateName,
        items: result.items,
      });
      toast.success('模板已保存');
    } catch {
      toast.error('模板保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    if (!result) { toast.error('请先生成采购清单'); return; }
    setExporting(true);
    try {
      await opsExecutionService.exportPurchaseChecklist({
        storeType,
        openingStage,
        templateName: templateName.trim() || result.templateName,
        items: result.items,
      });
      toast.success('采购清单已导出');
    } catch {
      toast.error('导出采购清单失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>门店采购清单模块</CardTitle>
        <CardDescription>按店型和开店阶段生成采购项，并支持模板保存与一键导出。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 操作栏 */}
        <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)_auto_auto_auto]">
          <Select
            value={storeType}
            onValueChange={(value) => setStoreType(value as (typeof STORE_TYPE_OPTIONS)[number])}
          >
            <SelectTrigger aria-label="店型选择">
              <SelectValue placeholder="店型" />
            </SelectTrigger>
            <SelectContent>
              {STORE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={openingStage}
            onValueChange={(value) => setOpeningStage(value as (typeof OPENING_STAGE_OPTIONS)[number])}
          >
            <SelectTrigger aria-label="开店阶段选择">
              <SelectValue placeholder="开店阶段" />
            </SelectTrigger>
            <SelectContent>
              {OPENING_STAGE_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>{option}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            aria-label="采购清单模板名"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder="模板名称"
          />

          <Button onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            生成采购清单
          </Button>

          <Button variant="outline" disabled={saving || !result} onClick={() => void handleSaveTemplate()}>
            <Save className="mr-2 h-4 w-4" />
            保存模板
          </Button>

          <Button variant="outline" disabled={exporting || !result} onClick={() => void handleExport()}>
            <Download className="mr-2 h-4 w-4" />
            一键导出
          </Button>
        </div>

        {/* 结果区 */}
        {!result ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <ClipboardList className="h-8 w-8" />
            <p>选择店型和开店阶段后生成采购清单。</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 汇总KPI */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">采购项总数</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{result.summary.totalItems}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">必备项</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-primary">{result.summary.requiredCount}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">可选项</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{result.summary.optionalCount}</div>
                </CardContent>
              </Card>
            </div>

            {/* 采购项明细表 */}
            <div className="surface-panel overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>分类</TableHead>
                    <TableHead>采购项</TableHead>
                    <TableHead className="text-right">数量</TableHead>
                    <TableHead>备注</TableHead>
                    <TableHead className="w-[90px]">属性</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className="font-medium">{item.itemName}</TableCell>
                      <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                      <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={item.required ? 'default' : 'outline'}>
                          {item.required ? '必备' : '可选'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
