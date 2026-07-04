/**
 * Input: 出口合同 ID、salesService.checkPackingList（船司装箱单 PDF 比对 API）
 * Output: 装箱单核对对话框（上传 PDF → 汇总指标与明细行逐项比对 → 差异警示）
 * Pos: 出口合同详情页操作组件，覆盖「船司装箱单回传后与系统数据核对」环节
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  Loader2,
  MinusCircle,
  Upload,
} from 'lucide-react';
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
import { salesService, type PackingListCheckResult } from '@/services/sales.service';

interface PackingListCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractNo: string;
}

/** 职责：按比对状态渲染 ✓/✗/— 图标 */
function MatchIcon({ matched }: { matched: boolean | null }) {
  if (matched === null) return <MinusCircle className="h-4 w-4 text-muted-foreground/50" />;
  return matched ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  ) : (
    <AlertCircle className="h-4 w-4 text-red-600" />
  );
}

/**
 * 职责：船司装箱单 PDF 核对对话框
 * 思路：
 *   1. 选择 PDF → 上传到 /sales/:id/packing-list-check
 *   2. 展示汇总指标（合同号/箱数/毛重/净重/体积）与明细行比对结果
 *   3. 差异行红色警示；扫描件（无文本）由后端 422 报错提示人工核对
 */
export function PackingListCheckDialog({
  open,
  onOpenChange,
  contractId,
  contractNo,
}: PackingListCheckDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PackingListCheckResult | null>(null);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setResult(null);
      setFileName('');
      setChecking(false);
    }
  };

  /**
   * 职责：上传所选 PDF 并执行比对
   * @param file 用户选择的装箱单 PDF
   */
  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('请选择 PDF 格式的装箱单');
      return;
    }
    setFileName(file.name);
    setChecking(true);
    setResult(null);
    try {
      const res = await salesService.checkPackingList(contractId, file);
      if (res.data) {
        setResult(res.data);
        if (res.data.summary.ok) {
          toast.success('核对完成：未发现差异');
        } else {
          toast.warning('核对完成：存在差异，请查看警示项');
        }
      }
    } catch (error: unknown) {
      const apiMsg = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(apiMsg || '核对失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  const mismatchCount = result
    ? result.summary.fieldMismatched + result.summary.itemCheckMismatched
    : 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            船司装箱单核对
          </DialogTitle>
          <DialogDescription>
            合同 {contractNo}：上传船司回传的装箱单 PDF，系统将逐项比对合同号、箱数、毛重、净重、体积与明细数量。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-auto py-2">
          {/* 上传区 */}
          <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            id="packing-list-check-file"
            name="packingListCheckFile"
            type="file"
            accept="application/pdf"
            className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
                e.target.value = '';
              }}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={checking}
            >
              {checking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {checking ? '核对中...' : '选择装箱单 PDF'}
            </Button>
            {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
          </div>

          {/* 结果汇总横幅 */}
          {result && (
            <div
              className={
                result.summary.ok
                  ? 'flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700'
                  : 'flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
              }
            >
              {result.summary.ok ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              {result.summary.ok
                ? '装箱单与系统数据一致，未发现差异。'
                : `发现 ${mismatchCount} 处差异（汇总指标 ${result.summary.fieldMismatched} 处、明细 ${result.summary.itemCheckMismatched} 处），请与船司/货代核实后修正。`}
            </div>
          )}

          {/* 汇总指标比对 */}
          {result && (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">核对项</TableHead>
                    <TableHead className="text-right text-xs">系统数据</TableHead>
                    <TableHead className="text-right text-xs">装箱单最接近值</TableHead>
                    <TableHead className="w-16 text-center text-xs">结果</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.fields.map((field) => (
                    <TableRow
                      key={field.key}
                      className={field.matched === false ? 'bg-red-50/70' : ''}
                    >
                      <TableCell className="text-sm">{field.label}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {field.expected ?? <span className="text-xs text-muted-foreground">未录入</span>}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {field.matched === null ? '—' : field.closest ?? '未找到'}
                      </TableCell>
                      <TableCell className="text-center">
                        <MatchIcon matched={field.matched} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* 明细行比对 */}
          {result && result.items.length > 0 && (
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="text-xs">商品</TableHead>
                    <TableHead className="text-right text-xs">箱数</TableHead>
                    <TableHead className="w-14 text-center text-xs">箱数核对</TableHead>
                    <TableHead className="text-right text-xs">数量</TableHead>
                    <TableHead className="w-14 text-center text-xs">数量核对</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.items.map((item, idx) => (
                    <TableRow
                      key={`${item.productName}-${idx}`}
                      className={
                        item.boxes.matched === false || item.quantity.matched === false
                          ? 'bg-red-50/70'
                          : ''
                      }
                    >
                      <TableCell className="text-sm">{item.productName}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {item.boxes.expected ?? '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <MatchIcon matched={item.boxes.matched} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">
                        {item.quantity.expected ?? '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <MatchIcon matched={item.quantity.matched} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {result && (
            <p className="text-xs text-muted-foreground">
              核对基于 PDF 文本数值匹配（毛重/净重容差 ±1kg 或 0.5%，体积 ±0.05 或 1%）。
              核对通过后可在「源文件附件」中上传该 PDF 归档留存。
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
