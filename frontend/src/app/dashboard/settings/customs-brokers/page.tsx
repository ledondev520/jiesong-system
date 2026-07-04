/**
 * Input: 报关公司服务 API
 * Output: 报关公司管理页面（表格、批量操作、导入导出）
 * Pos: 系统设置 > 基础数据 > 报关公司
 */

'use client';

import { useState, useEffect } from 'react';
import {
  getSystemCustomsBrokers,
  createSystemCustomsBroker,
  updateSystemCustomsBroker,
  deleteSystemCustomsBroker,
  SystemCustomsBrokerItem,
} from '@/services/system.service';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Building2, Search, X } from 'lucide-react';
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

export default function CustomsBrokersPage() {
  const [brokers, setBrokers] = useState<SystemCustomsBrokerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBroker, setEditingBroker] = useState<SystemCustomsBrokerItem | null>(null);
  const [keyword, setKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [formName, setFormName] = useState('');
  const [formContact, setFormContact] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadBrokers();
  }, []);

  const loadBrokers = async () => {
    setLoading(true);
    try {
      const response = await getSystemCustomsBrokers({ page: 1, pageSize: 100 });
      setBrokers(response.data?.items || []);
    } catch {
      toast.error('加载报关公司失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingBroker(null);
    setFormName('');
    setFormContact('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setIsDialogOpen(true);
  };

  const handleEdit = (broker: SystemCustomsBrokerItem) => {
    setEditingBroker(broker);
    setFormName(broker.name);
    setFormContact(broker.contact || '');
    setFormPhone(broker.phone || '');
    setFormEmail(broker.email || '');
    setFormAddress(broker.address || '');
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要停用此报关公司吗？')) {
      try {
        await deleteSystemCustomsBroker(id);
        setBrokers(brokers.map((b) => (b.id === id ? { ...b, isActive: false } : b)));
        toast.success('报关公司已停用');
      } catch {
        toast.error('停用失败');
      }
    }
  };

  const handleBatchDelete = async () => {
    if (confirm(`确定要停用选中的 ${selectedIds.size} 家报关公司吗？`)) {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map((id) => deleteSystemCustomsBroker(id)));
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      setBrokers(brokers.map((b) => (selectedIds.has(b.id) ? { ...b, isActive: false } : b)));
      setSelectedIds(new Set());
      toast.success(`已停用 ${successCount} 家报关公司`);
    }
  };

  const handleSubmit = async () => {
    const name = formName.trim();
    if (!name) {
      toast.error('报关公司名称不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        name,
        contact: formContact.trim() || null,
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim() || null,
      };
      if (editingBroker) {
        await updateSystemCustomsBroker(editingBroker.id, payload);
        toast.success('报关公司更新成功');
      } else {
        await createSystemCustomsBroker(payload);
        toast.success('报关公司创建成功');
      }
      setIsDialogOpen(false);
      loadBrokers();
    } catch {
      toast.error(editingBroker ? '更新失败' : '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleImport = async (rows: Array<Record<string, unknown>>) => {
    const payloads = rows
      .map((r) => ({
        name: String(r['名称'] || r['name'] || ''),
        contact: String(r['联系人'] || r['contact'] || '') || null,
        phone: String(r['电话'] || r['phone'] || '') || null,
        email: String(r['邮箱'] || r['email'] || '') || null,
        address: String(r['地址'] || r['address'] || '') || null,
      }))
      .filter((r) => r.name);

    if (payloads.length === 0) throw new Error('无有效数据');

    await Promise.allSettled(payloads.map((p) => createSystemCustomsBroker(p)));
    loadBrokers();
  };

  const filteredBrokers = keyword.trim()
    ? brokers.filter((b) => {
        const kw = keyword.trim().toLowerCase();
        return (
          b.name.toLowerCase().includes(kw) ||
          (b.contact || '').toLowerCase().includes(kw) ||
          (b.phone || '').toLowerCase().includes(kw)
        );
      })
    : brokers;

  const totalPages = Math.ceil(filteredBrokers.length / pageSize);
  const pagedBrokers = filteredBrokers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedBrokers.length && pagedBrokers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedBrokers.map((b) => b.id)));
    }
  };

  const handleReset = () => {
    setKeyword('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="报关公司"
        description="管理报关公司档案"
        actions={
          <div className="hidden flex-wrap items-center gap-2 md:flex">
            <div className="relative w-full sm:w-56">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜索公司名称或联系人..."
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
              data={filteredBrokers as unknown as Record<string, unknown>[]}
              filename="报关公司"
              columns={[
                { key: 'name', label: '名称' },
                { key: 'contact', label: '联系人' },
                { key: 'phone', label: '电话' },
                { key: 'email', label: '邮箱' },
                { key: 'address', label: '地址' },
                { key: 'isActive', label: '状态' },
              ]}
              onImport={handleImport}
            />
            <Button onClick={handleCreate} className="h-10 rounded-xl">
              <Plus className="mr-2 h-4 w-4" /> 新增报关公司
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:hidden">
        <Button variant="outline" className="h-11 rounded-2xl" onClick={() => setIsDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          新增报关公司
        </Button>
      </div>

      <BatchActionBar
        count={selectedIds.size}
        onDelete={handleBatchDelete}
        onExport={() => {
          const selected = brokers.filter((b) => selectedIds.has(b.id));
          if (selected.length === 0) return;
          const ws = XLSX.utils.json_to_sheet(
            selected.map((b) => ({
              名称: b.name,
              联系人: b.contact || '',
              电话: b.phone || '',
              邮箱: b.email || '',
              地址: b.address || '',
              状态: b.isActive ? '正常' : '已停用',
            }))
          );
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, '报关公司');
          XLSX.writeFile(wb, '选中报关公司数据.xlsx');
          toast.success('导出成功');
        }}
        onClear={() => setSelectedIds(new Set())}
      />

      <div className="hidden md:block surface-panel overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : pagedBrokers.length === 0 ? (
          <div className="py-16">
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title={keyword ? '没有符合条件的报关公司' : '暂无报关公司数据'}
              description="还没有添加任何报关公司，点击下方的按钮开始创建"
              action={{ label: '新增报关公司', onClick: () => setIsDialogOpen(true) }}
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10">
                  <Checkbox
                    checked={pagedBrokers.length > 0 && selectedIds.size === pagedBrokers.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="w-12 text-muted-foreground">#</TableHead>
                <TableHead className="text-muted-foreground">名称</TableHead>
                <TableHead className="text-muted-foreground">联系人</TableHead>
                <TableHead className="text-muted-foreground">电话</TableHead>
                <TableHead className="text-muted-foreground">状态</TableHead>
                <TableHead className="w-[100px] text-muted-foreground">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagedBrokers.map((broker, index) => (
                <TableRow key={broker.id} className="group transition-colors hover:bg-muted/40">
                  <TableCell>
                    <Checkbox checked={selectedIds.has(broker.id)} onCheckedChange={() => toggleSelect(broker.id)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(currentPage - 1) * pageSize + index + 1}
                  </TableCell>
                  <TableCell className="font-medium">{broker.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{broker.contact || '-'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{broker.phone || '-'}</TableCell>
                  <TableCell>
                    {broker.isActive ? (
                      <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[11px]">
                        正常
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="text-[11px]">已停用</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(broker)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(broker.id)}>
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
        ) : pagedBrokers.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {keyword ? '没有符合条件的报关公司' : '暂无报关公司数据。'}
            </CardContent>
          </Card>
        ) : (
          pagedBrokers.map((broker) => (
            <Card key={broker.id} className="border-border/70">
              <CardContent className="space-y-4 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-base font-semibold tracking-tight">{broker.name}</p>
                    {broker.contact && <p className="text-sm text-muted-foreground">联系人: {broker.contact}</p>}
                    {broker.phone && <p className="text-sm text-muted-foreground">电话: {broker.phone}</p>}
                  </div>
                  {broker.isActive ? (
                    <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 text-primary">正常</Badge>
                  ) : (
                    <Badge variant="destructive" className="rounded-full">已停用</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" className="h-11 rounded-2xl" onClick={() => handleEdit(broker)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    编辑
                  </Button>
                  <Button variant="outline" className="h-11 rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/5 hover:text-destructive" onClick={() => handleDelete(broker.id)}>
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
        <span>共 {filteredBrokers.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
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
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBroker ? '编辑报关公司' : '新增报关公司'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="broker-name">公司名称 *</Label>
              <Input id="broker-name" placeholder="例如：深圳报关行" value={formName} onChange={(e) => setFormName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="broker-contact">联系人</Label>
                <Input id="broker-contact" placeholder="姓名" value={formContact} onChange={(e) => setFormContact(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="broker-phone">电话</Label>
                <Input id="broker-phone" placeholder="手机或座机" value={formPhone} onChange={(e) => setFormPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="broker-email">邮箱</Label>
              <Input id="broker-email" placeholder="电子邮箱" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="broker-address">地址</Label>
              <Input id="broker-address" placeholder="公司地址" value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
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
