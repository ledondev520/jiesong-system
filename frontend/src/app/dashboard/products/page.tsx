/**
 * Input: 商品服务API、库存服务API
 * Output: 商品管理页面（含商品档案 + 库存状态两个子 Tab）
 * Pos: 采购模块子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Suspense, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Product } from '@/types';
import { productService } from '@/services/product.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash, Search, Package, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductDialog } from './components/ProductDialog';
import { InventoryTab } from './components/InventoryTab';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { MobileListCard } from '@/components/mobile';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * 职责：将输入值延迟一段时间后再稳定输出，避免高频副作用触发。
 * 思路：
 * 1. 每次 value 变化时启动新的定时器；
 * 2. 在 cleanup 中清理上一次定时器，确保只保留最后一次输入；
 * 3. 定时到期后更新防抖值。
 * @param value 需要进行防抖处理的输入值
 * @param delay 防抖延迟时间（毫秒）
 * @returns 延迟稳定后的值
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // 1. 启动延迟更新
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 2. 清理上一次定时器
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// 默认每页条数（由 PageSizeSelect 组件控制）
const DEFAULT_PAGE_SIZE = 20;

function ProductsPageContent() {
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [keyword, setKeyword] = useState(initialKeyword);
  const debouncedKeyword = useDebouncedValue(keyword, 350);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // 0. 输入停止一段时间后再触发查询，降低请求频率
  useEffect(() => {
    setCurrentPage(1);
    loadProducts(debouncedKeyword);
  }, [debouncedKeyword]);

  // 从URL参数初始化关键字
  useEffect(() => {
    const urlKeyword = searchParams.get('keyword');
    if (urlKeyword && urlKeyword !== keyword) {
      setKeyword(urlKeyword);
    }
  }, [searchParams, keyword]);

  const loadProducts = async (searchKeyword?: string) => {
    setLoading(true);
    try {
      const response = await productService.getAll({ 
        page: 1, 
        pageSize: 100,
        keyword: searchKeyword || undefined,
        lite: true,
      });
      setProducts(response.data?.items || []);
    } catch {
      toast.error('加载商品失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  /**
   * 职责：打开删除确认弹窗并记录当前待删除商品。
   * 思路：先缓存目标商品，再打开受控弹窗供用户确认。
   * @param product 待删除的商品记录
   */
  const openDeleteDialog = (product: Product) => {
    // 0. 初始化待删除上下文
    setProductToDelete(product);
    setDeleteDialogOpen(true);
  };

  /**
   * 职责：执行商品删除并同步本地列表状态。
   * 思路：
   * 1. 校验待删除商品是否存在；
   * 2. 调用删除接口并在成功后更新本地列表；
   * 3. 收口弹窗与加载态。
   * @returns Promise<void>
   */
  const handleDeleteProduct = async (): Promise<void> => {
    if (!productToDelete) {
      return;
    }

    setDeleting(true);
    try {
      await productService.delete(productToDelete.id);
      setProducts((prevProducts) =>
        prevProducts.filter((product) => product.id !== productToDelete.id)
      );
      toast.success('商品已删除');
      setDeleteDialogOpen(false);
      setProductToDelete(null);
    } catch {
      toast.error('删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (data: Record<string, unknown>) => {
    try {
      if (editingProduct) {
        await productService.update(editingProduct.id, data);
        toast.success('商品更新成功');
      } else {
        await productService.create(data);
        toast.success('商品创建成功');
      }
      setIsDialogOpen(false);
      loadProducts();
    } catch {
      toast.error(editingProduct ? '更新失败' : '创建失败');
    }
  };

  const totalPages = Math.ceil(products.length / pageSize);
  const pagedProducts = products.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="商品管理"
        description="管理商品档案、规格信息与库存状态"
      />

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">商品档案</TabsTrigger>
          <TabsTrigger value="inventory">库存状态</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-6">
          <div className="flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
              />
            </div>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 rounded-xl"
                onClick={() => { setKeyword(''); setCurrentPage(1); }}
              >
                <X className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
            <Button onClick={handleCreate} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> 新增商品
            </Button>
          </div>

          {/* 移动端卡片列表 */}
          <div className="space-y-3 md:hidden">
            {loading ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
            ) : products.length === 0 ? (
              <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
                {keyword ? '没有匹配的商品' : '暂无商品，点击右上角新增'}
              </div>
            ) : (
              pagedProducts.map((product) => (
                <MobileListCard
                  key={product.id}
                  title={product.customsName}
                  subtitle={[product.specification, product.unit].filter(Boolean).join(' · ') || '-'}
                  fields={[
                    { label: '包装规格', value: product.packingSpec || '-' },
                    { label: '毛重', value: product.grossWeight != null ? `${product.grossWeight} kg` : '-' },
                    { label: '净重', value: product.netWeight != null ? `${product.netWeight} kg` : '-' },
                    { label: '体积', value: product.volume != null ? `${product.volume} CBM` : '-' },
                  ]}
                  action={
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="h-10 flex-1 rounded-xl" onClick={() => handleEdit(product)}>
                        <Pencil className="mr-1 h-4 w-4" /> 编辑
                      </Button>
                      <Button variant="ghost" size="sm" className="h-10 rounded-xl px-3" onClick={() => openDeleteDialog(product)}>
                        <Trash className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  }
                />
              ))
            )}
          </div>

          {/* 桌面端表格 */}
          <div className="surface-panel hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>报关名称</TableHead>
                  <TableHead>规格</TableHead>
                  <TableHead>单位</TableHead>
                  <TableHead className="hidden md:table-cell">包装规格</TableHead>
                  <TableHead className="hidden md:table-cell text-right">毛重(kg)</TableHead>
                  <TableHead className="hidden md:table-cell text-right">净重(kg)</TableHead>
                  <TableHead className="hidden md:table-cell text-right">体积(CBM)</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                   <TableRow>
                     <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
                   </TableRow>
                ) : products.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={8} className="p-0">
                       <EmptyState
                         icon={Package}
                         title="暂无商品"
                         description="还没有添加任何商品，点击右上角「新增商品」开始创建。"
                       />
                     </TableCell>
                   </TableRow>
                ) : (
                  pagedProducts.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.customsName}</TableCell>
                      <TableCell>{product.specification || '-'}</TableCell>
                      <TableCell>{product.unit || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell">{product.packingSpec || '-'}</TableCell>
                      <TableCell className="hidden md:table-cell text-right">{product.grossWeight ?? '-'}</TableCell>
                      <TableCell className="hidden md:table-cell text-right">{product.netWeight ?? '-'}</TableCell>
                      <TableCell className="hidden md:table-cell text-right">{product.volume ?? '-'}</TableCell>
                      <TableCell className="flex gap-1 sm:gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`删除商品 ${product.customsName}`}
                          onClick={() => openDeleteDialog(product)}
                        >
                          <Trash className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页控制 */}
          <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>共 {products.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
            <div className="flex items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => { setPageSize(size); setCurrentPage(1); }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || totalPages <= 1}
              >
                下一页
              </Button>
            </div>
          </div>

          <ProductDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            product={editingProduct}
            onSubmit={handleSubmit}
          />

          <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>确认删除</AlertDialogTitle>
                <AlertDialogDescription>
                  确定要删除商品 <strong>{productToDelete?.customsName}</strong> 吗？
                  <br />
                  此操作无法撤销。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={deleting}
                  onClick={() => setProductToDelete(null)}
                >
                  取消
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProduct}
                  disabled={deleting}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {deleting ? '删除中...' : '确认删除'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="inventory">
          <InventoryTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-muted-foreground">加载中...</div>}>
      <ProductsPageContent />
    </Suspense>
  );
}
