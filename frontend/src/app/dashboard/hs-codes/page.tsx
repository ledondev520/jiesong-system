/**
 * Input: HSCode 搜索服务
 * Output: HSCode 查询页面
 * Pos: 基础档案子页面 - HSCode 检索
 */

'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { Search, ChevronRight } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
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
  const initialKeyword = searchParams.get('keyword') || '';

  const [results, setResults] = useState<HsCodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedRecord, setSelectedRecord] = useState<HsCodeRecord | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const debouncedKeyword = useDebouncedValue(keyword, 350);
  const pageSize = 50;
  const declarationElements = parseDeclarationElements(selectedRecord?.declarationElements);
  const supervisionItems = parseStructuredItems(selectedRecord?.supervisionConditions);
  const inspectionItems = parseStructuredItems(selectedRecord?.inspectionQuarantine);

  // 列表/搜索触发
  useEffect(() => {
    loadResults({ searchKeyword: debouncedKeyword, nextPage: page });
  }, [debouncedKeyword, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedKeyword]);

  // 从 URL 同步关键字
  useEffect(() => {
    const urlKeyword = searchParams.get('keyword');
    if (urlKeyword && urlKeyword !== keyword) {
      setKeyword(urlKeyword);
    }
  }, [searchParams, keyword]);

  const loadResults = async ({
    searchKeyword,
    nextPage,
  }: {
    searchKeyword: string;
    nextPage: number;
  }) => {
    setLoading(true);
    try {
      const response = await hsCodeService.list({
        keyword: searchKeyword.trim(),
        page: nextPage,
        pageSize,
      });
      setResults(response.data.items || []);
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
      <PageHeader
        title="HSCode 查询"
        description="默认先展示 HSCode 列表，再按商品名称或编码过滤。"
      />

      {/* 搜索栏 */}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="输入商品名称或 HSCode 编码..."
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="pl-10"
            />
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HSCode</TableHead>
                      <TableHead>商品名称</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead>退税率</TableHead>
                      <TableHead>监管条件</TableHead>
                      <TableHead className="w-[80px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {results.map((record) => (
                      <TableRow
                        key={record.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedRecord(record)}
                      >
                        <TableCell className="font-mono">{record.hsCode}</TableCell>
                        <TableCell>{record.productName}</TableCell>
                        <TableCell>{record.unit || '-'}</TableCell>
                        <TableCell>{formatPercent(record.refundRate)}</TableCell>
                        <TableCell>
                          {record.supervisionConditions ? (
                            <Badge variant="outline" className="text-xs">
                              {record.supervisionConditions.slice(0, 20)}
                              {record.supervisionConditions.length > 20 ? '...' : ''}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <ChevronRight className="h-4 w-4" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    共 {total} 条记录，第 {page} / {totalPages} 页
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((current) => Math.max(current - 1, 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages || loading}
                      onClick={() => setPage((current) => Math.min(current + 1, totalPages))}
                    >
                      下一页
                    </Button>
                  </div>
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
