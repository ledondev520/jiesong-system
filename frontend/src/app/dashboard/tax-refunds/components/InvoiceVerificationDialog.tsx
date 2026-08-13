/**
 * Input: 单份出口合同发票核验 Interface
 * Output: 发票号码、销方、价税合计、品名和异常原因逐票复核对话框
 * Pos: 出口退税工作台的发票核验明细 Module
 */

'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileSearch, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { taxRefundService, type ContractInvoiceVerification } from '@/services/taxRefund.service';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContractId: string;
  contractNo: string;
}

const statusMeta = {
  PASS: { label: '通过', className: 'border-emerald-200 bg-emerald-50 text-emerald-700', icon: CheckCircle2 },
  REVIEW: { label: '复核', className: 'border-amber-200 bg-amber-50 text-amber-700', icon: AlertTriangle },
  MISSING: { label: '缺票', className: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
} as const;

export function InvoiceVerificationDialog({ open, onOpenChange, salesContractId, contractNo }: Props) {
  const [verification, setVerification] = useState<ContractInvoiceVerification | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let active = true;
    void taxRefundService.getInvoiceVerification(salesContractId)
      .then((response) => { if (active) setVerification(response.data); })
      .catch(() => { if (active) toast.error('发票核验加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, salesContractId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSearch className="h-5 w-5 text-primary" />发票一致性核验
          </DialogTitle>
          <DialogDescription>
            {contractNo}：用完整发票号码精确匹配已导入的进项发票，并核对销方、价税合计、品名和票面状态。
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />正在核验发票...
          </div>
        ) : !verification ? (
          <div className="min-h-56 rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">暂无核验结果</div>
        ) : (
          <div className="min-h-0 flex-1 space-y-4 overflow-auto">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg border bg-emerald-50 p-3"><p className="text-xs text-emerald-700">通过</p><p className="text-2xl font-semibold text-emerald-800">{verification.summary.pass}</p></div>
              <div className="rounded-lg border bg-amber-50 p-3"><p className="text-xs text-amber-700">待复核</p><p className="text-2xl font-semibold text-amber-800">{verification.summary.review}</p></div>
              <div className="rounded-lg border bg-red-50 p-3"><p className="text-xs text-red-700">缺票</p><p className="text-2xl font-semibold text-red-800">{verification.summary.missing}</p></div>
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>结论</TableHead><TableHead>发票号码</TableHead><TableHead>预期销方 / 实际销方</TableHead>
                    <TableHead>预期品名 / 实际品名</TableHead><TableHead className="text-right">预期 / 实际价税合计</TableHead><TableHead>问题</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {verification.results.map((item, index) => {
                    const meta = statusMeta[item.status];
                    const Icon = meta.icon;
                    return (
                      <TableRow key={`${item.invoiceNo || 'missing'}-${index}`}>
                        <TableCell><Badge variant="outline" className={meta.className}><Icon className="mr-1 h-3 w-3" />{meta.label}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{item.invoiceNo || '未登记'}</TableCell>
                        <TableCell className="text-xs"><p>{item.expectedSellers.join('、') || '未登记'}</p><p className="text-muted-foreground">{item.actualSeller || '未查到'}</p></TableCell>
                        <TableCell className="text-xs"><p>{item.expectedItems.join('、') || '-'}</p><p className="text-muted-foreground">{item.actualItems || '未查到'}</p></TableCell>
                        <TableCell className="text-right text-xs tabular-nums"><p>{item.expectedTotal?.toLocaleString() ?? '-'}</p><p className="text-muted-foreground">{item.actualTotal?.toLocaleString() ?? '-'}</p></TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">{item.issues.join('；') || '无'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
