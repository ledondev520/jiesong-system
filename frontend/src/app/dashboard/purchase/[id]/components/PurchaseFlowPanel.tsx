/**
 * Input: 采购合同详情（含供应商/明细/付款记录）、付款与供应商发票准备 Interface
 * Output: 支持手机付款卡片的付款轨迹、汇款文本、催票清单、规范化发票号码和选填发票附件
 * Pos: 采购合同详情页子组件，覆盖「签合同 → 付定金 → 付尾款 → 催发票」链路动作
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { MobileListCard } from '@/components/mobile';
import { useMobile } from '@/lib/hooks/useMobile';
import { toast } from 'sonner';
import { invalidateCache } from '@/lib/api-cache';
import {
  Banknote,
  Copy,
  CreditCard,
  FileUp,
  Loader2,
  Plus,
  Receipt,
  ReceiptText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { PaymentDialog, type PaymentSubmitData } from '../../../finance/components/PaymentDialog';
import { financeService } from '@/services/finance.service';
import {
  purchaseService,
  type PurchaseInvoicePreparation,
} from '@/services/purchase.service';
import { uploadContractFile } from '@/services/contractFile.service';
import { PaymentType, type PurchaseContract } from '@/types';
import { calculatePurchaseLineAmounts, summarizePurchaseAmounts } from '@/lib/purchase-amount';

/** 付款用途选项：定金/尾款/自定义，决定汇款文本与默认金额 */
type RemitPurpose = 'deposit' | 'balance' | 'custom';

interface PurchaseFlowPanelProps {
  contract: PurchaseContract;
  /** 付款/发票登记成功后的回调（父组件重新加载合同） */
  onUpdated: () => void;
  /** 我方开票抬头信息（系统配置 invoiceTitleInfo，可为空） */
  invoiceTitleInfo?: string;
}

/**
 * 职责：复制文本到剪贴板并 toast 提示
 * @param text 待复制文本
 */
const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  } catch {
    toast.error('复制失败，请手动选择文本复制');
  }
};

const formatMoney = (n: number) => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * 职责：渲染采购合同的付款与发票操作面板
 * 思路：
 *   1. 展示该合同的付款记录（定金/尾款时间轨迹）
 *   2. 「复制汇款信息」按用途（定金/尾款/自定义）拼接供应商收款信息文本
 *   3. 「登记付款」复用 PaymentDialog 写入 finance/payments
 *   4. 「催开发票」生成开票信息文本 + 登记发票号（PurchaseContract.invoiceNo）
 */
