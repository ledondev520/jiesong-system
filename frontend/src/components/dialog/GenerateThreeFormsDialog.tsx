/**
 * Input: 出口合同 ID
 * Output: 一键生成三张表（报关单、外汇核销、出口退税）
 * Pos: 出口合同详情页操作组件
 */

'use client';

import { useState } from 'react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hsCodeService, type BatchHsCodeMatchResult } from '@/services/hsCode.service';
import { threeFormsService, type ThreeFormsGenerateInput } from '@/services/threeForms.service';
import { toast } from 'sonner';
import { FileText, DollarSign, ReceiptText, CheckCircle2, AlertCircle, XCircle, Loader2 } from 'lucide-react';
import type { SalesContract, PackingItem } from '@/types';

interface GenerateThreeFormsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContract: SalesContract & { packingItems?: PackingItem[] };
  onGenerated?: (forms: { customsDeclarationId?: string; forexId?: string; taxRefundId?: string }) => void;
}

interface ProductWithHSCode extends PackingItem {
  hsCodeMatch?: BatchHsCodeMatchResult;
}

const THREE_FORMS_CONFIG = [
  {
    id: 'customs',
    name: '报关单',
    icon: FileText,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    description: '海关出口货物报关单',
  },
  {
    id: 'forex',
    name: '外汇核销',
    icon: DollarSign,
    color: 'text-green-500',
    bgColor: 'bg-green-50',
    description: '出口收汇核销单',
  },
  {
    id: 'tax-refund',
    name: '出口退税',
    icon: ReceiptText,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    description: '出口货物退税申报表',
  },
];

