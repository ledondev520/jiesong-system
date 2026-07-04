/**
 * Input: HSCode 搜索服务（keyword 商品名称 / code HS 编码前缀）、AI 推荐接口（集成 HSCIQ 归类实例 + 官方税率）
 * Output: HSCode 查询页面（含双搜索框 + AI 推荐 HS 编码 + HSCIQ 官方税率 + AI 填写申报要素 + 一键复制报关格式）
 * Pos: 出口模块子页面 - HSCode 检索
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { HsCodeRecord } from '@/types';
import { hsCodeService } from '@/services/hsCode.service';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Search, ChevronRight, X, Sparkles, Loader2, Copy, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import type { ApiResponse } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * 防抖 Hook - 延迟输入触发
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

function parseDeclarationElements(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** HSCIQ 编码详情（API 返回 camelCase 字段） */
type HsciqDetail = {
  code?: string;
  name?: string;
  taxes?: Record<string, string>;
  extensions?: {
    cn?: {
      reporting?: Array<{ key: string; value: string; isRequired?: boolean }>;
      regulatory?: Record<string, string>;
      inspect?: Record<string, string>;
    };
  };
} | null;

/** AI 推荐接口返回的 data 载荷（与后端 success 的 data 字段一致） */
type AiRecommendPayload = {
  recommendation: { hsCode: string; productName: string; reason: string; confidence?: number } | null;
  candidates: HsCodeRecord[];
  rawResponse?: string;
  reason?: string;
  /** AI 根据产品描述填写的申报要素具体值 */
  filledDeclarationElements?: Array<{ element: string; value: string; uncertain?: boolean }> | null;
  /** HSCIQ 权威编码详情 */
  hsciqDetail?: HsciqDetail;
  evidence?: {
    recommendationSource: 'hsciq_instance' | 'local_snapshot' | 'ai';
    recommendationSourceLabel: string;
    declarationTemplateSource: 'hsciq' | 'local' | 'ai';
    declarationTemplateSourceLabel: string;
    declarationTemplateElements?: string[];
    pendingConfirmationFields?: string[];
    hsciq?: {
      enabled: boolean;
      available: boolean;
      usedInstance: boolean;
      usedCodeDetail: boolean;
      quotaRemaining: number;
    };
    localSnapshot?: {
      hsCode: string;
      productName: string;
      sourceUrl?: string | null;
      effectiveDate?: string | Date | null;
      fetchedAt?: string | Date | null;
    } | null;
  };
};

function parseStructuredItems(value: string | null | undefined) {
  if (!value) return [];

  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item, index) => {
      const matched = item.match(/^([A-Za-z0-9]+)\s*[:：]\s*(.+)$/);
      return {
        id: `${item}-${index}`,
        code: matched ? matched[1] : null,
        text: matched ? matched[2] : item,
      };
    });
}

