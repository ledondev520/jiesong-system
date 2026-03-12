/**
 * Input: 系统港口配置 API
 * Output: 港口配置 CRUD 页面
 * Pos: 设置中心 - 数据域配置
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createSystemPort, deleteSystemPort, getSystemPorts, type SystemPortItem, updateSystemPort } from '@/services/system.service';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface PortFormState {
  name: string;
  code: string;
  isActive: boolean;
}

const defaultForm: PortFormState = {
  name: '',
  code: '',
  isActive: true,
};

export default function PortsSettingsPage() {
  const [ports, setPorts] = useState<SystemPortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editingPort, setEditingPort] = useState<SystemPortItem | null>(null);
  const [form, setForm] = useState<PortFormState>(defaultForm);

  const loadPorts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getSystemPorts({ page: 1, pageSize: 200, includeInactive: true });
      setPorts(response.data?.items || []);
    } catch {
      toast.error('加载港口配置失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPorts();
  }, [loadPorts]);

  const openCreateDialog = () => {
    setEditingPort(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEditDialog = (item: SystemPortItem) => {
    setEditingPort(item);
    setForm({
      name: item.name,
      code: item.code,
      isActive: item.isActive,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.code.trim()) {
      toast.error('请填写港口名称和代码');
      return;
    }

    setSubmitting(true);
    try {
      if (editingPort) {
        await updateSystemPort(editingPort.id, {
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          isActive: form.isActive,
        });
        toast.success('港口更新成功');
      } else {
        await createSystemPort({
          name: form.name.trim(),
          code: form.code.trim().toUpperCase(),
          isActive: form.isActive,
        });
        toast.success('港口创建成功');
      }
      setDialogOpen(false);
      setForm(defaultForm);
      await loadPorts();
    } catch {
      toast.error(editingPort ? '港口更新失败' : '港口创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定停用该港口吗？')) {
      return;
    }

    try {
      await deleteSystemPort(id);
      toast.success('港口已停用');
      await loadPorts();
    } catch {
      toast.error('港口停用失败');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="港口配置"
        description="维护系统可用港口与代码，供门店/合同业务复用"
        backHref="/dashboard/settings"
        backLabel="返回设置"
        actions={
          <Button onClick={openCreateDialog} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" />
            新增港口
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>港口名称</TableHead>
              <TableHead>代码</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-[120px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : ports.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-12 text-center text-muted-foreground">暂无港口配置。</TableCell>
              </TableRow>
            ) : (
              ports.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell>{item.code}</TableCell>
                  <TableCell>
                    <Badge variant={item.isActive ? 'outline' : 'secondary'} className={item.isActive ? 'border-primary/20 bg-primary/5 text-primary' : ''}>
                      {item.isActive ? '启用' : '停用'}
                    </Badge>
                  </TableCell>
                  <TableCell>{format(new Date(item.updatedAt), 'yyyy-MM-dd HH:mm')}</TableCell>
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
            <DialogTitle>{editingPort ? '编辑港口' : '新增港口'}</DialogTitle>
            <DialogDescription>港口代码建议使用 2-5 位英文大写缩写（例如 LA、OAK）。</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="port-name">港口名称</Label>
              <Input
                id="port-name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="例如：Los Angeles"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="port-code">港口代码</Label>
              <Input
                id="port-code"
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                placeholder="例如：LA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="port-active">状态</Label>
              <select
                id="port-active"
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.value === 'active' }))}
              >
                <option value="active">启用</option>
                <option value="inactive">停用</option>
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
