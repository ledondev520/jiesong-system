/**
 * Input: 出口合同 ID 及其装箱明细（含商品档案中已存储的 hsCode）、HS 编码库（退税率查询）
 * Output: 一键生成三张表（报关单、外汇核销、出口退税），并对退税率为 0 的商品给出「无退税」警示
 * Pos: 出口合同详情页操作组件
 *
 * 设计原则：HS 编码应维护在商品档案（Product.hsCode）中，此处直接复用；
 * 对于缺失 HS 编码的商品，允许在表格内内联输入或点击"AI 建议"填充。
 * 打开对话框时自动查询各行 HS 编码的退税率，refundRate === 0 视为无出口退税，红色警示。
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useMemo, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { hsCodeService } from '@/services/hsCode.service';
import { threeFormsService, type ThreeFormsGenerateInput } from '@/services/threeForms.service';
import { toast } from 'sonner';
import {
  FileText, DollarSign, ReceiptText, CheckCircle2, AlertCircle,
  Loader2, Sparkles,
} from 'lucide-react';
import type { SalesContract, PackingItem } from '@/types';

interface GenerateThreeFormsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  salesContract: SalesContract & { packingItems?: PackingItem[] };
  onGenerated?: (forms: { customsDeclarationId?: string; forexId?: string; taxRefundId?: string }) => void;
}

/** 每行商品的 HS 编码来源 */
type HsSource = 'stored' | 'ai' | 'manual' | 'missing';

/** 每行商品的展示状态 */
interface ProductRow {
  packingItem: PackingItem;
  productName: string;
  /** 当前 HS 编码（可能来自存档、AI 建议或手动输入） */
  hsCode: string;
  /** 编码来源 */
  source: HsSource;
  /** 退税率（%），仅 AI/数据库匹配后有值 */
  refundRate?: number | null;
  /** AI 建议获取中 */
  suggesting?: boolean;
}

const THREE_FORMS_CONFIG = [
  { id: 'customs', name: '报关单', icon: FileText, color: 'text-blue-500', bgColor: 'bg-blue-50', description: '海关出口货物报关单' },
  { id: 'forex', name: '外汇核销', icon: DollarSign, color: 'text-green-500', bgColor: 'bg-green-50', description: '出口收汇核销单' },
  { id: 'tax-refund', name: '出口退税', icon: ReceiptText, color: 'text-orange-500', bgColor: 'bg-orange-50', description: '出口货物退税申报表' },
];

/** 根据来源显示对应徽章 */
function SourceBadge({ source }: { source: HsSource }) {
  if (source === 'stored') return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">存档</Badge>;
  if (source === 'ai') return <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">AI 建议</Badge>;
  if (source === 'manual') return <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 text-xs">手动</Badge>;
  return <Badge variant="outline" className="text-red-500 border-red-300 bg-red-50 text-xs">未填写</Badge>;
}

