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
import { Plus, Pencil, Trash, AlertTriangle, Search, X } from 'lucide-react';
import { SupplierDialog } from './components/SupplierDialog';
import type { SupplierFormValues } from './components/SupplierDialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PageSizeSelect } from '@/components/ui/page-size-select';

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  // 搜索与分页状态
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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

  // 根据关键词过滤与分页
  const filteredSuppliers = keyword.trim()
    ? suppliers.filter((s) => {
        const kw = keyword.trim().toLowerCase();
        return (
          s.name.toLowerCase().includes(kw) ||
          (s.shortName || '').toLowerCase().includes(kw) ||
          (s.contactName || '').toLowerCase().includes(kw) ||
          (s.aliases || []).some((a) => a.alias.toLowerCase().includes(kw))
        );
      })
    : suppliers;
  const totalPages = Math.ceil(filteredSuppliers.length / pageSize);
  const pagedSuppliers = filteredSuppliers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleReset = () => {
    setKeyword('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader 
        title="商家管理"
        description="管理供应商档案与质量记录"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索供应商名称..."
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setCurrentPage(1); }}
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
              />
            </div>
            {keyword && (
              <Button variant="ghost" size="sm" className="h-10 rounded-xl" onClick={handleReset}>
                <X className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
            <Button onClick={handleCreate} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> 新增供应商
            </Button>
          </div>
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
            ) : pagedSuppliers.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">{keyword ? '没有符合条件的供应商' : '暂无供应商数据。'}</TableCell>
               </TableRow>
            ) : (
              pagedSuppliers.map((supplier) => (
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

      {/* 分页控制 */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>共 {filteredSuppliers.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
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

      <SupplierDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        supplier={editingSupplier}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
