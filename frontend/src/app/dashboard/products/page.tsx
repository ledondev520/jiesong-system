/**
 * Input: 商品服务API
 * Output: 商品管理页面
 * Pos: 基础档案子页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
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
import { Plus, Pencil, Trash, Search } from 'lucide-react';
import { ProductDialog } from './components/ProductDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from 'sonner';

export default function ProductsPage() {
  const searchParams = useSearchParams();
  const initialKeyword = searchParams.get('keyword') || '';
  
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [keyword, setKeyword] = useState(initialKeyword);

  useEffect(() => {
    loadProducts(keyword);
  }, [keyword]);

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
      });
      setProducts(response.data?.items || []);
    } catch (error) {
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

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除这个商品吗？')) {
      try {
        await productService.delete(id);
        setProducts(products.filter(p => p.id !== id));
        toast.success('商品已删除');
      } catch (error) {
        toast.error('删除失败');
      }
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
    } catch (error) {
      toast.error(editingProduct ? '更新失败' : '创建失败');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="商品管理"
        description="管理商品档案与规格信息"
        backHref="/dashboard/settings?tab=master"
        backLabel="返回"
        actions={
          <div className="flex gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button onClick={handleCreate}>
              <Plus className="mr-2 h-4 w-4" /> 新增商品
            </Button>
          </div>
        }
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>报关名称</TableHead>
              <TableHead>规格</TableHead>
              <TableHead>单位</TableHead>
              <TableHead>包装规格</TableHead>
              <TableHead className="text-right">毛重(kg)</TableHead>
              <TableHead className="text-right">净重(kg)</TableHead>
              <TableHead className="text-right">体积(CBM)</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={8} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : products.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={8} className="text-center py-10">暂无商品数据。</TableCell>
               </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.customsName}</TableCell>
                  <TableCell>{product.specification || '-'}</TableCell>
                  <TableCell>{product.unit || '-'}</TableCell>
                  <TableCell>{product.packingSpec || '-'}</TableCell>
                  <TableCell className="text-right">{product.grossWeight ?? '-'}</TableCell>
                  <TableCell className="text-right">{product.netWeight ?? '-'}</TableCell>
                  <TableCell className="text-right">{product.volume ?? '-'}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(product)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(product.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ProductDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        product={editingProduct}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