function DetailTokenSection({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; code: string | null; text: string }>;
}) {
  if (items.length === 0) return null;

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <Badge variant="secondary" className="text-xs">
          {items.length} 项
        </Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border bg-muted/30 p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              {item.code ? (
                <Badge variant="outline" className="min-w-10 justify-center font-mono">
                  {item.code}
                </Badge>
              ) : null}
            </div>
            <p className="text-sm leading-6">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function HsCodesPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialKeyword = searchParams.get('keyword') || '';
  const initialPage = parseInt(searchParams.get('page') || '1', 10);
  const initialPageSize = parseInt(searchParams.get('pageSize') || '20', 10);

  const initialCode = searchParams.get('code') || '';

  const [results, setResults] = useState<HsCodeRecord[]>([]);
  const [isFuzzy, setIsFuzzy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [hsCodeInput, setHsCodeInput] = useState(initialCode); // HS 编码前缀独立搜索框
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedRecord, setSelectedRecord] = useState<HsCodeRecord | null>(null);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedKeyword = useDebouncedValue(keyword, 500);
  const debouncedHsCode = useDebouncedValue(hsCodeInput, 500);
  const declarationElements = parseDeclarationElements(selectedRecord?.declarationElements);
  const supervisionItems = parseStructuredItems(selectedRecord?.supervisionConditions);
  const inspectionItems = parseStructuredItems(selectedRecord?.inspectionQuarantine);

  // AI 推荐状态
  const [aiRecommendOpen, setAiRecommendOpen] = useState(false);
  const [aiRecommendInput, setAiRecommendInput] = useState('');
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);
  const [aiRecommendResult, setAiRecommendResult] = useState<AiRecommendPayload | null>(null);
  const debouncedAiRecommendInput = useDebouncedValue(aiRecommendInput, 500);
  const aiRecommendReqIdRef = useRef(0);
  const runAiRecommendRef = useRef<(text: string) => Promise<void>>(async () => {});
  // 一键复制标准格式状态（短暂显示 ✓）
  const [copied, setCopied] = useState(false);

  // 详情页 AI 辅助填写申报要素状态
  const [fillProductName, setFillProductName] = useState('');
  const [fillProductDescription, setFillProductDescription] = useState('');
  const [fillLoading, setFillLoading] = useState(false);
  const [fillResult, setFillResult] = useState<Array<{ element: string; value: string; uncertain?: boolean }> | null>(null);
  const [fillCopied, setFillCopied] = useState(false);

  // 切换到新记录时重置 AI 填写区状态
  useEffect(() => {
    setFillProductName('');
    setFillProductDescription('');
    setFillResult(null);
    setFillCopied(false);
  }, [selectedRecord?.id]);

  /**
   * 职责：调用后端 AI 推荐接口
   * 思路：用递增请求 id 丢弃过期响应，避免防抖/连点乱序覆盖结果
   * @param text 产品描述（已 trim 由调用方保证非空时发起）
   * @param force 强制刷新（跳过并清除缓存）
   */
  const runAiRecommend = useCallback(async (text: string, force = false) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const id = ++aiRecommendReqIdRef.current;
    setAiRecommendLoading(true);
    setAiRecommendResult(null);
    try {
      const res = await api.post<ApiResponse<AiRecommendPayload>, ApiResponse<AiRecommendPayload>>(
        '/hs-codes/ai-recommend',
        { productDescription: trimmed, force },
      );
      if (id !== aiRecommendReqIdRef.current) return;
      setAiRecommendResult(res.data ?? null);
    } catch {
      if (id !== aiRecommendReqIdRef.current) return;
      toast.error('AI 推荐失败，请稍后重试');
    } finally {
      if (id === aiRecommendReqIdRef.current) {
        setAiRecommendLoading(false);
      }
    }
  }, []);

  runAiRecommendRef.current = runAiRecommend;

  /**
   * 职责：手动点击「推荐」时校验非空再请求
   */
  const handleAiRecommendClick = () => {
    const text = aiRecommendInput.trim();
    if (!text) {
      toast.error('请输入产品描述');
      return;
    }
    void runAiRecommend(text);
  };

  /**
   * 职责：弹窗打开且输入停顿后自动发起推荐（无需再点按钮）
   * 思路：至少 2 个字符才自动请求（与列表模糊检索一致）；过短仅支持手动点按钮
   */
  useEffect(() => {
    if (!aiRecommendOpen) return;
    const text = debouncedAiRecommendInput.trim();
    if (text.length < 2) return;
    // 防抖未追上当前输入时不自动请求，避免弹窗重开时误用上一次描述
    if (debouncedAiRecommendInput !== aiRecommendInput) return;
    void runAiRecommendRef.current(text);
  }, [debouncedAiRecommendInput, aiRecommendInput, aiRecommendOpen]);

  /**
   * 职责：关闭弹窗时作废进行中的推荐请求，避免关闭后仍改状态
   */
  const handleAiRecommendDialogChange = useCallback((open: boolean) => {
    if (!open) {
      aiRecommendReqIdRef.current += 1;
      setAiRecommendLoading(false);
    }
    setAiRecommendOpen(open);
  }, []);

  // 将分页/关键词/编码状态同步写入 URL，支持书签与浏览器回退
  const syncToUrl = useCallback((kw: string, code: string, p: number, ps: number) => {
    const params = new URLSearchParams();
    if (kw) params.set('keyword', kw);
    if (code) params.set('code', code);
    if (p > 1) params.set('page', String(p));
    if (ps !== 20) params.set('pageSize', String(ps));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname]);

  // 列表/搜索触发（关键词/编码/页码/每页条数变化时重新加载）
  useEffect(() => {
    const kw = debouncedKeyword.trim();
    const code = debouncedHsCode.trim().replace(/\D/g, '');
    loadResults({ searchKeyword: kw, searchCode: code, nextPage: page, currentPageSize: pageSize });
    syncToUrl(kw, code, page, pageSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, debouncedHsCode, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword, debouncedHsCode]);

  /**
   * 职责：加载 HS 编码搜索结果
   * @param searchKeyword - 商品名称关键词
   * @param searchCode - HS 编码前缀（纯数字）
   */
  const loadResults = async ({
    searchKeyword,
    searchCode = '',
    nextPage,
    currentPageSize = pageSize,
  }: {
    searchKeyword: string;
    searchCode?: string;
    nextPage: number;
    currentPageSize?: number;
  }) => {
    setLoading(true);
    try {
      const trimmedKw = searchKeyword.trim();
      const trimmedCode = searchCode.trim().replace(/\D/g, '');
      const hasInput = trimmedKw.length >= 2 || trimmedCode.length >= 2;
      const response = await hsCodeService.list({
        keyword: trimmedKw,
        code: trimmedCode,
        page: nextPage,
        pageSize: currentPageSize,
        fuzzy: hasInput,
      });
      setResults(response.data.items || []);
      setIsFuzzy(!!(response.data as { fuzzy?: boolean }).fuzzy && hasInput);
      setTotal(response.data.pagination.total || 0);
      setTotalPages(response.data.pagination.totalPages || 1);
    } catch (error) {
      console.error('HSCode 搜索失败:', error);
      toast.error('搜索失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return `${value}%`;
  };

  /**
   * 职责：判断 HS 编码记录是否过期
   * 思路：备注中含"过期"关键字，或 effectiveDate 早于 2025-01-01
   */
  const isExpiredHsCode = (record: HsCodeRecord) => {
    if (record.note && /过期/i.test(record.note)) return true;
    if (!record.effectiveDate) return false;
    return new Date(record.effectiveDate) < new Date('2025-01-01');
  };

  const sort = useTableSort<HsCodeRecord, string>(
    results,
    useCallback((record, key) => {
      switch (key) {
        case 'hsCode':
          return record.hsCode ?? '';
        case 'productName':
          return record.productName ?? '';
        case 'refundRate':
          return record.refundRate ?? null;
        default:
          return null;
      }
    }, [])
  );

  return (
    <div className="flex flex-col h-full">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="HS 编码查询"
        description="默认展示全量列表。输入商品名称（可模糊）或 4–12 位纯数字 HS 编码（支持首尾空格，自动 trim）即可检索；编码按库内 hsCode 前缀精确匹配。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setAiRecommendOpen(true); setAiRecommendInput(keyword); setAiRecommendResult(null); }}
          >
            <Sparkles className="mr-2 h-4 w-4 text-primary" />
            AI 智能推荐
          </Button>
        }
      />

      {/* 搜索栏：商品名称 + HS 编码分离 */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* 商品名称搜索 */}
            <div className="relative min-w-0 flex-1">
              {loading ? (
                <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                placeholder="商品名称（支持模糊匹配）"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-10 pr-9"
              />
              {keyword && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setKeyword(''); setPage(1); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {/* HS 编码前缀搜索 */}
            <div className="relative w-full sm:w-[200px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground select-none">HS</span>
              <Input
                placeholder="编码前缀（4–10位）"
                value={hsCodeInput}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 12);
                  setHsCodeInput(v);
                }}
                className="pl-9 pr-9 font-mono tabular-nums"
                inputMode="numeric"
              />
              {hsCodeInput && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => { setHsCodeInput(''); setPage(1); }}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const ps = Number(v);
                setPageSize(ps);
                setPage(1);
                loadResults({ searchKeyword: debouncedKeyword, searchCode: debouncedHsCode, nextPage: 1, currentPageSize: ps });
              }}
            >
              <SelectTrigger className="h-10 w-full sm:w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="20">20 条</SelectItem>
                <SelectItem value="50">50 条</SelectItem>
                <SelectItem value="100">100 条</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 搜索结果 */}
      {selectedRecord ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setSelectedRecord(null)}
                className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
                返回列表
              </button>
              {isExpiredHsCode(selectedRecord) && (
                <Badge variant="destructive" className="text-xs">已过期</Badge>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">HSCode</h3>
                <p className="text-lg font-semibold">{selectedRecord.hsCode}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">商品名称</h3>
                <p className="text-lg font-semibold">{selectedRecord.productName}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">计量单位</h3>
                <p className="text-lg font-semibold">{selectedRecord.unit || '-'}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">出口退税率</h3>
                <p className="text-lg font-semibold">{formatPercent(selectedRecord.refundRate)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">出口税率</h3>
                <p className="text-lg font-semibold">{formatPercent(selectedRecord.exportTaxRate)}</p>
              </div>
              <div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">增值税率</h3>
                <p className="text-lg font-semibold">{formatPercent(selectedRecord.vatRate)}</p>
              </div>
            </div>

            <DetailTokenSection title="监管条件" items={supervisionItems} />

            {selectedRecord.declarationElements && (
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-muted-foreground">申报要素</h3>
                  <Badge variant="secondary" className="text-xs">
                    {declarationElements.length} 项
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {declarationElements.map((item, index) => (
                    <div
                      key={`${item}-${index}`}
                      className="rounded-lg border bg-muted/30 p-3"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <Badge variant="outline" className="min-w-8 justify-center">
                          {String(index + 1).padStart(2, '0')}
                        </Badge>
                      </div>
                      <p className="text-sm leading-6">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI 辅助填写申报要素 —— 基于该 HS 码的真实要素模板 */}
            <div className="mt-6 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-medium">AI 辅助填写申报要素</h3>
              </div>
              <p className="text-xs text-muted-foreground">
                输入商品名称（必填），AI 将根据此 HS 编码的申报要素格式自动生成填写建议，并提供可复制的标准格式。
              </p>
              <div className="space-y-2">
                <input
                  id="hs-ai-fill-product-name"
                  name="hsAiFillProductName"
                  type="text"
                  placeholder="商品名称（必填，如：天然石英石橱柜台面）"
                  value={fillProductName}
                  onChange={(e) => setFillProductName(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60"
                />
                <textarea
                  id="hs-ai-fill-product-description"
                  name="hsAiFillProductDescription"
                  placeholder="产品描述（选填，如：天然石英石含量≥93%，表面抛光，规格3200×1600mm，厚度20mm）"
                  value={fillProductDescription}
                  onChange={(e) => setFillProductDescription(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/60 resize-none"
                />
                <Button
                  size="sm"
                  disabled={fillLoading || !fillProductName.trim()}
                  onClick={async () => {
                    setFillLoading(true);
                    setFillResult(null);
                    try {
                      const desc = fillProductDescription.trim() || fillProductName.trim();
                      const res = await api.post<
                        ApiResponse<{ filledDeclarationElements: Array<{ element: string; value: string; uncertain?: boolean }> }>,
                        ApiResponse<{ filledDeclarationElements: Array<{ element: string; value: string; uncertain?: boolean }> }>
                      >(
                        `/hs-codes/${selectedRecord.hsCode}/fill-declaration`,
                        { productDescription: desc, productName: fillProductName.trim() },
                      );
                      setFillResult(res.data?.filledDeclarationElements ?? null);
                    } catch {
                      toast.error('AI 填写申报要素失败，请稍后重试');
                    } finally {
                      setFillLoading(false);
                    }
                  }}
                  className="w-full sm:w-auto"
                >
                  {fillLoading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />AI 生成中...</> : <><Sparkles className="mr-1.5 h-3.5 w-3.5" />生成申报要素填写建议</>}
                </Button>
              </div>

              {fillResult && fillResult.length > 0 && (
                <div className="space-y-2 pt-1 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">AI 填写建议</p>
                    <button
                      type="button"
                      onClick={() => {
                        const pipeValues = fillResult.map((item) => item.value).join('|');
                        void navigator.clipboard.writeText(pipeValues).then(() => {
                          setFillCopied(true);
                          setTimeout(() => setFillCopied(false), 2000);
                        });
                      }}
                      className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      {fillCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      {fillCopied ? '已复制' : '复制报关格式'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {fillResult.map((item, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-md bg-background px-3 py-2 text-xs border">
                        <span className="shrink-0 w-5 text-center font-medium text-muted-foreground">{i + 1}.</span>
                        <span className="text-muted-foreground shrink-0">{item.element}：</span>
                        <span className={cn('flex-1 font-medium', item.uncertain && 'text-amber-600 dark:text-amber-400')}>
                          {item.value}
                          {item.uncertain && <span className="ml-1 text-[10px] font-normal opacity-70">（待确认）</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">以上内容由 AI 根据产品描述和申报要素格式生成，仅供参考，请以实际货物和海关要求为准。</p>
                </div>
              )}
            </div>

            <DetailTokenSection title="检验检疫" items={inspectionItems} />

            {selectedRecord.note && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">备注</h3>
                <p className="text-sm">{selectedRecord.note}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">搜索中...</div>
            ) : results.length === 0 ? (
              (keyword.trim() || hsCodeInput.trim()) ? (
                <div className="text-center py-8 text-muted-foreground">
                  未找到相关结果，请尝试其他关键词或编码
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  当前暂无 HSCode 数据
                </div>
              )
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    共 <span className="font-medium text-foreground">{total.toLocaleString()}</span> 条记录，每页 {pageSize} 条，第 {page} / {totalPages} 页
                    {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && (
                      <Badge variant="secondary" className="ml-2 text-xs">{hsCodeInput.trim() && !keyword.trim() ? '编码前缀匹配' : '相似度排序'}</Badge>
                    )}
                  </span>
                </div>

                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableTableHead
                          sortKey="hsCode"
                          currentSortKey={sort.sortKey}
                          currentSortDir={sort.sortDir}
                          onSort={sort.onSort}
                          className="w-[120px]"
                        >
                          HSCode
                        </SortableTableHead>
                        <SortableTableHead
                          sortKey="productName"
                          currentSortKey={sort.sortKey}
                          currentSortDir={sort.sortDir}
                          onSort={sort.onSort}
                          className="max-w-[260px]"
                        >
                          商品名称
                        </SortableTableHead>
                        {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && <TableHead className="w-[76px]">置信分</TableHead>}
                        <TableHead className="w-[60px]">单位</TableHead>
                        <SortableTableHead
                          sortKey="refundRate"
                          currentSortKey={sort.sortKey}
                          currentSortDir={sort.sortDir}
                          onSort={sort.onSort}
                          className="w-[80px]"
                        >
                          退税率
                        </SortableTableHead>
                        <TableHead>申报要素</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sort.sortedData.map((record) => (
                        <TableRow
                          key={record.id}
                          className={cn(
                            'cursor-pointer hover:bg-muted/50',
                            isExpiredHsCode(record) && 'bg-red-50 hover:bg-red-100 dark:bg-red-950/20 dark:hover:bg-red-950/40',
                          )}
                          onClick={() => setSelectedRecord(record)}
                        >
                          <TableCell className="font-mono text-xs">{record.hsCode}</TableCell>
                          <TableCell className="max-w-[260px]">
                            <span className="block truncate text-sm" title={record.productName}>
                              {record.productName}
                            </span>
                          </TableCell>
                          {isFuzzy && (keyword.trim() || hsCodeInput.trim()) && (
                            <TableCell>
                              {record.similarity !== undefined ? (
                                <Badge
                                  variant={record.similarity >= 0.8 ? 'default' : record.similarity >= 0.5 ? 'secondary' : 'outline'}
                                  className="text-xs tabular-nums"
                                >
                                  {Math.round(record.similarity * 100)} 分
                                </Badge>
                              ) : (
                                '-'
                              )}
                            </TableCell>
                          )}
                          <TableCell className="text-xs">{record.unit || '-'}</TableCell>
                          <TableCell className="text-xs">{formatPercent(record.refundRate)}</TableCell>
                          <TableCell className="max-w-[160px]">
                            {record.declarationElements ? (
                              <Badge variant="outline" className="text-xs truncate max-w-[140px] block">
                                {record.declarationElements.slice(0, 20)}
                                {record.declarationElements.length > 20 ? '…' : ''}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* 数字分页 */}
                <div className="flex items-center justify-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage(1)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    «
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((p) => Math.max(p - 1, 1))}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    ‹
                  </Button>
                  {/* 显示页码窗口 */}
                  {(() => {
                    const window = 5;
                    const half = Math.floor(window / 2);
                    let start = Math.max(1, page - half);
                    const end = Math.min(totalPages, start + window - 1);
                    start = Math.max(1, end - window + 1);
                    return Array.from({ length: end - start + 1 }, (_, i) => start + i).map((p) => (
                      <Button
                        key={p}
                        variant={p === page ? 'default' : 'outline'}
                        size="sm"
                        disabled={loading}
                        onClick={() => setPage(p)}
                        className="h-8 w-8 p-0 text-xs"
                      >
                        {p}
                      </Button>
                    ));
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    ›
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages || loading}
                    onClick={() => setPage(totalPages)}
                    className="h-8 w-8 p-0 text-xs"
                  >
                    »
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 数据说明 */}
      <div className="mt-4 text-xs text-muted-foreground">
        数据来源：海关总署 - 当前列表 {results.length} 条 / 总计 {total} 条
        {keyword.trim() || hsCodeInput.trim()
          ? `（${[keyword.trim() && `名称：${keyword}`, hsCodeInput.trim() && `编码：${hsCodeInput}`].filter(Boolean).join('，')}）`
          : '（默认全量列表）'}
      </div>

      {/* AI 智能推荐弹窗 */}
      <Dialog open={aiRecommendOpen} onOpenChange={handleAiRecommendDialogChange}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 智能推荐 HS 编码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form
              className="space-y-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                handleAiRecommendClick();
              }}
            >
              <label className="text-sm font-medium" htmlFor="hs-ai-recommend-input">
                产品描述
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  id="hs-ai-recommend-input"
                  placeholder="例如：天然石英石板材，用于橱柜台面"
                  value={aiRecommendInput}
                  onChange={(e) => setAiRecommendInput(e.target.value)}
                  className="min-w-0 flex-1"
                  enterKeyHint="search"
                />
                <Button type="submit" className="shrink-0 sm:w-10" disabled={aiRecommendLoading} aria-label="发起 AI 推荐">
                  {aiRecommendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                停半秒自动推荐，亦可点按钮或键盘「搜索」。模型结果仅供参考；下方对照本地税则，分数 0–100 表示匹配度。
              </p>
            </form>

            {aiRecommendLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在分析商品描述并生成申报要素建议...
              </div>
            )}

            {aiRecommendResult && !aiRecommendLoading && (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {aiRecommendResult.recommendation ? (
                  <>
                    {/* HS 编码推荐卡片 */}
                    <div className="rounded-lg border border-accent/60 bg-accent/20 p-4 space-y-2">
                      <div className="flex flex-wrap items-start gap-2">
                        <Badge className="h-auto max-w-full whitespace-normal break-all py-1 text-left font-mono text-sm leading-snug">
                          {aiRecommendResult.recommendation.hsCode}
                        </Badge>
                        <span className="text-sm font-medium">{aiRecommendResult.recommendation.productName}</span>
                        {typeof aiRecommendResult.recommendation.confidence === 'number' ? (
                          <Badge variant="secondary" className="tabular-nums">
                            置信分 {Math.min(100, Math.max(0, Math.round(aiRecommendResult.recommendation.confidence)))} 分
                          </Badge>
                        ) : null}
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{aiRecommendResult.recommendation.reason}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const code = aiRecommendResult.recommendation!.hsCode.replace(/\D/g, '');
                            setHsCodeInput(code);
                            setKeyword('');
                            setAiRecommendOpen(false);
                          }}
                        >
                          使用此编码搜索
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          disabled={aiRecommendLoading}
                          onClick={() => void runAiRecommend(aiRecommendInput, true)}
                        >
                          刷新推荐
                        </Button>
                      </div>
                    </div>

                    {/* 推荐证据链 */}
                    {aiRecommendResult.evidence && (
                      <div className="rounded-lg border bg-background p-4 space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">推荐证据链</p>
                          <Badge variant="secondary">{aiRecommendResult.evidence.recommendationSourceLabel}</Badge>
                          <Badge variant="outline">要素模板：{aiRecommendResult.evidence.declarationTemplateSourceLabel}</Badge>
                        </div>
                        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                          <div>
                            <span className="font-medium text-foreground">HSCIQ：</span>
                            {aiRecommendResult.evidence.hsciq?.enabled
                              ? aiRecommendResult.evidence.hsciq.available
                                ? `已启用，剩余额度 ${aiRecommendResult.evidence.hsciq.quotaRemaining}`
                                : '已启用但未配置密钥'
                              : '未启用'}
                          </div>
                          <div>
                            <span className="font-medium text-foreground">归类实例：</span>
                            {aiRecommendResult.evidence.hsciq?.usedInstance ? '已参考' : '未使用'}
                            <span className="mx-1">/</span>
                            <span className="font-medium text-foreground">编码详情：</span>
                            {aiRecommendResult.evidence.hsciq?.usedCodeDetail ? '已命中' : '未命中'}
                          </div>
                          {aiRecommendResult.evidence.localSnapshot ? (
                            <div className="sm:col-span-2">
                              <span className="font-medium text-foreground">本地快照：</span>
                              {aiRecommendResult.evidence.localSnapshot.hsCode} {aiRecommendResult.evidence.localSnapshot.productName}
                              {aiRecommendResult.evidence.localSnapshot.effectiveDate
                                ? `，版本日期 ${new Date(aiRecommendResult.evidence.localSnapshot.effectiveDate).toISOString().slice(0, 10)}`
                                : ''}
                            </div>
                          ) : null}
                        </div>
                        {aiRecommendResult.evidence.declarationTemplateElements && aiRecommendResult.evidence.declarationTemplateElements.length > 0 ? (
                          <div className="space-y-1.5 border-t pt-2">
                            <p className="text-xs font-medium text-muted-foreground">该编码要求填写的申报要素</p>
                            <div className="flex flex-wrap gap-1.5">
                              {aiRecommendResult.evidence.declarationTemplateElements.map((item, index) => (
                                <Badge key={`${item}-${index}`} variant="outline" className="max-w-full whitespace-normal text-left font-normal">
                                  {item}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {aiRecommendResult.evidence.pendingConfirmationFields && aiRecommendResult.evidence.pendingConfirmationFields.length > 0 ? (
                          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            仍需确认：{aiRecommendResult.evidence.pendingConfirmationFields.join('、')}
                          </div>
                        ) : null}
                      </div>
                    )}

                    {/* HSCIQ 权威数据（税率、监管条件等） */}
                    {aiRecommendResult.hsciqDetail?.taxes && (
                      <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20 p-4 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                          官方税率信息
                        </p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          {(() => {
                            const taxes = aiRecommendResult.hsciqDetail!.taxes!;
                            const labelMap: Record<string, string> = {
                              mfnImportRate: '最惠国进口税率',
                              generalImportRate: '普通进口税率',
                              vatRate: '增值税率',
                              exportTaxRebateRate: '出口退税率',
                              consumptionTaxRate: '消费税率',
                              exportRate: '出口税率',
                              provisionalImportRate: '暂定进口税率',
                              provisionalExportRate: '暂定出口税率',
                            };
                            return Object.entries(taxes)
                              .filter(([, v]) => v && v !== '' && v !== '-')
                              .slice(0, 8)
                              .map(([k, v]) => (
                                <div key={k} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">{labelMap[k] || k}</span>
                                  <span className="font-medium tabular-nums">{v}</span>
                                </div>
                              ));
                          })()}
                        </div>
                        {aiRecommendResult.hsciqDetail!.extensions?.cn?.regulatory && Object.keys(aiRecommendResult.hsciqDetail!.extensions.cn.regulatory).length > 0 && (
                          <div className="text-xs border-t pt-1.5 mt-1.5">
                            <span className="text-muted-foreground">监管条件：</span>
                            <span className="font-medium">
                              {Object.entries(aiRecommendResult.hsciqDetail!.extensions!.cn!.regulatory!)
                                .map(([k, v]) => `${k}(${v})`)
                                .join('、')}
                            </span>
                          </div>
                        )}
                        <p className="text-[10px] text-muted-foreground">数据来源：HSCIQ 海关编码智能查询</p>
                      </div>
                    )}

                    {/* AI 填写的申报要素（推断值，建议在详情页使用精确版） */}
                    {aiRecommendResult.filledDeclarationElements && aiRecommendResult.filledDeclarationElements.length > 0 && (
                      <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">AI 申报要素参考</p>
                          <button
                            type="button"
                            onClick={() => {
                              const pipeValues = (aiRecommendResult.filledDeclarationElements || [])
                                .map((item) => item.value).join('|');
                              void navigator.clipboard.writeText(pipeValues).then(() => {
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              });
                            }}
                            className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                            {copied ? '已复制' : '复制报关格式'}
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {aiRecommendResult.filledDeclarationElements.map((item, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs">
                              <span className="shrink-0 w-5 text-center font-medium text-muted-foreground">{i + 1}.</span>
                              <span className="text-muted-foreground shrink-0">{item.element}：</span>
                              <span className={cn('flex-1', item.uncertain && 'text-amber-600 dark:text-amber-400')}>
                                {item.value}
                                {item.uncertain && <span className="ml-1 text-[10px] opacity-70">（待确认）</span>}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">
                          {aiRecommendResult.hsciqDetail
                            ? '申报要素模板来源于 HSCIQ 官方税则库，AI 已据此填写参考值。最终以海关正式归类为准。'
                            : '以上为 AI 参考推断，不保证精确。确认 HS 编码后，建议进入详情页使用「AI 辅助填写申报要素」获得基于真实要素模板的准确填写建议。'}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {aiRecommendResult.reason ||
                      aiRecommendResult.rawResponse ||
                      '未找到合适的 HS 码推荐，请换用更详细的产品描述。'}
                  </div>
                )}

                {aiRecommendResult.candidates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">参考候选（{aiRecommendResult.candidates.length} 条）</p>
                    <p className="text-[11px] text-muted-foreground">
                      分数＝相似度换算后按名次递减，仅供排序。
                    </p>
                    <div className="space-y-1 max-h-36 overflow-y-auto">
                      {aiRecommendResult.candidates.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          onClick={() => { setHsCodeInput(c.hsCode.replace(/\D/g, '')); setKeyword(''); setAiRecommendOpen(false); }}
                        >
                          <span className="font-mono break-all text-primary">{c.hsCode}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.productName}</span>
                          <Badge variant="outline" className="shrink-0 tabular-nums">
                            {typeof c.confidenceScore === 'number' ? `${c.confidenceScore} 分` : '—'}
                          </Badge>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function HsCodesPage() {
  return (
    <Suspense fallback={<div className="p-4">加载中...</div>}>
      <HsCodesPageContent />
    </Suspense>
  );
}
