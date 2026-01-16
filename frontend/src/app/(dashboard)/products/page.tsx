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

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Mock data loader for now
  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      // TODO: Use actual API
      // const res = await productService.getAll();
      // setProducts(res.data.items);
      
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setProducts([
        { id: '1', customsName: 'Porcelain Tiles', specification: '800*800', unit: 'sqm', isActive: true, createdAt: '', updatedAt: '' },
        { id: '2', customsName: 'Wash Basin', specification: 'Ceramic', unit: 'pcs', isActive: true, createdAt: '', updatedAt: '' },
      ]);
    } catch (error) {
      console.error(error);
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
    if (confirm('Are you sure?')) {
      // await productService.delete(id);
      setProducts(products.filter(p => p.id !== id));
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingProduct) {
      // await productService.update(editingProduct.id, data);
      setProducts(products.map(p => p.id === editingProduct.id ? { ...p, ...data } : p));
    } else {
      // await productService.create(data);
      setProducts([...products, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Products</h2>
          <p className="text-muted-foreground">Manage your product catalog.</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Product
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Specification</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">Loading...</TableCell>
               </TableRow>
            ) : products.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">No products found.</TableCell>
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
