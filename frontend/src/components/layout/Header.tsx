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
import { UserCircle, Bell, Search, Package, FileText, Container, Building2, Loader2 } from 'lucide-react';
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

  // 处理结果点击 - 跳转到列表页并自动筛选
  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    
    // 所有类型都跳转到列表页并带上关键字筛选
    const keyword = encodeURIComponent(result.title);
    switch (result.type) {
      case 'product':
        router.push(`/dashboard/products?keyword=${keyword}`);
        break;
      case 'supplier':
        router.push(`/dashboard/suppliers?keyword=${keyword}`);
        break;
      case 'container':
        router.push(`/dashboard/containers?keyword=${keyword}`);
        break;
      case 'purchase':
        router.push(`/dashboard/purchase?keyword=${keyword}`);
        break;
      case 'sales':
        router.push(`/dashboard/sales?keyword=${keyword}`);
        break;
    }
  };

  // 获取图标
  const getIcon = (type: string) => {
    switch (type) {
      case 'product': return <Package className="h-4 w-4 text-blue-500" />;
      case 'supplier': return <Building2 className="h-4 w-4 text-green-500" />;
      case 'container': return <Container className="h-4 w-4 text-orange-500" />;
      case 'purchase': return <FileText className="h-4 w-4 text-purple-500" />;
      case 'sales': return <FileText className="h-4 w-4 text-cyan-500" />;
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
    <header className="flex h-14 items-center gap-4 border-b bg-muted/40 px-6">
      <div className="flex-1 flex items-center gap-4">
        {/* Global Search */}
        <div ref={searchRef} className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="搜索商品、供应商、货柜..."
            className="pl-8 bg-background"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowResults(true);
            }}
            onFocus={() => setShowResults(true)}
          />
          
          {/* 搜索结果下拉 */}
          {showResults && (searchQuery.length >= 2 || isSearching) && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-80 overflow-y-auto">
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
                      className="w-full px-3 py-2 flex items-center gap-3 hover:bg-muted transition-colors text-left"
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
            <Button variant="ghost" size="icon" className="relative rounded-full">
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
            <Button variant="ghost" size="icon" className="rounded-full">
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
            <DropdownMenuItem>个人设置</DropdownMenuItem>
            <DropdownMenuItem>系统帮助</DropdownMenuItem>
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
