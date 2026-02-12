/**
 * Input: 用户状态、后端搜索API
 * Output: 顶部导航栏组件
 * Pos: 全局Header，包含搜索、通知、用户菜单
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserCircle, Bell, Search, Package, FileText, Container, Building2, Loader2, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import api from '@/lib/axios';

interface SearchResult {
  type: 'product' | 'supplier' | 'container' | 'purchase' | 'sales';
  id: string;
  title: string;
  subtitle?: string;
}

export function Header() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const router = useRouter();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const todayLabel = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(new Date());

  // 搜索函数
  const performSearch = useCallback(async (query: string) => {
    if (!query || query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      // 并行搜索多个类型 - 使用正确的参数名
      const [productsRes, suppliersRes, containersRes, purchasesRes, salesRes] = await Promise.all([
        api.get('/products', { params: { keyword: query, pageSize: 5 } }).catch(() => ({ data: { items: [] } })),
        api.get('/suppliers', { params: { keyword: query, pageSize: 5 } }).catch(() => ({ data: { items: [] } })),
        api.get('/containers', { params: { keyword: query, pageSize: 5 } }).catch(() => ({ data: { items: [] } })),
        api.get('/purchases', { params: { keyword: query, pageSize: 5 } }).catch(() => ({ data: { items: [] } })),
        api.get('/sales', { params: { keyword: query, pageSize: 5 } }).catch(() => ({ data: { items: [] } })),
      ]);

      const results: SearchResult[] = [];

      // 处理商品结果
      const products = (productsRes as any).data?.items || [];
      products.forEach((p: any) => {
        results.push({
          type: 'product',
          id: p.id,
          title: p.customsName,
          subtitle: p.specification || p.unit,
        });
      });

      // 处理供应商结果
      const suppliers = (suppliersRes as any).data?.items || [];
      suppliers.forEach((s: any) => {
        results.push({
          type: 'supplier',
          id: s.id,
          title: s.name,
          subtitle: s.shortName,
        });
      });

      // 处理货柜结果
      const containers = (containersRes as any).data?.items || [];
      containers.forEach((c: any) => {
        results.push({
          type: 'container',
          id: c.id,
          title: c.containerNo,
          subtitle: c.status,
        });
      });

      // 处理采购合同结果
      const purchases = (purchasesRes as any).data?.items || [];
      purchases.forEach((p: any) => {
        results.push({
          type: 'purchase',
          id: p.id,
          title: p.contractNo,
          subtitle: p.supplier?.name || '采购合同',
        });
      });

      // 处理销售合同结果
      const sales = (salesRes as any).data?.items || [];
      sales.forEach((s: any) => {
        results.push({
          type: 'sales',
          id: s.id,
          title: s.contractNo,
          subtitle: `$${(s.totalAmount || 0).toLocaleString()}`,
        });
      });

      setSearchResults(results);
    } catch (error) {
      console.error('搜索失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, performSearch]);

  // 点击外部关闭搜索结果
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 处理结果点击 - 所有合同类直接跳转详情页，商品/供应商跳转列表页筛选
  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    
    switch (result.type) {
      case 'product':
        router.push(`/dashboard/products?keyword=${encodeURIComponent(result.title)}`);
        break;
      case 'supplier':
        router.push(`/dashboard/suppliers?keyword=${encodeURIComponent(result.title)}`);
        break;
      case 'container':
        // 货柜直接跳转到详情页
        router.push(`/dashboard/containers/${result.id}`);
        break;
      case 'purchase':
        // 采购合同直接跳转到详情页
        router.push(`/dashboard/purchase/${result.id}`);
        break;
      case 'sales':
        // 销售合同直接跳转到详情页
        router.push(`/dashboard/sales/${result.id}`);
        break;
    }
  };

  // 获取图标
  const getIcon = (type: string) => {
    switch (type) {
      case 'product': return <Package className="h-4 w-4 text-chart-1" />;
      case 'supplier': return <Building2 className="h-4 w-4 text-chart-3" />;
      case 'container': return <Container className="h-4 w-4 text-chart-5" />;
      case 'purchase': return <FileText className="h-4 w-4 text-chart-4" />;
      case 'sales': return <FileText className="h-4 w-4 text-primary" />;
      default: return <Search className="h-4 w-4" />;
    }
  };

  // 获取类型标签
  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'product': return '商品';
      case 'supplier': return '供应商';
      case 'container': return '货柜';
      case 'purchase': return '采购';
      case 'sales': return '销售';
      default: return '';
    }
  };

  return (
    <header className="surface-panel surface-mesh flex h-16 items-center gap-4 border-border/65 px-4 md:px-6">
      <div className="flex flex-1 items-center gap-4">
        <div className="hidden items-center gap-2 rounded-xl border border-border/70 bg-background/60 px-3 py-2 text-xs text-muted-foreground lg:flex">
          <CalendarDays className="h-3.5 w-3.5 text-accent" />
          <span>{todayLabel}</span>
        </div>

        {/* Global Search */}
        <div ref={searchRef} className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索商品、供应商、货柜..."
            className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
          />
          
          {/* 搜索结果下拉 */}
          {showResults && (searchQuery.length >= 2 || isSearching) && (
            <div className="surface-panel absolute left-0 right-0 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-xl">
              {isSearching ? (
                <div className="flex items-center justify-center py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  搜索中...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="py-1">
                  {searchResults.map((result, index) => (
                    <button
                      key={`${result.type}-${result.id}-${index}`}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/15"
                      onClick={() => handleResultClick(result)}
                    >
                      {getIcon(result.type)}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{result.title}</div>
                        {result.subtitle && (
                          <div className="text-xs text-muted-foreground truncate">{result.subtitle}</div>
                        )}
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {getTypeLabel(result.type)}
                      </Badge>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="py-4 text-center text-muted-foreground text-sm">
                  未找到相关结果
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative rounded-full border border-border/60 bg-background/50">
              <Bell className="h-5 w-5" />
              <span className="sr-only">通知</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px]">
            <DropdownMenuLabel>消息通知</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="py-6 text-center text-muted-foreground text-sm">
              暂无新通知
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full border border-border/60 bg-background/50">
              <UserCircle className="h-5 w-5" />
              <span className="sr-only">用户菜单</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name || '管理员'}</span>
                <span className="text-xs text-muted-foreground font-normal">{user?.username}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>
              个人设置
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => {
              logout();
              window.location.href = '/login';
            }}>
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
