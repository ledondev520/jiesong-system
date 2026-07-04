/**
 * Input: 商品分类服务 API
 * Output: 商品分类管理页面（表格、批量操作、导入导出）
 * Pos: 系统设置 > 基础数据 > 商品分类
 */

'use client';

import { useState, useEffect } from 'react';
import {
  getSystemCategories,
  createSystemCategory,
  updateSystemCategory,
  deleteSystemCategory,
  SystemCategoryItem,
} from '@/services/system.service';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Tag, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BatchActionBar } from '@/components/settings/BatchActionBar';
import { ImportExportButtons } from '@/components/settings/ImportExportButtons';
import * as XLSX from 'xlsx';

export default function CategoriesPage() {
  const [categories, setCategories] = useState<SystemCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SystemCategoryItem | null>(null);
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formName, setFormName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    try {
      const response = await getSystemCategories({ page: 1, pageSize: 100 });
      setCategories(response.data?.items || []);
    } catch {
      toast.error('加载商品分类失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingCategory(null);
    setFormName('');
    setIsDialogOpen(true);
  };

  const handleEdit = (category: SystemCategoryItem) => {
    setEditingCategory(category);
    setFormName(category.name);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此分类吗？')) {
      try {
        await deleteSystemCategory(id);
        setCategories(categories.filter((c) => c.id !== id));
        toast.success('分类删除成功');
      } catch (err) {
        const msg = err && typeof err === 'object' && 'response' in err
          ? (err.response as { data?: { message?: string } })?.data?.message
          : undefined;
        toast.error(msg || '删除失败');
      }
    }
  };

  const handleBatchDelete = async () => {
    if (confirm(`确定要删除选中的 ${selectedIds.size} 个分类吗？`)) {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map((id) => deleteSystemCategory(id)));
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      setCategories(categories.filter((c) => !selectedIds.has(c.id)));
      setSelectedIds(new Set());
      toast.success(`已删除 ${successCount} 个分类`);
    }
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error('分类名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      if (editingCategory) {
        await updateSystemCategory(editingCategory.id, { name });
        toast.success('分类更新成功');
      } else {
        await createSystemCategory({ name });
        toast.success('分类创建成功');
      }
      setIsDialogOpen(false);
      loadCategories();
    } catch {
      toast.error(editingCategory ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImport = async (rows: Array<Record<string, unknown>>) => {
    const payloads = rows
      .map((r) => ({
        name: String(r['名称'] || r['name'] || ''),
      }))
      .filter((r) => r.name);

    if (payloads.length === 0) throw new Error('无有效数据');

    await Promise.allSettled(payloads.map((p) => createSystemCategory(p)));
    loadCategories();
  };

  const filteredCategories = keyword.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(keyword.trim().toLowerCase()))
    : categories;

  const totalPages = Math.ceil(filteredCategories.length / pageSize);
  const pagedCategories = filteredCategories.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedCategories.length && pagedCategories.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedCategories.map((c) => c.id)));
    }
  };

  const handleReset = () => {
    setKeyword('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="商品分类"
        description="管理商品分类体系"
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索分类名称..."
                value={keyword}
                onChange={(e) => { setKeyword(e.target.value); setCurrentPage(1); }}
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
              />
            </div>
            {keyword && (
              <Button variant="ghost" size="sm" className="h-10 rounded-xl" onClick={handleReset}>
                <X className="mr-1 h-4 w-4" />
                重置
              </Button>
            )}
            <ImportExportButtons
              data={filteredCategories as unknown as Record<string, unknown>[]}
              filename="商品分类"
              columns={[
                { key: 'name', label: '名称' },
              ]}
              onImport={handleImport}
            />
            <Button onClick={handleCreate} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> 新增分类
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增分类
        </Button>
      </div>

      <BatchActionBar
        count={selectedIds.size}
        onDelete={handleBatchDelete}
        onExport={() => {
          const selected = categories.filter((c) => selectedIds.has(c.id));
          if (selected.length === 0) return;
          const ws = XLSX.utils.json_to_sheet(selected.map((c) => ({ 名称: c.name })));
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '分类');
          XLSX.writeFile(wb, '选中分类数据.xlsx');
          toast.success('导出成功');
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      <div className="hidden md:block surface-panel overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : pagedCategories.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={<Tag className="h-8 w-8" />}
              title={keyword ? '没有符合条件的分类' : '暂无分类数据'}
              description="还没有添加任何商品分类，点击下方的按钮开始创建"
              action={{ label: '新增分类', onClick: () => setIsDialogOpen(true) }}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={pagedCategories.length > 0 && selectedIds.size === pagedCategories.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-12 text-muted-foreground">#</TableHead>
                <TableHead className="text-muted-foreground">名称</TableHead>
                <TableHead className="text-muted-foreground">父级</TableHead>
                <TableHead className="text-muted-foreground">商品数</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedCategories.map((category, index) => (
                <TableRow key={category.id} className="group transition-colors hover:bg-muted/40">
                  <TableCell>
                    <Checkbox checked={selectedIds.has(category.id)} onCheckedChange={() => toggleSelect(category.id)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {category.parent?.name || '-'}
                  </TableCell>
                  <TableCell>
                    {category._count?.products !== undefined && category._count.products > 0 ? (
                      <Badge variant="outline" className="text-[10px]">{category._count.products}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(category)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(category.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* 移动端卡片视图 */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        ) : pagedCategories.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {keyword ? '没有符合条件的分类' : '暂无分类数据。'}
            </CardContent>
          </Card>
        ) : (
          pagedCategories.map((category) => (
            <Card key={category.id} className="border-border/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tracking-tight">{category.name}</p>
                    {category.parent && (
                      <p className="text-sm text-muted-foreground">父级: {category.parent.name}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-11 rounded-2xl" onClick={() => handleEdit(category)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                  <Button variant="outline" className="h-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => handleDelete(category.id)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    删除
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {filteredCategories.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
        <div className="flex flex-wrap items-center gap-2">
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

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingCategory ? '编辑分类' : '新增分类'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="category-name">分类名称 *</Label>
              <Input id="category-name" placeholder="例如：家具" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
