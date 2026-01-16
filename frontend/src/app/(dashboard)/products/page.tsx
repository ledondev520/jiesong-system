'use client';

import { useState, useEffect } from 'react';
import { Product } from '@/types';
import { productService } from '@/services/product.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Plus, Pencil, Trash } from 'lucide-react';
import { ProductDialog } from './components/ProductDialog';
import { toast } from 'sonner';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setProducts([
        { id: '1', customsName: '800x800瓷砖', specification: '800*800', unit: '平方米', isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', customsName: '洗手盆', specification: '陶瓷', unit: '个', isActive: true, createdAt: '', updatedAt: '' },
      ]);
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
      // await productService.delete(id);
      setProducts(products.filter(p => p.id !== id));
      toast.success('商品已删除');
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingProduct) {
      // await productService.update(editingProduct.id, data);
      setProducts(products.map(p => p.id === editingProduct.id ? { ...p, ...data } : p));
      toast.success('商品更新成功');
    } else {
      // await productService.create(data);
      setProducts([...products, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
      toast.success('商品创建成功');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">商品管理</h2>
          <p className="text-muted-foreground">管理商品档案与规格信息。</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 新增商品
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>报关名称</TableHead>
              <TableHead>规格</TableHead>
              <TableHead>单位</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : products.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">暂无商品数据。</TableCell>
               </TableRow>
            ) : (
              products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.customsName}</TableCell>
                  <TableCell>{product.specification}</TableCell>
                  <TableCell>{product.unit}</TableCell>
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