export function GenerateThreeFormsDialog({
  open,
  onOpenChange,
  salesContract,
  onGenerated,
}: GenerateThreeFormsDialogProps) {
  const [step, setStep] = useState<'preview' | 'matching' | 'review' | 'generating'>('preview');
  const [products, setProducts] = useState<ProductWithHSCode[]>([]);
  const [selectedForms, setSelectedForms] = useState<string[]>(['customs', 'forex', 'tax-refund']);

  // 初始化产品列表
  const initializeProducts = () => {
    const packingItems = salesContract.packingItems || [];
    setProducts(
      packingItems.map((item) => ({
        ...item,
        productName: item.product?.customsName || item.product?.description || '未知商品',
        hsCodeMatch: undefined,
      }))
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      setStep('preview');
      setProducts([]);
      setSelectedForms(['customs', 'forex', 'tax-refund']);
      setGeneratedIds({});
    } else {
      initializeProducts();
    }
  };

  const handleBatchMatch = async () => {
    setStep('matching');
    try {
      const productNames = products.map((p) => p.productName);
      const response = await hsCodeService.batchMatch(productNames);
      const matches = response.data || [];

      const updatedProducts = products.map((product, index) => ({
        ...product,
        hsCodeMatch: matches[index],
      }));

      setProducts(updatedProducts as ProductWithHSCode[]);
      setStep('review');

      const matchedCount = matches.filter((m) => m.match).length;
      toast.success(`HSCode 匹配完成：${matchedCount}/${matches.length} 个商品`);
    } catch {
      toast.error('HSCode 匹配失败');
      setStep('preview');
    }
  };

  const handleGenerateForms = async () => {
    setStep('generating');
    try {
      // 准备商品数据
      const items = products
        .filter((p) => p.hsCodeMatch?.match)
        .map((p) => ({
          productName: p.productName,
          hsCode: p.hsCodeMatch!.match!.hsCode,
          quantity: p.quantity,
          unit: p.unit || p.product?.unit || '',
          unitPrice: p.unitPrice || 0,
          totalPrice: p.totalPrice || 0,
          refundRate: p.hsCodeMatch!.match!.refundRate || undefined,
          packingItemId: p.id,
        }));

      if (items.length === 0) {
        toast.error('没有匹配到 HSCode 的商品，无法生成单据');
        setStep('review');
        return;
      }

      // 调用后端一键生成三张表 API
      const payload: ThreeFormsGenerateInput = {
        salesContractId: salesContract.id,
        items,
        extraData: {
          customs: {
            exporter: '',
            consignee: '',
            destinationCountry: '',
            portOfLoading: '',
            portOfDestination: '',
            transportMode: '',
          },
          forex: {
            bankName: '',
          },
        },
        generateCustoms: selectedForms.includes('customs'),
        generateForex: selectedForms.includes('forex'),
        generateTaxRefund: selectedForms.includes('tax-refund'),
      };

      const response = await threeFormsService.generateThreeForms(payload);
      const results = response.data || {};

      toast.success(`生成成功：${Object.keys(results).length} 张单据`);
      onGenerated?.(results);
      handleOpenChange(false);
    } catch {
      toast.error('生成单据失败');
      setStep('review');
    }
  };

  const getMatchStatus = (product: ProductWithHSCode) => {
    if (!product.hsCodeMatch) {
      return { icon: XCircle, label: '未匹配', color: 'text-gray-400' };
    }
    if (product.hsCodeMatch.confidence === 'exact') {
      return { icon: CheckCircle2, label: '精确匹配', color: 'text-green-500' };
    }
    if (product.hsCodeMatch.confidence === 'high') {
      return { icon: CheckCircle2, label: '高置信', color: 'text-blue-500' };
    }
    if (product.hsCodeMatch.confidence === 'low') {
      return { icon: AlertCircle, label: '低置信', color: 'text-yellow-500' };
    }
    return { icon: XCircle, label: '未匹配', color: 'text-red-500' };
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>一键生成出口三张表</DialogTitle>
          <DialogDescription>
            合同编号：{salesContract.contractNo} | 商品数量：{products.length} 个
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* 步骤 1: 预览商品列表 */}
          {step === 'preview' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">待处理商品清单</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    {THREE_FORMS_CONFIG.map((form) => (
                      <div
                        key={form.id}
                        className={`p-4 rounded-lg border ${form.bgColor}`}
                      >
                        <div className="flex items-center gap-2">
                          <form.icon className={`h-5 w-5 ${form.color}`} />
                          <span className="font-medium">{form.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {form.description}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>将执行以下操作：</p>
                    <ol className="list-decimal list-inside space-y-1 mt-2">
                      <li>自动匹配 {products.length} 个商品的 HSCode</li>
                      <li>生成报关单（含商品明细）</li>
                      <li>生成外汇核销单（关联报关单）</li>
                      <li>生成出口退税申报表（计算退税额）</li>
                    </ol>
                  </div>

                  <Button onClick={handleBatchMatch} className="w-full">
                    开始匹配 HSCode 并生成
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 步骤 2: 匹配中 */}
          {step === 'matching' && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-lg font-medium">正在匹配 HSCode...</p>
                  <p className="text-sm text-muted-foreground">
                    共 {products.length} 个商品，请稍候
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 步骤 3: 审核匹配结果 */}
          {step === 'review' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">HSCode 匹配结果审核</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* 选择要生成的单据类型 */}
                  <div className="flex gap-2">
                    {THREE_FORMS_CONFIG.map((form) => (
                      <Button
                        key={form.id}
                        variant={selectedForms.includes(form.id) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSelectedForms((prev) =>
                            prev.includes(form.id)
                              ? prev.filter((f) => f !== form.id)
                              : [...prev, form.id]
                          );
                        }}
                      >
                        <form.icon className="h-4 w-4 mr-2" />
                        {form.name}
                      </Button>
                    ))}
                  </div>

                  {/* 匹配结果表格 */}
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>商品名称</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead>单价 (USD)</TableHead>
                          <TableHead>总价 (USD)</TableHead>
                          <TableHead>HSCode</TableHead>
                          <TableHead>匹配状态</TableHead>
                          <TableHead>退税率</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {products.map((product) => {
                          const status = getMatchStatus(product);
                          const StatusIcon = status.icon;

                          return (
                            <TableRow
                              key={product.id}
                              className={!product.hsCodeMatch?.match ? 'bg-red-50' : ''}
                            >
                              <TableCell className="font-medium">
                                {product.productName}
                              </TableCell>
                              <TableCell>{product.quantity} {product.unit}</TableCell>
                              <TableCell>{product.unitPrice?.toFixed(2) || '-'}</TableCell>
                              <TableCell>{product.totalPrice?.toFixed(2) || '-'}</TableCell>
                              <TableCell className="font-mono">
                                {product.hsCodeMatch?.match?.hsCode || '-'}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1">
                                  <StatusIcon className={`h-4 w-4 ${status.color}`} />
                                  <span className="text-sm">{status.label}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                {product.hsCodeMatch?.match?.refundRate !== undefined &&
                                product.hsCodeMatch?.match?.refundRate !== null ? (
                                  `${product.hsCodeMatch.match.refundRate}%`
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      匹配成功：{products.filter((p) => p.hsCodeMatch?.match).length} / {products.length}
                    </span>
                    <Button variant="outline" size="sm" onClick={handleBatchMatch}>
                      重新匹配
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 步骤 4: 生成中 */}
          {step === 'generating' && (
            <Card>
              <CardContent className="py-8">
                <div className="flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <p className="text-lg font-medium">正在生成单据...</p>
                  <div className="flex gap-4 mt-2">
                    {selectedForms.map((formId) => {
                      const form = THREE_FORMS_CONFIG.find((f) => f.id === formId);
                      if (!form) return null;
                      return (
                        <div key={formId} className={`p-3 rounded-lg ${form.bgColor}`}>
                          <form.icon className={`h-6 w-6 ${form.color}`} />
                          <p className="text-sm mt-1">{form.name}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          {step === 'review' && (
            <>
              <Button variant="outline" onClick={() => setStep('preview')}>
                上一步
              </Button>
              <Button
                onClick={handleGenerateForms}
                disabled={selectedForms.length === 0}
              >
                确认生成 ({selectedForms.length} 张单据)
              </Button>
            </>
          )}
          {step === 'preview' && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              取消
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