export function GenerateThreeFormsDialog({
  open,
  onOpenChange,
  salesContract,
  onGenerated,
}: GenerateThreeFormsDialogProps) {
  const [generating, setGenerating] = useState(false);
  const [selectedForms, setSelectedForms] = useState<string[]>(['customs', 'forex', 'tax-refund']);
  /**
   * rows 存储可变的行数据（HS 编码内联编辑、AI 建议结果）。
   * 当 dialog 关闭时通过 handleOpenChange 重置。
   */
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [batchSuggesting, setBatchSuggesting] = useState(false);

  // 从合同装箱明细派生初始行（仅 open 切换为 true 时重建，否则保留用户编辑状态）
  // 过滤掉异常数据（null/undefined），确保每行都有合法的 PackingItem
  const initialRows = useMemo<ProductRow[]>(() => {
    const rawItems = Array.isArray(salesContract.packingItems) ? salesContract.packingItems : [];
    const packingItems = rawItems.filter(
      (item): item is PackingItem => !!item && typeof item.quantity === 'number',
    );
    return packingItems.map((item) => {
      const stored = item.product?.hsCode || '';
      const name = item.product?.customsName || item.product?.description || '未知商品';
      return {
        packingItem: item,
        productName: name,
        hsCode: stored,
        source: stored ? ('stored' as HsSource) : ('missing' as HsSource),
        refundRate: null,
        suggesting: false,
      };
    });
  }, [salesContract]);

  // 对话框打开/关闭处理
  // 思路：rows 状态在对话框关闭后保持不变（保留 AI 匹配结果），
  //       避免每次打开都需要重新匹配。仅在显式重置时（或合同变化时）清空。
  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      // 关闭时仅停止加载状态，不清空 rows（保留 AI 已匹配结果）
      setGenerating(false);
      setBatchSuggesting(false);
    }
  };

  // 实际展示的 rows：有 state 时用 state，否则用 initialRows 作为初始值
  // 额外过滤掉 undefined 条目（防止稀疏数组中的空洞）
  const displayRows = (rows.length > 0 ? rows : initialRows).filter(
    (r): r is ProductRow => !!r?.packingItem,
  );

  // 当前有效行统计
  const readyCount = displayRows.filter((r) => r.hsCode.trim()).length;
  const missingCount = displayRows.length - readyCount;
  // 无出口退税商品（退税率明确为 0）：需要警示，出口后无法退税
  const noRefundRows = displayRows.filter((r) => r.refundRate === 0);

  // 打开对话框时，为已有 HS 编码但退税率未知的行查询退税率（用于无退税警示）
  useEffect(() => {
    if (!open) return;
    const pending = (rows.length > 0 ? rows : initialRows)
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !!row?.packingItem && row.hsCode.trim() && row.refundRate == null);
    if (pending.length === 0) return;

    let cancelled = false;
    const lookup = async () => {
      // 1. 去重后逐码查询 HS 库（404/异常视为未知，不标警示）
      const uniqueCodes = Array.from(new Set(pending.map(({ row }) => row.hsCode.trim())));
      const rateMap = new Map<string, number | null>();
      await Promise.all(
        uniqueCodes.map(async (code) => {
          try {
            const res = await hsCodeService.getByCode(code);
            rateMap.set(code, typeof res.data?.refundRate === 'number' ? res.data.refundRate : null);
          } catch {
            rateMap.set(code, null);
          }
        }),
      );
      if (cancelled) return;
      // 2. 回填各行退税率
      setRows((prev) => {
        const base = prev.length > 0 ? prev : initialRows;
        return base.map((row) => {
          if (!row?.packingItem || !row.hsCode.trim() || row.refundRate != null) return row;
          const rate = rateMap.get(row.hsCode.trim());
          return rate === undefined ? row : { ...row, refundRate: rate };
        });
      });
    };
    void lookup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRows]);

  /**
   * 获取当前可操作的行列表：rows 有值时用 rows，否则用 initialRows 初始化
   * 这样所有 setRows 回调都能得到完整的 ProductRow[]，不会产生 undefined 空洞
   */
  const getBaseRows = (prev: ProductRow[]): ProductRow[] =>
    prev.length > 0 ? prev : initialRows;

  /** 手动修改某行的 HS 编码 */
  const handleHsCodeChange = (index: number, value: string) => {
    setRows((prev) => {
      const next = [...getBaseRows(prev)];
      next[index] = {
        ...next[index],
        hsCode: value,
        source: value ? 'manual' : 'missing',
        refundRate: null,
      };
      return next;
    });
  };

  /**
   * 对单行商品获取 AI 建议 HS 编码
   * 思路：拼接商品名 + 申报要素 + 规格 → 调用 batchMatch(1条) → 取第一个结果
   */
  const handleSuggestOne = async (index: number) => {
    const row = displayRows[index];
    const parts = [row.productName];
    if (row.packingItem.product?.declaration) parts.push(row.packingItem.product.declaration);
    if (row.packingItem.product?.specification) parts.push(row.packingItem.product.specification);
    const query = parts.join(' ').trim();

    setRows((prev) => {
      const next = [...getBaseRows(prev)];
      next[index] = { ...next[index], suggesting: true };
      return next;
    });

    try {
      const res = await hsCodeService.batchMatch([query]);
      const match = res.data?.[0];
      setRows((prev) => {
        const next = [...getBaseRows(prev)];
        next[index] = {
          ...next[index],
          suggesting: false,
          hsCode: match?.match?.hsCode || next[index].hsCode,
          source: match?.match?.hsCode ? 'ai' : next[index].source,
          refundRate: match?.match?.refundRate ?? null,
        };
        return next;
      });
      if (match?.match?.hsCode) {
        toast.success(`${row.productName} → ${match.match.hsCode}`);
      } else {
        toast.warning(`未能为"${row.productName}"找到合适的 HS 编码`);
      }
    } catch {
      setRows((prev) => {
        const next = [...getBaseRows(prev)];
        next[index] = { ...next[index], suggesting: false };
        return next;
      });
      toast.error('AI 建议失败');
    }
  };

  /**
   * 批量 AI 建议：仅对未填写 HS 编码的商品发起，避免重复调用
   */
  const handleBatchSuggest = async () => {
    const missing = displayRows
      .map((r, i) => ({ row: r, index: i }))
      .filter(({ row }) => !row.hsCode.trim());

    if (missing.length === 0) {
      toast.info('所有商品均已有 HS 编码');
      return;
    }

    setBatchSuggesting(true);
    try {
      const queries = missing.map(({ row }) => {
        const parts = [row.productName];
        if (row.packingItem.product?.declaration) parts.push(row.packingItem.product.declaration);
        if (row.packingItem.product?.specification) parts.push(row.packingItem.product.specification);
        return parts.join(' ').trim();
      });

      const res = await hsCodeService.batchMatch(queries);
      const matches = res.data || [];

      setRows((prev) => {
        const next = [...getBaseRows(prev)];
        missing.forEach(({ index }, i) => {
          const m = matches[i];
          if (m?.match?.hsCode) {
            next[index] = {
              ...next[index],
              hsCode: m.match.hsCode,
              source: 'ai',
              refundRate: m.match.refundRate ?? null,
            };
          }
        });
        return next;
      });

      const matched = matches.filter((m) => m?.match?.hsCode).length;
      toast.success(`AI 批量建议：${matched}/${missing.length} 个补全`);
    } catch {
      toast.error('AI 批量建议失败');
    } finally {
      setBatchSuggesting(false);
    }
  };

  /**
   * 确认生成三张表
   * 思路：1. 过滤有效行 2. 组装 payload（含 productId、packingItemId）3. 调用后端接口
   */
  const handleGenerateForms = async () => {
    setGenerating(true);
    try {
      const validRows = displayRows.filter((r) => r.hsCode.trim());
      if (validRows.length === 0) {
        toast.error('没有填写 HS 编码的商品，无法生成单据');
        setGenerating(false);
        return;
      }

      const items = validRows.map((r) => ({
        productId: r.packingItem.productId,        // Product 主键（必填，FK 约束）
        packingItemId: r.packingItem.id,           // PackingItem id（可选）
        productName: r.productName,
        hsCode: r.hsCode.trim(),
        quantity: r.packingItem.quantity,
        unit: r.packingItem.unit || r.packingItem.product?.unit || '',
        unitPrice: r.packingItem.unitPrice || 0,
        totalPrice: r.packingItem.totalPrice || 0,
        refundRate: r.refundRate ?? undefined,
      }));

      const payload: ThreeFormsGenerateInput = {
        salesContractId: salesContract.id,
        items,
        extraData: {
          customs: { exporter: '', consignee: '', destinationCountry: '', portOfLoading: '', portOfDestination: '', transportMode: '' },
          forex: { bankName: '' },
        },
        generateCustoms: selectedForms.includes('customs'),
        generateForex: selectedForms.includes('forex'),
        generateTaxRefund: selectedForms.includes('tax-refund'),
      };

      const response = await threeFormsService.generateThreeForms(payload);
      const results = response.data || {};
      const generatedFormIds = {
        customsDeclarationId: results.customsDeclarationId ?? undefined,
        forexId: results.forexId ?? undefined,
        taxRefundId: results.taxRefundId ?? undefined,
      };

      toast.success(`生成成功：${selectedForms.length} 张单据，正在下载 Excel...`);
      onGenerated?.(generatedFormIds);

      // 自动下载合并的三张表 Excel
      try {
        await threeFormsService.downloadExcel(salesContract.id, {
          customsDeclarationId: generatedFormIds.customsDeclarationId,
          forexId: generatedFormIds.forexId,
          taxRefundId: generatedFormIds.taxRefundId,
        });
        toast.success('Excel 下载成功');
      } catch {
        toast.warning('Excel 下载失败，请稍后从报关单列表重新导出');
      }

      handleOpenChange(false);
    } catch (err: unknown) {
      // 提取后端返回的具体错误信息，方便排查
      const apiMsg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      const displayMsg = apiMsg || '生成单据失败，请检查数据后重试';
      console.error('[GenerateThreeForms] 生成失败:', err);
      toast.error(displayMsg);
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>一键生成出口三张表</DialogTitle>
          <DialogDescription>
            合同编号：{salesContract.contractNo} &nbsp;|&nbsp; 共 {displayRows.length} 个商品，
            {readyCount} 个已有 HS 编码
            {missingCount > 0 && <span className="text-red-500 ml-1">，{missingCount} 个待填写</span>}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto space-y-4">
          {/* 选择要生成的单据类型 */}
          <div className="flex gap-2 flex-wrap">
            {THREE_FORMS_CONFIG.map((form) => (
              <Button
                key={form.id}
                variant={selectedForms.includes(form.id) ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setSelectedForms((prev) =>
                    prev.includes(form.id) ? prev.filter((f) => f !== form.id) : [...prev, form.id]
                  )
                }
              >
                <form.icon className="h-4 w-4 mr-1" />
                {form.name}
              </Button>
            ))}

            {/* AI 批量补全按钮（仅对缺失 HS 编码的商品生效） */}
            {missingCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleBatchSuggest}
                disabled={batchSuggesting}
                className="ml-auto text-purple-600 border-purple-300 hover:bg-purple-50"
              >
                {batchSuggesting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-1" />
                )}
                AI 补全 {missingCount} 个缺失编码
              </Button>
            )}
          </div>

          {/* 提示：HS 编码应在商品档案中维护 */}
          {missingCount > 0 && (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="py-2 px-4">
                <div className="flex items-start gap-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    建议在<strong>商品档案</strong>中为每个商品预先设定 HS 编码，避免每次生成时重复匹配。
                    下方表格允许临时手动填写，但该值不会保存回商品档案。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 警示：无出口退税商品（退税率为 0） */}
          {noRefundRows.length > 0 && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="py-2 px-4">
                <div className="flex items-start gap-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <p>
                    <strong>{noRefundRows.length} 个商品无出口退税</strong>
                    （退税率 0%）：{noRefundRows.map((r) => r.productName).join('、')}。
                    该部分货值无法申请退税，请在报价与成本核算时留意。
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 商品 HS 编码确认表格 */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名称</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>总价 (USD)</TableHead>
                  <TableHead className="min-w-[160px]">HS 编码</TableHead>
                  <TableHead>来源</TableHead>
                  <TableHead>退税率</TableHead>
                  <TableHead className="w-20">AI 建议</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayRows.map((row, index) => !row.packingItem ? null : (
                  <TableRow
                    key={row.packingItem.id}
                    className={!row.hsCode.trim() ? 'bg-red-50' : row.refundRate === 0 ? 'bg-amber-50/70' : ''}
                  >
                    <TableCell className="font-medium max-w-[160px] truncate" title={row.productName}>
                      {row.productName}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.packingItem.quantity ?? '-'} {row.packingItem.unit || row.packingItem.product?.unit || ''}
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.packingItem.totalPrice?.toFixed(2) ?? '-'}
                    </TableCell>
                    <TableCell>
                      {row.source === 'stored' ? (
                        /* 存档编码只读展示，附绿色对勾 */
                        <div className="flex items-center gap-1 font-mono text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                          {row.hsCode}
                        </div>
                      ) : (
                        /* 非存档编码可内联编辑 */
                        <Input
                          value={row.hsCode}
                          onChange={(e) => handleHsCodeChange(index, e.target.value)}
                          placeholder="输入 HS 编码"
                          className="h-7 text-sm font-mono"
                          maxLength={20}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <SourceBadge source={row.source} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.refundRate === 0 ? (
                        <span className="inline-flex items-center gap-1 font-medium text-red-600">
                          <AlertCircle className="h-3.5 w-3.5" />
                          0%（无退税）
                        </span>
                      ) : row.refundRate !== null && row.refundRate !== undefined ? (
                        `${row.refundRate}%`
                      ) : (
                        <span className="text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.source !== 'stored' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSuggestOne(index)}
                          disabled={row.suggesting || batchSuggesting}
                          className="h-7 px-2 text-purple-600 hover:text-purple-700"
                          title="AI 建议 HS 编码"
                        >
                          {row.suggesting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRows([])}
            disabled={generating || rows.length === 0}
            className="mr-auto text-muted-foreground"
            title="清除所有 AI 匹配结果，重新从商品档案初始化"
          >
            重置
          </Button>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={generating}>
            取消
          </Button>
          <Button
            onClick={handleGenerateForms}
            disabled={generating || selectedForms.length === 0 || readyCount === 0}
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                生成中...
              </>
            ) : (
              `确认生成（${selectedForms.length} 张单据，${readyCount} 个商品）`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
