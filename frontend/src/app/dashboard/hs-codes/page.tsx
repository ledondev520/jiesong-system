/**
 * Input: HSCode 搜索服务
 * Output: HSCode 查询页面
 * Pos: 基础档案子页面 - HSCode 检索
 */

'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
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
import { Search, ChevronRight, X, Sparkles, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import api from '@/lib/axios';
import type { ApiResponse } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, EXPORT_TABS } from '@/components/layout/ModuleTabHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

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

  const [results, setResults] = useState<(HsCodeRecord & { similarity?: number })[]>([]);
  const [isFuzzy, setIsFuzzy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [selectedRecord, setSelectedRecord] = useState<HsCodeRecord | null>(null);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedKeyword = useDebouncedValue(keyword, 350);
  const declarationElements = parseDeclarationElements(selectedRecord?.declarationElements);
  const supervisionItems = parseStructuredItems(selectedRecord?.supervisionConditions);
  const inspectionItems = parseStructuredItems(selectedRecord?.inspectionQuarantine);

  // AI 推荐状态
  const [aiRecommendOpen, setAiRecommendOpen] = useState(false);
  const [aiRecommendInput, setAiRecommendInput] = useState('');
  const [aiRecommendLoading, setAiRecommendLoading] = useState(false);
  const [aiRecommendResult, setAiRecommendResult] = useState<{
    recommendation: { hsCode: string; productName: string; reason: string } | null;
    candidates: HsCodeRecord[];
    rawResponse?: string;
  } | null>(null);

  const handleAiRecommend = async () => {
    if (!aiRecommendInput.trim()) {
      toast.error('请输入产品描述');
      return;
    }
    setAiRecommendLoading(true);
    setAiRecommendResult(null);
    try {
      const res = await api.post<ApiResponse<typeof aiRecommendResult>, ApiResponse<typeof aiRecommendResult>>(
        '/hs-codes/ai-recommend',
        { productDescription: aiRecommendInput.trim() }
      );
      setAiRecommendResult(res.data || null);
    } catch {
      toast.error('AI 推荐失败，请稍后重试');
    } finally {
      setAiRecommendLoading(false);
    }
  };

  // 将分页/关键词状态同步写入 URL，支持书签与浏览器回退
  const syncToUrl = useCallback((kw: string, p: number, ps: number) => {
    const params = new URLSearchParams();
    if (kw) params.set('keyword', kw);
    if (p > 1) params.set('page', String(p));
    if (ps !== 20) params.set('pageSize', String(ps));
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname]);

  // 列表/搜索触发（关键词/页码/每页条数变化时重新加载）
  useEffect(() => {
    loadResults({ searchKeyword: debouncedKeyword, nextPage: page, currentPageSize: pageSize });
    syncToUrl(debouncedKeyword, page, pageSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedKeyword, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword]);

  const loadResults = async ({
    searchKeyword,
    nextPage,
    currentPageSize = pageSize,
  }: {
    searchKeyword: string;
    nextPage: number;
    currentPageSize?: number;
  }) => {
    setLoading(true);
    try {
      const trimmed = searchKeyword.trim();
      const response = await hsCodeService.list({
        keyword: trimmed,
        page: nextPage,
        pageSize: currentPageSize,
        fuzzy: trimmed.length >= 2,
      });
      setResults(response.data.items || []);
      setIsFuzzy(!!(response.data as { fuzzy?: boolean }).fuzzy && trimmed.length >= 2);
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

  return (
    <div className="flex flex-col h-full">
      <ModuleTabHeader tabs={EXPORT_TABS} moduleName="出口" />
      <PageHeader
        title="HS 编码查询"
        description="默认先展示 HSCode 列表，再按商品名称或编码过滤。"
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

      {/* 搜索栏 */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="输入商品名称（支持相似度匹配）或 HSCode 编码..."
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
            <Select
              value={String(pageSize)}
              onValueChange={(v) => {
                const ps = Number(v);
                setPageSize(ps);
                setPage(1);
                loadResults({ searchKeyword: debouncedKeyword, nextPage: 1, currentPageSize: ps });
              }}
            >
              <SelectTrigger className="w-[90px] h-10">
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
              keyword.trim() ? (
                <div className="text-center py-8 text-muted-foreground">
                  未找到相关结果，请尝试其他关键词
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
                    {isFuzzy && keyword.trim() && (
                      <Badge variant="secondary" className="ml-2 text-xs">相似度排序</Badge>
                    )}
                  </span>
                </div>

                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[120px]">HSCode</TableHead>
                        <TableHead className="max-w-[260px]">商品名称</TableHead>
                        {isFuzzy && keyword.trim() && <TableHead className="w-[70px]">相似度</TableHead>}
                        <TableHead className="w-[60px]">单位</TableHead>
                        <TableHead className="w-[80px]">退税率</TableHead>
                        <TableHead>监管条件</TableHead>
                        <TableHead className="w-[40px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((record) => (
                        <TableRow
                          key={record.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedRecord(record)}
                        >
                          <TableCell className="font-mono text-xs">{record.hsCode}</TableCell>
                          <TableCell className="max-w-[260px]">
                            <span className="block truncate text-sm" title={record.productName}>
                              {record.productName}
                            </span>
                          </TableCell>
                          {isFuzzy && keyword.trim() && (
                            <TableCell>
                              {record.similarity !== undefined ? (
                                <Badge
                                  variant={record.similarity >= 0.8 ? 'default' : record.similarity >= 0.5 ? 'secondary' : 'outline'}
                                  className="text-xs tabular-nums"
                                >
                                  {Math.round(record.similarity * 100)}%
                                </Badge>
                              ) : '-'}
                            </TableCell>
                          )}
                          <TableCell className="text-xs">{record.unit || '-'}</TableCell>
                          <TableCell className="text-xs">{formatPercent(record.refundRate)}</TableCell>
                          <TableCell className="max-w-[160px]">
                            {record.supervisionConditions ? (
                              <Badge variant="outline" className="text-xs truncate max-w-[140px] block">
                                {record.supervisionConditions.slice(0, 20)}
                                {record.supervisionConditions.length > 20 ? '…' : ''}
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
        {keyword.trim() ? `（搜索：${keyword}）` : '（默认全量列表）'}
      </div>

      {/* AI 智能推荐弹窗 */}
      <Dialog open={aiRecommendOpen} onOpenChange={setAiRecommendOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 智能推荐 HS 编码
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">产品描述</label>
              <div className="flex gap-2">
                <Input
                  placeholder="例如：天然石英石板材，用于橱柜台面"
                  value={aiRecommendInput}
                  onChange={(e) => setAiRecommendInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleAiRecommend()}
                />
                <Button onClick={() => void handleAiRecommend()} disabled={aiRecommendLoading}>
                  {aiRecommendLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">输入产品的详细描述，AI 将从 HS 码库中推荐最合适的编码。</p>
            </div>

            {aiRecommendLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI 正在分析商品描述...
              </div>
            )}

            {aiRecommendResult && !aiRecommendLoading && (
              <div className="space-y-3">
                {aiRecommendResult.recommendation ? (
                  <div className="rounded-lg border border-accent/60 bg-accent/20 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge className="font-mono text-sm">{aiRecommendResult.recommendation.hsCode}</Badge>
                      <span className="text-sm font-medium">{aiRecommendResult.recommendation.productName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{aiRecommendResult.recommendation.reason}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setKeyword(aiRecommendResult.recommendation!.hsCode);
                        setAiRecommendOpen(false);
                      }}
                    >
                      使用此编码搜索
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    {aiRecommendResult.rawResponse || '未找到合适的 HS 码推荐，请换用更详细的产品描述。'}
                  </div>
                )}

                {aiRecommendResult.candidates.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">参考候选（{aiRecommendResult.candidates.length} 条）</p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {aiRecommendResult.candidates.map((c) => (
                        <button
                          key={c.id}
                          className="w-full text-left flex items-center gap-2 rounded px-2 py-1 hover:bg-muted text-xs"
                          onClick={() => { setKeyword(c.hsCode); setAiRecommendOpen(false); }}
                        >
                          <span className="font-mono text-primary">{c.hsCode}</span>
                          <span className="text-muted-foreground truncate">{c.productName}</span>
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
