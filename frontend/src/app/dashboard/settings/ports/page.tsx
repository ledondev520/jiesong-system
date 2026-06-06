/**
 * Input: 港口服务API
 * Output: 港口管理页面（搜索、分页、CRUD）
 * Pos: 系统设置 > 基础数据 > 港口管理
 */

'use client';

import { useState, useEffect } from 'react';
import { Port } from '@/types';
import {
  getSystemPorts,
  createSystemPort,
  updateSystemPort,
  deleteSystemPort,
  SystemPortItem,
} from '@/services/system.service';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Anchor, Search, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
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

export default function PortsPage() {
  const [ports, setPorts] = useState<SystemPortItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPort, setEditingPort] = useState<SystemPortItem | null>(null);
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadPorts();
  }, []);

  const loadPorts = async () => {
    setLoading(true);
    try {
      const response = await getSystemPorts({ page: 1, pageSize: 1000 });
      setPorts(response.data?.items || []);
    } catch {
      toast.error('加载港口失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingPort(null);
    setFormName('');
    setFormCode('');
    setIsDialogOpen(true);
  };

  const handleEdit = (port: SystemPortItem) => {
    setEditingPort(port);
    setFormName(port.name);
    setFormCode(port.code);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要停用此港口吗？')) {
      try {
        await deleteSystemPort(id);
        setPorts(ports.map((p) => (p.id === id ? { ...p, isActive: false } : p)));
        toast.success('港口已停用');
      } catch {
        toast.error('停用失败');
      }
    }
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    const code = formCode.trim().toUpperCase();
    if (!name || !code) {
      toast.error('港口名称和代码不能为空');
      return;
    }
    setSubmitting(true);
    try {
      if (editingPort) {
        await updateSystemPort(editingPort.id, { name, code });
        toast.success('港口更新成功');
      } else {
        await createSystemPort({ name, code });
        toast.success('港口创建成功');
      }
      setIsDialogOpen(false);
      loadPorts();
    } catch {
      toast.error(editingPort ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredPorts = keyword.trim()
    ? ports.filter((p) => {
        const kw = keyword.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(kw) ||
          p.code.toLowerCase().includes(kw)
        );
      })
    : ports;

  const totalPages = Math.ceil(filteredPorts.length / pageSize);
  const pagedPorts = filteredPorts.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleReset = () => {
    setKeyword('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="港口管理"
        description="维护装卸港口基础数据"
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索港口名称或代码..."
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
              <Plus className="mr-2 h-4 w-4" /> 新增港口
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增港口
        </Button>
      </div>

      <div className="hidden md:block">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : pagedPorts.length === 0 ? (
          <EmptyState
            icon={<Anchor className="h-8 w-8" />}
            title={keyword ? "没有符合条件的港口" : "暂无港口数据"}
            description="还没有添加任何港口，点击下方的按钮开始创建"
            action={{ label: '新增港口', onClick: () => setIsDialogOpen(true) }}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {pagedPorts.map((port) => (
              <Card
                key={port.id}
                className="cursor-pointer border-border/40 border-l-[3px] bg-card/60 transition-all duration-300 hover:border-primary/20 hover:bg-card hover:shadow-md hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/10"
                style={{ borderLeftColor: port.isActive ? 'oklch(0.55 0.14 150)' : 'oklch(0.58 0.2 25)' }}
                onClick={() => handleEdit(port)}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{port.name}</p>
                      <p className="text-xs text-muted-foreground">{port.code}</p>
                    </div>
                    {port.isActive ? (
                      <Badge variant="outline" className="shrink-0 border-primary/20 bg-primary/5 text-primary text-[11px]">
                        正常
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="shrink-0 text-[11px]">已停用</Badge>
                    )}
                  </div>
                  <div className="flex gap-2 pt-1 border-t border-border/30">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-lg text-xs"
                      onClick={(e) => { e.stopPropagation(); handleEdit(port); }}
                    >
                      <Pencil className="mr-1 h-3 w-3" /> 编辑
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 flex-1 rounded-lg text-xs text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); handleDelete(port.id); }}
                    >
                      <Trash2 className="mr-1 h-3 w-3" /> 停用
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 移动端卡片视图 */}
      <div className="grid gap-3 md:hidden">
        {loading ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">加载中...</CardContent>
          </Card>
        ) : pagedPorts.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {keyword ? '没有符合条件的港口' : '暂无港口数据。'}
            </CardContent>
          </Card>
        ) : (
          pagedPorts.map((port) => (
            <Card key={port.id} className="border-border/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tracking-tight">{port.name}</p>
                    <p className="text-sm text-muted-foreground">{port.code}</p>
                  </div>
                  {port.isActive ? (
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">正常</Badge>
                  ) : (
                    <Badge variant="destructive" className="rounded-full">已停用</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl"
                    onClick={() => handleEdit(port)}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                  <Button
                    variant="outline"
                    className="h-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => handleDelete(port.id)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    停用
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {filteredPorts.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
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
            <DialogTitle>{editingPort ? '编辑港口' : '新增港口'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="port-name">港口名称 *</Label>
              <Input
                id="port-name"
                placeholder="例如：深圳港"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="port-code">港口代码 *</Label>
              <Input
                id="port-code"
                placeholder="例如：SZ"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
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
