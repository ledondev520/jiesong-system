'use client';

import { useState, useEffect } from 'react';
import { Supplier } from '@/types';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash, AlertTriangle } from 'lucide-react';
import { SupplierDialog } from './components/SupplierDialog';
import { toast } from 'sonner';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  useEffect(() => {
    loadSuppliers();
  }, []);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setSuppliers([
        { 
          id: '1', 
          name: '佛山XX陶瓷有限公司', 
          shortName: '佛山陶瓷', 
          contactName: '黎总', 
          hasQualityIssue: false, 
          isActive: true, 
          createdAt: '', 
          updatedAt: '',
          aliases: [{ id: 'a1', alias: '黎总', supplierId: '1', createdAt: '' }]
        },
        { 
          id: '2', 
          name: '广州XX卫浴厂', 
          shortName: '广州卫浴', 
          hasQualityIssue: true, 
          qualityNote: '上一批货有裂纹',
          isActive: true, 
          createdAt: '', 
          updatedAt: '' 
        },
      ]);
    } catch (error) {
      toast.error('加载供应商失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSupplier(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此供应商吗？')) {
      setSuppliers(suppliers.filter(s => s.id !== id));
      toast.success('供应商已删除');
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingSupplier) {
      setSuppliers(suppliers.map(s => s.id === editingSupplier.id ? { ...s, ...data, id: s.id } : s));
      toast.success('供应商更新成功');
    } else {
      setSuppliers([...suppliers, { id: Math.random().toString(), ...data, isActive: true, createdAt: '', updatedAt: '' }]);
      toast.success('供应商创建成功');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">供应商管理</h2>
          <p className="text-muted-foreground">管理供应商档案与质量记录。</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 新增供应商
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>公司名称</TableHead>
              <TableHead>别名</TableHead>
              <TableHead>联系人</TableHead>
              <TableHead>质量状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : suppliers.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="text-center py-10">暂无供应商数据。</TableCell>
               </TableRow>
            ) : (
              suppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>
                    <div className="font-medium">{supplier.name}</div>
                    {supplier.shortName && <div className="text-xs text-muted-foreground">{supplier.shortName}</div>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {supplier.aliases?.map(a => (
                        <Badge key={a.id} variant="secondary" className="text-xs">{a.alias}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{supplier.contactName}</div>
                    <div className="text-xs text-muted-foreground">{supplier.contactPhone}</div>
                  </TableCell>
                  <TableCell>
                    {supplier.hasQualityIssue ? (
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm font-medium">质量问题</span>
                      </div>
                    ) : (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">正常</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(supplier)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(supplier.id)}>
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        supplier={editingSupplier}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
