/**
 * Input: 搜索关键字、统一搜索服务、Command 组件
 * Output: 手机端图标 / 桌面端搜索入口与可滚动 Command 弹窗，仅展示当前查询结果
 * Pos: 前端布局子组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  FileText,
  Loader2,
  Package,
  Search,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  getDashboardSearchHref,
  searchDashboard,
  type DashboardSearchResult,
  type DashboardSearchResultType,
} from '@/services/dashboardSearch.service';

const getResultIcon = (type: DashboardSearchResultType) => {
  switch (type) {
    case 'product':
      return <Package className="h-4 w-4 text-primary" />;
    case 'supplier':
      return <Building2 className="h-4 w-4 text-primary" />;
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
    case 'purchase':
      return '采购';
    case 'sales':
      return '出口合同';
  }
};

export function HeaderSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<DashboardSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // 监听 Cmd+K / Ctrl+K 快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 搜索逻辑
  useEffect(() => {
    const normalizedQuery = searchQuery.trim();

    if (normalizedQuery.length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchDashboard(normalizedQuery);
        if (active) setSearchResults(results);
      } catch (error) {
        if (!active) return;
        console.error('搜索失败:', error);
        setSearchResults([]);
      } finally {
        if (active) setIsSearching(false);
      }
    }, 300);

    return () => { active = false; window.clearTimeout(timer); };
  }, [searchQuery]);

  const handleSelect = (result: DashboardSearchResult) => {
    const href = getDashboardSearchHref(result);
    setOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    router.push(href);
  };

  return (
    <>
      {/* 搜索触发器：点击打开 Command 弹窗 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="搜索商品、供应商、合同"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-input bg-background hover:bg-accent md:h-auto md:w-full md:max-w-md md:justify-start md:border-0"
      >
        <Search className="h-5 w-5 text-muted-foreground md:absolute md:left-3 md:top-1/2 md:h-4 md:w-4 md:-translate-y-1/2" />
        <div className="hidden h-10 w-full min-w-0 items-center rounded-lg border border-input/80 bg-muted/50 pl-9 pr-3 text-sm text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-muted md:flex">
          <span className="min-w-0 flex-1 truncate text-left">搜索商品、供应商、合同...</span>
          <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-background px-1.5 font-mono text-[10px] font-medium opacity-100 sm:inline-flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </div>
      </button>

      {/* Command 弹窗搜索面板 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex flex-col gap-0 overflow-hidden px-0 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[env(safe-area-inset-bottom)] sm:p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>全局搜索</DialogTitle>
            <DialogDescription>搜索采购合同、出口合同、供应商、商品</DialogDescription>
          </DialogHeader>
          <Command shouldFilter={false} className="min-h-0 flex-1">
            <CommandInput
              className="pr-12"
              placeholder="输入关键词搜索..."
              value={searchQuery}
              onValueChange={setSearchQuery}
            />
            <CommandList className="min-h-0 flex-1 max-h-none sm:max-h-[300px]">
              {isSearching ? (
                <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  搜索中...
                </div>
              ) : searchQuery.trim().length < 2 ? (
                <CommandEmpty>输入至少 2 个字符开始搜索</CommandEmpty>
              ) : searchResults.length === 0 ? (
                <CommandEmpty>未找到相关结果</CommandEmpty>
              ) : (
                <CommandGroup heading="搜索结果">
                  {searchResults.map((result, index) => (
                    <CommandItem
                      key={`${result.type}-${result.id}-${index}`}
                      onSelect={() => handleSelect(result)}
                      className="flex items-center gap-3"
                    >
                      {getResultIcon(result.type)}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{result.title}</div>
                        {result.subtitle && (
                          <div className="truncate text-xs text-muted-foreground">{result.subtitle}</div>
                        )}
                      </div>
                      <span className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {getTypeLabel(result.type)}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
