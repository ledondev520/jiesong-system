/**
 * Input: 搜索关键字、统一搜索服务
 * Output: Header 全局搜索输入与结果面板
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Container,
  FileText,
  Loader2,
  Package,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  getDashboardSearchHref,
  searchDashboard,
  type DashboardSearchResult,
  type DashboardSearchResultType,
} from '@/services/dashboardSearch.service';

const SEARCH_DEBOUNCE_MS = 300;

const getResultIcon = (type: DashboardSearchResultType) => {
  switch (type) {
    case 'product':
      return <Package className="h-4 w-4 text-primary" />;
    case 'supplier':
      return <Building2 className="h-4 w-4 text-primary" />;
    case 'container':
      return <Container className="h-4 w-4 text-primary" />;
    case 'purchase':
    case 'sales':
      return <FileText className="h-4 w-4 text-primary" />;
  }
};

const getTypeLabel = (type: DashboardSearchResultType) => {
  switch (type) {
    case 'product':
      return '商品';
    case 'supplier':
      return '供应商';
    case 'container':
      return '货柜';
    case 'purchase':
      return '采购';
    case 'sales':
      return '销售';
  }
};

export function HeaderSearch() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DashboardSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  const runSearch = useEffectEvent(async (query: string, requestId: number) => {
    setIsSearching(true);

    try {
      const results = await searchDashboard(query);

      if (requestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        setSearchResults(results);
      });
    } catch (error) {
      console.error('搜索失败:', error);

      if (requestRef.current !== requestId) {
        return;
      }

      startTransition(() => {
        setSearchResults([]);
      });
    } finally {
      if (requestRef.current === requestId) {
        setIsSearching(false);
      }
    }
  });

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    const nextRequestId = requestRef.current + 1;
    requestRef.current = nextRequestId;

    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(normalizedQuery, nextRequestId);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleResultClick = (result: DashboardSearchResult) => {
    const href = getDashboardSearchHref(result);

    setShowResults(false);
    setSearchQuery('');
    router.push(href);
  };

  return (
    <div ref={searchRef} className="relative w-full max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="搜索商品、供应商、货柜..."
        className="h-10 bg-background pl-9"
        value={searchQuery}
        onChange={(event) => {
          setSearchQuery(event.target.value);
          setShowResults(true);
        }}
        onFocus={() => setShowResults(true)}
      />

      {showResults && (searchQuery.trim().length >= 2 || isSearching) && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border bg-popover shadow-md">
          {isSearching ? (
            <div className="flex items-center justify-center py-4 text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              搜索中...
            </div>
          ) : searchResults.length > 0 ? (
            <div className="py-1">
              {searchResults.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent"
                  onClick={() => handleResultClick(result)}
                >
                  {getResultIcon(result.type)}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{result.title}</div>
                    {result.subtitle && (
                      <div className="truncate text-xs text-muted-foreground">{result.subtitle}</div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(result.type)}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-sm text-muted-foreground">
              未找到相关结果
            </div>
          )}
        </div>
      )}
    </div>
  );
}