export function PurchaseFlowPanel({ contract, onUpdated, invoiceTitleInfo }: PurchaseFlowPanelProps) {
  const isMobile = useMobile();
  const invoiceFileInputRef = useRef<HTMLInputElement>(null);
  const [remitOpen, setRemitOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  // 汇款用途与金额（定金默认 30%）
  const [remitPurpose, setRemitPurpose] = useState<RemitPurpose>('deposit');
  const [depositRate, setDepositRate] = useState('30');
  const [customAmount, setCustomAmount] = useState('');

  // 发票号码与选填原件使用同一弹窗完成，避免再建平行发票页面。
  const [invoiceNoInput, setInvoiceNoInput] = useState(contract.invoiceNo || '');
  const [savingInvoiceNo, setSavingInvoiceNo] = useState(false);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [invoicePreparation, setInvoicePreparation] = useState<PurchaseInvoicePreparation | null>(null);

  const supplier = contract.supplier;
  const items = useMemo(() => contract.items ?? [], [contract.items]);
  const payments = useMemo(
    () => (contract.payments ?? []).slice().sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1)),
    [contract.payments],
  );

  const amountSummary = useMemo(() => summarizePurchaseAmounts({
    items,
    taxRate: contract.taxRate,
    totalAmount: contract.totalAmount,
    paidAmount: contract.paidAmount,
  }), [items, contract.taxRate, contract.totalAmount, contract.paidAmount]);
  const remaining = amountSummary.remainingAmount;
  // 购销合同号：PO 前缀转 CG（与购销合同文档编号规则一致）
  const cgNo = contract.contractNo?.replace('PO', 'CG') || contract.contractNo;

  useEffect(() => {
    setInvoiceNoInput(String(contract.invoiceNo || '').replace(/[，,;；\s]+/g, '\n').trim());
  }, [contract.invoiceNo]);

  const invoiceNumbers = useMemo(() => (
    String(contract.invoiceNo || '')
      .split(/[\s,，;；]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  ), [contract.invoiceNo]);

  // 1. 按用途推导汇款金额
  const remitAmount = useMemo(() => {
    if (remitPurpose === 'deposit') {
      const rate = Number.parseFloat(depositRate) || 0;
      return Math.round(amountSummary.grossAmount * rate) / 100;
    }
    if (remitPurpose === 'balance') {
      return remaining;
    }
    return Number.parseFloat(customAmount) || 0;
  }, [remitPurpose, depositRate, customAmount, amountSummary.grossAmount, remaining]);

  const purposeLabel =
    remitPurpose === 'deposit'
      ? `定金（${depositRate || 0}%）`
      : remitPurpose === 'balance'
        ? '尾款'
        : '付款';

  // 2. 汇款信息文本（户名/开户行/账号 + 合同号 + 金额）
  const remitText = useMemo(() => {
    const lines = [
      '【汇款信息】',
      `收款户名：${supplier?.bankAccountName || supplier?.name || '（未录入）'}`,
      `开户银行：${supplier?.bankName || '（未录入，请在供应商档案补充）'}`,
      `开户支行：${supplier?.bankBranch || '（未录入，请在供应商档案补充）'}`,
      `联行号/银行编号：${supplier?.bankCode || '（未录入，请在供应商档案补充）'}`,
      `银行账号：${supplier?.bankAccount || '（未录入，请在供应商档案补充）'}`,
      `付款事由：购销合同 ${cgNo} ${purposeLabel}`,
      `付款金额：${formatMoney(remitAmount)}`,
    ];
    return lines.join('\n');
  }, [supplier, cgNo, purposeLabel, remitAmount]);

  // 3. 开票信息文本（品名/单位/数量/金额/税点 + 我方抬头）
  const invoiceText = useMemo(() => {
    const contractTotalDiffers = amountSummary.issues.some(
      (issue) => issue.code === 'CONTRACT_LINE_MISMATCH',
    );
    const lines = [
      `【开票信息】购销合同 ${cgNo}`,
      `销方（供应商）：${supplier?.name || '—'}`,
      '—— 商品明细 ——',
      ...items.map((item, idx) => {
        const lineTotal = calculatePurchaseLineAmounts(item, amountSummary.taxRate).grossAmount;
        const unit = item.unit || item.product?.unit || '';
        return `${idx + 1}. ${item.product?.customsName || '未知商品'}｜${item.quantity}${unit}｜不含税单价 ${formatMoney(Number(item.unitPrice) || 0)}｜含税金额 ${formatMoney(lineTotal)}`;
      }),
      `不含税合计：${formatMoney(amountSummary.netAmount)}`,
      `税率：${amountSummary.taxRate}%（增值税专用发票）`,
      `税额：${formatMoney(amountSummary.taxAmount)}`,
      `价税合计（按商品明细）：${formatMoney(amountSummary.lineGrossAmount)}`,
    ];
    if (contractTotalDiffers) {
      lines.push(
        `合同含税总额：${formatMoney(amountSummary.grossAmount)}`,
        '金额提示：合同总额与商品明细不一致，请先按原合同复核，确认后再开票。',
      );
    }
    if (invoiceTitleInfo?.trim()) {
      lines.push('—— 购方开票抬头 ——', invoiceTitleInfo.trim());
    }
    lines.push('请开具增值税专用发票后回传发票号码，谢谢！');
    return lines.join('\n');
  }, [cgNo, supplier, items, amountSummary, invoiceTitleInfo]);

  /**
   * 职责：登记一笔付款（定金/尾款）到收付管理
   * @param data PaymentDialog 提交的金额/日期/方式/备注
   */
  const handleCreatePayment = async (data: PaymentSubmitData) => {
    try {
      await financeService.createPayment({
        type: PaymentType.PAYABLE,
        purchaseContractId: contract.id,
        amount: data.amount,
        currency: 'CNY',
        paymentMethod: data.paymentMethod,
        paymentDate: data.paymentDate.toISOString(),
        note: data.note || undefined,
      });
      invalidateCache('purchase-contracts-list');
      invalidateCache('fin-payables');
      invalidateCache('fin-stats');
      toast.success('付款已登记');
      setPayOpen(false);
      onUpdated();
    } catch {
      toast.error('登记付款失败');
    }
  };

  /**
   * 职责：保存发票号到采购合同（催票后登记）
   */
  const handleSaveInvoiceNo = async () => {
    const values = invoiceNoInput
      .split(/[\s,，;；]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (values.length === 0) {
      toast.error('请输入发票号码');
      return;
    }
    setSavingInvoiceNo(true);
    try {
      const response = await purchaseService.registerInvoiceNumbers(contract.id, values);
      if (response.data) {
        setInvoicePreparation(response.data);
        setInvoiceNoInput(response.data.invoiceNumbers.join('\n'));
      }
      toast.success('供应商发票号码已登记');
      await Promise.resolve(onUpdated());
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || '登记发票号失败');
    } finally {
      setSavingInvoiceNo(false);
    }
  };

  const handleInvoiceOpenChange = (next: boolean) => {
    setInvoiceOpen(next);
    if (!next) return;
    setLoadingInvoice(true);
    void purchaseService.getInvoicePreparation(contract.id)
      .then((response) => {
        if (!response.data) return;
        setInvoicePreparation(response.data);
        setInvoiceNoInput(response.data.invoiceNumbers.join('\n'));
      })
      .catch(() => toast.error('发票准备状态加载失败'))
      .finally(() => setLoadingInvoice(false));
  };

  const handleInvoiceFileUpload = async (file: File) => {
    setUploadingInvoice(true);
    try {
      const response = await uploadContractFile(
        contract.id,
        'PURCHASE',
        file,
        '供应商发票原件（选填）',
        'SUPPLIER_INVOICE',
      );
      if (response.data) {
        setInvoicePreparation((current) => current ? {
          ...current,
          invoiceFiles: [response.data!, ...current.invoiceFiles.filter((item) => item.id !== response.data?.id)],
        } : current);
      }
      toast.success('供应商发票附件已归档');
      await Promise.resolve(onUpdated());
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '供应商发票附件上传失败');
    } finally {
      setUploadingInvoice(false);
      if (invoiceFileInputRef.current) invoiceFileInputRef.current.value = '';
    }
  };

  return (
    <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <CreditCard className="h-4 w-4" />
            付款与发票
          </CardTitle>
          <CardDescription className="mt-1">
            已付 {formatMoney(amountSummary.paidAmount)} / 合同含税额 {formatMoney(amountSummary.grossAmount)}
            {amountSummary.overpaidAmount > 0
              ? `，超付 ${formatMoney(amountSummary.overpaidAmount)}`
              : remaining > 0 ? `，待付 ${formatMoney(remaining)}` : '，已付清'}
            {invoiceNumbers.length > 0 ? (
              <Badge variant="outline" className="ml-2 border-emerald-300 bg-emerald-50 text-emerald-700">
                已登记 {invoiceNumbers.length} 个发票号
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-2 border-amber-300 bg-amber-50 text-amber-700">
                未登记发票
              </Badge>
            )}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setRemitOpen(true)}>
            <Copy className="mr-1.5 h-3.5 w-3.5" />
            复制汇款信息
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setPayOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            登记付款
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => handleInvoiceOpenChange(true)}>
            <ReceiptText className="mr-1.5 h-3.5 w-3.5" />
            催开发票
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <div className="rounded-lg bg-muted/40 py-6 text-center text-sm text-muted-foreground">
            暂无付款记录。付定金后点击「登记付款」，系统将自动计算剩余尾款。
          </div>
        ) : isMobile ? (
          <div className="space-y-3">
            {payments.map((payment) => (
              <MobileListCard
                key={payment.id}
                title={format(new Date(payment.paymentDate), 'yyyy-MM-dd')}
                subtitle={payment.note || '无备注'}
                fields={[{ label: '付款方式', value: payment.paymentMethod || '—' }]}
                amount={{ label: '付款金额', value: formatMoney(payment.amount) }}
              />
            ))}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-b border-border/60 bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs">付款日期</TableHead>
                <TableHead className="text-right text-xs">金额</TableHead>
                <TableHead className="text-xs">方式</TableHead>
                <TableHead className="text-xs">备注</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id} className="border-b border-border/30">
                  <TableCell className="text-sm">
                    {format(new Date(payment.paymentDate), 'yyyy-MM-dd')}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {formatMoney(payment.amount)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.paymentMethod || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{payment.note || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* 复制汇款信息弹窗 */}
      <Dialog open={remitOpen} onOpenChange={setRemitOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Banknote className="h-5 w-5 text-primary" />
              复制汇款信息
            </DialogTitle>
            <DialogDescription>
              选择付款用途后复制文本，发给银行或财务执行汇款。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="remit-purpose">付款用途</Label>
                <Select value={remitPurpose} onValueChange={(v) => setRemitPurpose(v as RemitPurpose)}>
                  <SelectTrigger id="remit-purpose">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deposit">定金</SelectItem>
                    <SelectItem value="balance">尾款（待付全额）</SelectItem>
                    <SelectItem value="custom">自定义金额</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {remitPurpose === 'deposit' && (
                <div className="space-y-2">
                  <Label htmlFor="remit-deposit-rate">定金比例 (%)</Label>
                  <Input
                    id="remit-deposit-rate"
                    type="number"
                    min="0"
                    max="100"
                    value={depositRate}
                    onChange={(e) => setDepositRate(e.target.value)}
                  />
                </div>
              )}
              {remitPurpose === 'custom' && (
                <div className="space-y-2">
                  <Label htmlFor="remit-custom-amount">金额 (¥)</Label>
                  <Input
                    id="remit-custom-amount"
                    type="number"
                    min="0"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                  />
                </div>
              )}
            </div>
            <Textarea readOnly value={remitText} className="min-h-[160px] font-mono text-xs" />
            {(!supplier?.bankAccountName || !supplier?.bankName || !supplier?.bankBranch || !supplier?.bankCode || !supplier?.bankAccount) && (
              <p className="text-xs text-amber-600">
                供应商收款信息不完整，请先在「供应商管理」补录户名、银行、支行、联行号和账号。
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemitOpen(false)}>
              关闭
            </Button>
            <Button onClick={() => void copyText(remitText)}>
              <Copy className="mr-1.5 h-4 w-4" />
              复制文本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 登记付款弹窗（复用收付管理的 PaymentDialog） */}
      <PaymentDialog
        open={payOpen}
        onOpenChange={setPayOpen}
        type={PaymentType.PAYABLE}
        contractNo={contract.contractNo}
        contractId={contract.id}
        remainingAmount={remaining}
        onSubmit={handleCreatePayment}
      />

      {/* 催开发票弹窗 */}
      <Dialog open={invoiceOpen} onOpenChange={handleInvoiceOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              催开发票
            </DialogTitle>
            <DialogDescription>
              将清单发给供应商开具增值税专用发票；号码必须登记，原件附件选填。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Textarea readOnly value={invoiceText} className="min-h-[220px] font-mono text-xs" />
            <Button variant="outline" size="sm" onClick={() => void copyText(invoiceText)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              复制开票信息
            </Button>
            {loadingInvoice ? (
              <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />正在读取已登记发票...
              </div>
            ) : invoicePreparation?.issues.some((issue) => issue.code !== 'MISSING_INVOICE_NUMBER') ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                {invoicePreparation.issues
                  .filter((issue) => issue.code !== 'MISSING_INVOICE_NUMBER')
                  .map((issue) => issue.message)
                  .join('；')}
              </div>
            ) : null}
            <div className="space-y-2 border-t pt-4">
              <Label htmlFor="invoice-no-input">发票号码登记（每行或逗号分隔）</Label>
              <div className="flex items-end gap-2">
                <Textarea
                  id="invoice-no-input"
                  rows={3}
                  placeholder={'例如：\n25442000000012345678\n25442000000012345679'}
                  value={invoiceNoInput}
                  onChange={(e) => setInvoiceNoInput(e.target.value)}
                />
                <Button onClick={handleSaveInvoiceNo} disabled={savingInvoiceNo}>
                  {savingInvoiceNo ? '保存中...' : '保存'}
                </Button>
              </div>
            </div>
            <div className="space-y-2 border-t pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>供应商发票原件（选填）</Label>
                  <p className="mt-1 text-xs text-muted-foreground">不上传文件也可完成号码登记；上传后按供应商发票分类归档。</p>
                </div>
                <input
                  ref={invoiceFileInputRef}
                  id="supplier-invoice-file-input"
                  name="supplierInvoiceFile"
                  type="file"
                  className="hidden"
                  aria-label="上传供应商发票原件"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleInvoiceFileUpload(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploadingInvoice}
                  onClick={() => invoiceFileInputRef.current?.click()}
                >
                  {uploadingInvoice
                    ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    : <FileUp className="mr-1.5 h-3.5 w-3.5" />}
                  {uploadingInvoice ? '上传中...' : '上传发票原件'}
                </Button>
              </div>
              {(invoicePreparation?.invoiceFiles.length || 0) > 0 && (
                <div className="flex flex-wrap gap-2">
                  {invoicePreparation?.invoiceFiles.map((file) => (
                    <Badge key={file.id} variant="secondary" className="max-w-full truncate">{file.fileName}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
