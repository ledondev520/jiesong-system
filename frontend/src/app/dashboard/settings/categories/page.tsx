/**
 * Input: 系统商品分类 API
 * Output: 商品分类 CRUD 页面
 * Pos: 设置中心 - 数据域配置
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  createSystemCategory,
  deleteSystemCategory,
  getSystemCategories,
  type SystemCategoryItem,
  updateSystemCategory,
} from '@/services/system.service';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CategoryFormState {
  name: string;
  parentId: string;
}

const defaultForm: CategoryFormState = {
  name: '',
  parentId: '',
};

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<SystemCategoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SystemCategoryItem | null>(null);
  const [form, setForm] = useState<CategoryFormState>(defaultForm);

  const loadCategories = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSystemCategories({ page: 1, pageSize: 200 });
      setCategories(response.data?.items || []);
    } catch {
      toast.error('加载商品分类失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  const selectableParents = useMemo(() => {
    return categories.filter((item) => item.id !== editingCategory?.id);
  }, [categories, editingCategory]);

  const openCreateDialog = () => {
    setEditingCategory(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: SystemCategoryItem) => {
    setEditingCategory(item);
    setForm({
      name: item.name,
      parentId: item.parentId || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      toast.error('请填写分类名称');
      return;
    }

    setSubmitting(true);
    try {
      if (editingCategory) {
        await updateSystemCategory(editingCategory.id, {
          name: form.name.trim(),
          parentId: form.parentId || null,
        });
        toast.success('分类更新成功');
      } else {
        await createSystemCategory({
          name: form.name.trim(),
          parentId: form.parentId || null,
        });
        toast.success('分类创建成功');
      }

      setDialogOpen(false);
      setForm(defaultForm);
      await loadCategories();
    } catch {
      toast.error(editingCategory ? '分类更新失败' : '分类创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该分类吗？')) {
      return;
    }

    try {
      await deleteSystemCategory(id);
      toast.success('分类删除成功');
      await loadCategories();
    } catch {
      toast.error('分类删除失败，请确认无子分类和关联商品');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="商品分类配置"
        description="维护商品分类层级，支持父子分类关系"
        backHref="/dashboard/settings"
        backLabel="返回设置"
        actions={
          <Button onClick={openCreateDialog} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            新增分类
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>分类名称</TableHead>
              <TableHead>父分类</TableHead>
              <TableHead className="text-right">子分类数</TableHead>
              <TableHead className="text-right">商品数</TableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">暂无商品分类配置。</TableCell>
              </TableRow>
            ) : (
              categories.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.parent?.name || '-'}</TableCell>
                  <TableCell className="text-right">{item._count?.children || 0}</TableCell>
                  <TableCell className="text-right">{item._count?.products || 0}</TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => openEditDialog(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => void handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>{editingCategory ? '编辑分类' : '新增分类'}</DialogTitle>
            <DialogDescription>可选择父分类构建层级结构。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="category-name">分类名称</Label>
              <Input
                id="category-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：地砖"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-parent">父分类</Label>
              <select
                id="category-parent"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.parentId}
                onChange={(event) => setForm((prev) => ({ ...prev, parentId: event.target.value }))}
              >
                <option value="">无（一级分类）</option>
                {selectableParents.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
