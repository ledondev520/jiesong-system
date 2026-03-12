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

function HsCodesPageContent() {
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';

  const [results, setResults] = useState<HsCodeRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [selectedRecord, setSelectedRecord] = useState<HsCodeRecord | null>(null);
  const debouncedKeyword = useDebouncedValue(keyword, 350);

  // 搜索触发
  useEffect(() => {
    if (debouncedKeyword.trim()) {
      loadResults(debouncedKeyword);
    } else {
      setResults([]);
    }
  }, [debouncedKeyword]);

  // 从 URL 同步关键字
  useEffect(() => {
    const urlKeyword = searchParams.get('keyword');
    if (urlKeyword && urlKeyword !== keyword) {
      setKeyword(urlKeyword);
    }
  }, [searchParams, keyword]);

  const loadResults = async (searchKeyword: string) => {
    setLoading(true);
    try {
      const response = await hsCodeService.search(searchKeyword);
      setResults(response.data || []);
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
        description="海关商品编码检索 - 支持商品名称或编码搜索"
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

            {selectedRecord.supervisionConditions && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">监管条件</h3>
                <p className="text-sm">{selectedRecord.supervisionConditions}</p>
              </div>
            )}

            {selectedRecord.declarationElements && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">申报要素</h3>
                <p className="text-sm">{selectedRecord.declarationElements}</p>
              </div>
            )}

            {selectedRecord.inspectionQuarantine && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-muted-foreground mb-1">检验检疫</h3>
                <p className="text-sm">{selectedRecord.inspectionQuarantine}</p>
              </div>
            )}

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
                  输入商品名称或 HSCode 开始搜索
                </div>
              )
            ) : (
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
            )}
          </CardContent>
        </Card>
      )}

      {/* 数据说明 */}
      <div className="mt-4 text-xs text-muted-foreground">
        数据来源：海关总署 - 共 {results.length} 条记录
        {keyword.trim() && `（搜索：${keyword}）`}
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
