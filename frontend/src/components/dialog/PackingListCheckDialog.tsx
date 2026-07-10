/**
 * Input: 出口合同、船司 PDF 持久化核对 Interface 与人工复核说明
 * Output: 原件上传、逐商品差异、核对历史和最终结论对话框
 * Pos: 出口合同详情页的船司装箱单核对 Module
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  History,
  Loader2,
  MinusCircle,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { getContractFileDownloadUrl } from '@/services/contractFile.service';
import {
  salesService,
  type PackingListCheckRecord,
  type PackingListCheckStatus,
} from '@/services/sales.service';
import { cn } from '@/lib/utils';

interface PackingListCheckDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractId: string;
  contractNo: string;
  onChanged?: () => void | Promise<void>;
}

const STATUS_META: Record<PackingListCheckStatus, { label: string; className: string }> = {
  PASSED: { label: '自动核对通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  DIFFERENCE: { label: '存在差异', className: 'border-red-200 bg-red-50 text-red-700' },
  NEEDS_MANUAL_REVIEW: { label: '待人工核对', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  APPROVED: { label: '人工确认通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  REJECTED: { label: '人工复核未通过', className: 'border-red-200 bg-red-50 text-red-700' },
};

function MatchIcon({ matched }: { matched: boolean | null }) {
  if (matched === null) return <MinusCircle className="h-4 w-4 text-muted-foreground/50" />;
  return matched ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  ) : (
    <AlertCircle className="h-4 w-4 text-red-600" />
  );
}

export function PackingListCheckDialog({
  open,
  onOpenChange,
  contractId,
  contractNo,
  onChanged,
}: PackingListCheckDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [checking, setChecking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [history, setHistory] = useState<PackingListCheckRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<PackingListCheckRecord | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingHistory(true);
    void salesService.listPackingListChecks(contractId, 20)
      .then((response) => {
        if (!active) return;
        const records = response.data || [];
        setHistory(records);
        setSelectedRecord(records[0] || null);
        setReviewNote(records[0]?.reviewNote || '');
      })
      .catch(() => {
        if (active) toast.error('核对历史加载失败');
      })
      .finally(() => {
        if (active) setLoadingHistory(false);
      });
    return () => { active = false; };
  }, [contractId, open]);

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setHistory([]);
      setSelectedRecord(null);
      setReviewNote('');
      setFileName('');
      setChecking(false);
    }
  };

  const handleFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('请选择 PDF 格式的装箱单');
      return;
    }
    setFileName(file.name);
    setChecking(true);
    try {
      const response = await salesService.checkPackingList(contractId, file);
      if (!response.data) return;
      const record = response.data;
      setSelectedRecord(record);
      setReviewNote(record.reviewNote || '');
      setHistory((previous) => [record, ...previous.filter((item) => item.id !== record.id)]);
      void onChanged?.();
      if (record.status === 'PASSED') toast.success('核对通过，原 PDF 和结果已归档');
      else if (record.status === 'NEEDS_MANUAL_REVIEW') toast.warning('PDF 无可提取文本，原件已归档并转人工核对');
      else toast.warning('发现差异，原 PDF 和逐项结果已归档');
    } catch (error: unknown) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(apiMessage || '核对失败，请稍后重试');
    } finally {
      setChecking(false);
    }
  };

  const handleReview = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedRecord) return;
    const note = reviewNote.trim();
    if (!note) {
      toast.error('请填写人工核对说明');
      return;
    }
    setReviewing(true);
    try {
      const response = await salesService.reviewPackingListCheck(
        contractId,
        selectedRecord.id,
        decision,
        note,
      );
      if (!response.data) return;
      const updated = response.data;
      setSelectedRecord(updated);
      setHistory((previous) => previous.map((item) => item.id === updated.id ? updated : item));
      void onChanged?.();
      toast.success(decision === 'APPROVED' ? '已保存人工通过结论' : '已保存人工驳回结论');
    } catch (error: unknown) {
      const apiMessage = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(apiMessage || '人工核对结论保存失败');
    } finally {
      setReviewing(false);
    }
  };

  const selectHistoryRecord = (record: PackingListCheckRecord) => {
    setSelectedRecord(record);
    setReviewNote(record.reviewNote || '');
  };

  const result = selectedRecord?.comparison || null;
  const statusMeta = selectedRecord ? STATUS_META[selectedRecord.status] : null;
  const mismatchCount = result
    ? result.summary.fieldMismatched + result.summary.itemCheckMismatched
    : 0;
  const requiresManualDecision = selectedRecord
    ? ['DIFFERENCE', 'NEEDS_MANUAL_REVIEW', 'REJECTED'].includes(selectedRecord.status)
    : false;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />
            船司装箱单核对
          </DialogTitle>
          <DialogDescription>
            合同 {contractNo}：上传后自动归档原 PDF，并保存合同号、箱重体积及逐商品身份/箱数/数量差异。
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 border-b pb-3">
          <input
            ref={fileInputRef}
            id="packing-list-check-file"
            name="packingListCheckFile"
            type="file"
            accept="application/pdf"
            aria-label="上传船司装箱单 PDF"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = '';
            }}
          />
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {checking ? '核对并归档中...' : '选择装箱单 PDF'}
          </Button>
          {fileName && <span className="truncate text-sm text-muted-foreground">{fileName}</span>}
        </div>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto py-2 lg:grid-cols-[240px_minmax(0,1fr)] lg:overflow-hidden">
          <aside className="space-y-2 lg:overflow-auto lg:pr-1">
            <div className="flex items-center gap-2 text-sm font-medium">
              <History className="h-4 w-4" />
              核对历史
            </div>
            {loadingHistory ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />加载中...
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">暂无核对记录</div>
            ) : (
              history.map((record) => {
                const meta = STATUS_META[record.status];
                return (
                  <button
                    key={record.id}
                    type="button"
                    aria-label={`查看核对记录 ${record.file.fileName} ${meta.label}`}
                    onClick={() => selectHistoryRecord(record)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                      selectedRecord?.id === record.id && 'border-primary bg-primary/5',
                    )}
                  >
                    <p className="truncate text-sm font-medium">{record.file.fileName}</p>
                    <Badge variant="outline" className={cn('mt-2 text-[10px]', meta.className)}>{meta.label}</Badge>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      {new Date(record.checkedAt).toLocaleString('zh-CN', { hour12: false })}
                    </p>
                  </button>
                );
              })
            )}
          </aside>

          <section className="min-w-0 space-y-4 lg:overflow-auto lg:pr-1">
            {!selectedRecord ? (
              <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed text-muted-foreground">
                <FileSearch className="mb-2 h-8 w-8 opacity-40" />
                <p className="text-sm">选择 PDF 开始核对，结果会自动留存</p>
              </div>
            ) : (
              <>
                <div className={cn('rounded-lg border px-4 py-3 text-sm', statusMeta?.className)}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-medium">
                      {['PASSED', 'APPROVED'].includes(selectedRecord.status)
                        ? <CheckCircle2 className="h-5 w-5" />
                        : <AlertCircle className="h-5 w-5" />}
                      {selectedRecord.status === 'DIFFERENCE'
                        ? `发现 ${mismatchCount} 处差异`
                        : statusMeta?.label}
                    </div>
                    <Button variant="ghost" size="sm" className="h-7" asChild>
                      <a href={getContractFileDownloadUrl(selectedRecord.file.id)} target="_blank" rel="noreferrer">
                        <ExternalLink className="mr-1.5 h-3.5 w-3.5" />打开原件
                      </a>
                    </Button>
                  </div>
                  <p className="mt-1 text-xs opacity-80">
                    原 PDF 已归档到「源文件附件」，本次逐项结果与核对人会持续留存。
                  </p>
                  {selectedRecord.reviewNote && (
                    <p className="mt-2 border-t pt-2 text-xs">
                      人工说明：{selectedRecord.reviewNote}
                      {selectedRecord.reviewedBy?.name ? `（${selectedRecord.reviewedBy.name}）` : ''}
                    </p>
                  )}
                </div>

                {result?.summary.manualReviewRequired && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    该 PDF 可能是扫描件或图片型文件，系统未提取到足够文本。原件已保留，请打开原件后填写人工核对结论。
                  </div>
                )}

                {result && result.fields.length > 0 && (
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
                          <TableRow key={field.key} className={field.matched === false ? 'bg-red-50/70' : ''}>
                            <TableCell className="text-sm">{field.label}</TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {field.expected ?? <span className="text-xs text-muted-foreground">未录入</span>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">
                              {field.matched === null ? '—' : field.closest ?? '未找到'}
                            </TableCell>
                            <TableCell className="text-center"><MatchIcon matched={field.matched} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {result && result.items.length > 0 && (
                  <div className="overflow-hidden rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs">商品</TableHead>
                          <TableHead className="w-16 text-center text-xs">身份</TableHead>
                          <TableHead className="text-right text-xs">箱数</TableHead>
                          <TableHead className="w-16 text-center text-xs">核对</TableHead>
                          <TableHead className="text-right text-xs">数量</TableHead>
                          <TableHead className="w-16 text-center text-xs">核对</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.items.map((item, index) => (
                          <TableRow
                            key={`${item.packingItemId || item.productName}-${index}`}
                            className={
                              item.identity.matched === false
                              || item.boxes.matched === false
                              || item.quantity.matched === false
                                ? 'bg-red-50/70'
                                : ''
                            }
                          >
                            <TableCell className="text-sm">
                              <p>{item.productName}</p>
                              {item.hsCode && <p className="font-mono text-[11px] text-muted-foreground">{item.hsCode}</p>}
                            </TableCell>
                            <TableCell className="text-center"><MatchIcon matched={item.identity.matched} /></TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">{item.boxes.expected ?? '—'}</TableCell>
                            <TableCell className="text-center"><MatchIcon matched={item.boxes.matched} /></TableCell>
                            <TableCell className="text-right font-mono text-sm tabular-nums">{item.quantity.expected ?? '—'}</TableCell>
                            <TableCell className="text-center"><MatchIcon matched={item.quantity.matched} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {requiresManualDecision && (
                  <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                    <div className="space-y-2">
                      <Label htmlFor="packing-list-review-note">人工核对说明</Label>
                      <Textarea
                        id="packing-list-review-note"
                        rows={3}
                        maxLength={1000}
                        placeholder="写明与船司/货代确认的差异、修正依据或扫描件人工核对结果"
                        value={reviewNote}
                        onChange={(event) => setReviewNote(event.target.value)}
                      />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button variant="destructive" onClick={() => void handleReview('REJECTED')} disabled={reviewing}>
                        人工确认不通过
                      </Button>
                      <Button onClick={() => void handleReview('APPROVED')} disabled={reviewing}>
                        {reviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        人工确认通过
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <p className="mr-auto text-xs text-muted-foreground">
            数值容差：毛/净重 ±1kg 或 0.5%，体积 ±0.05 或 1%；商品必须先命中品名或 10 位 HS 才比对该行数值。
          </p>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
