/**
 * Input: 供应商服务API
 * Output: 供应商管理页面
 * Pos: 基础档案子页面
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { Supplier } from '@/types';
import { supplierService } from '@/services/supplier.service';
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
import type { SupplierFormValues } from './components/SupplierDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
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
      const response = await cachedFetch('suppliers-list', () => supplierService.getAll({ page: 1, pageSize: 100 }));
      setSuppliers(response.data?.items || []);
    } catch {
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
      try {
        await supplierService.delete(id);
        setSuppliers(suppliers.filter(s => s.id !== id));
        toast.success('供应商已删除');
      } catch {
        toast.error('删除失败');
      }
    }
  };

  const handleSubmit = async (data: SupplierFormValues) => {
    const payload = {
      ...data,
      aliases: data.aliases?.map((alias) => ({ alias: alias.alias })),
    };

    try {
      if (editingSupplier) {
        await supplierService.update(editingSupplier.id, payload);
        toast.success('供应商更新成功');
      } else {
        await supplierService.create(payload);
        toast.success('供应商创建成功');
      }
      setIsDialogOpen(false);
      invalidateCache('suppliers-list');
      loadSuppliers();
    } catch {
      toast.error(editingSupplier ? '更新失败' : '创建失败');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader 
        title="商家管理"
        description="管理供应商档案与质量记录"
        actions={
          <Button onClick={handleCreate} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> 新增供应商
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
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
                 <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
               </TableRow>
            ) : suppliers.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">暂无供应商数据。</TableCell>
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
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">正常</Badge>
                    )}
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleEdit(supplier)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => handleDelete(supplier.id)}>
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
