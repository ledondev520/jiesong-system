/**
 * Input: 货柜服务 API、港口常量、货柜弹窗组件
 * Output: 货柜管理页面（列表展示、创建编辑入口）
 * Pos: 核心业务页面，承接货柜运输管理
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { SalesContract, SalesStatus } from '@/types';
import { containerService } from '@/services/container.service';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge, type StatusBadgeConfig } from '@/components/ui/status-badge';
import { Plus, Pencil, Trash, Ship, Eye } from 'lucide-react';
import Link from 'next/link';
import { ContainerDialog } from './components/ContainerDialog';
import type { ContainerFormValues } from './components/ContainerDialog';
import { toast } from 'sonner';
import { PORTS } from '@/lib/constants';
import { formatDate } from '@/lib/date-format';
import { PageHeader } from '@/components/layout/PageHeader';

export default function ContainersPage() {
  const [containers, setContainers] = useState<SalesContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<SalesContract | null>(null);

  useEffect(() => {
    loadContainers();
  }, []);

  const loadContainers = async () => {
    setLoading(true);
    try {
      const response = await containerService.getAll({ page: 1, pageSize: 100, lite: true });
      setContainers(response.data?.items || []);
    } catch {
      toast.error('加载货柜失败');
    } finally {
      setLoading(false);
    }
  };

  const getPortName = (portId?: string) => {
    return PORTS.find(p => p.id === portId)?.name || '未知港口';
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, StatusBadgeConfig> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'neutral' },
      [SalesStatus.PACKING]: { label: '装箱中', tone: 'warning' },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress' },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success' },
      [SalesStatus.COMPLETED]: { label: '已完成', tone: 'success' },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'secondary' },
    };
    return <StatusBadge status={status} statusMap={statusMap} />;
  };

  const handleCreate = () => {
    setEditingContainer(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (container: SalesContract) => {
    setEditingContainer(container);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此货柜吗？')) {
      try {
        await containerService.delete(id);
        setContainers(containers.filter(c => c.id !== id));
        toast.success('货柜已删除');
      } catch {
        toast.error('删除失败');
      }
    }
  };

  const handleSubmit = async (data: ContainerFormValues) => {
    const payload: Partial<SalesContract> = {
      ...data,
      estimatedArrival: data.estimatedArrival?.toISOString(),
    };

    try {
      if (editingContainer) {
        await containerService.update(editingContainer.id, payload);
        toast.success('货柜更新成功');
      } else {
        await containerService.create(payload);
        toast.success('货柜创建成功');
      }
      setIsDialogOpen(false);
      loadContainers();
    } catch {
      toast.error(editingContainer ? '更新失败' : '创建失败');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="货柜管理"
        description="管理集装箱装运与物流状态。"
        actions={
          <Button onClick={handleCreate}>
            <Plus className="mr-2 h-4 w-4" /> 创建货柜
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>货柜编号</TableHead>
              <TableHead>目的港口</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>预计到达 (ETA)</TableHead>
              <TableHead>箱数/体积</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : containers.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={6} className="text-center py-10">暂无货柜数据。</TableCell>
               </TableRow>
            ) : (
              containers.map((container) => (
                <TableRow key={container.id}>
                  <TableCell className="font-medium flex items-center gap-2">
                    <Ship className="h-4 w-4 text-muted-foreground" />
                    {container.contractNo}
                  </TableCell>
                    <TableCell>{getPortName(container.portId)}</TableCell>
                    <TableCell>{getStatusBadge(container.status)}</TableCell>
                    <TableCell>{formatDate(container.estimatedArrival)}</TableCell>
                  <TableCell>
                    <div className="text-sm">{container.totalBoxes} 箱</div>
                    <div className="text-xs text-muted-foreground">{container.volume} CBM</div>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Link href={`/dashboard/containers/${container.id}`}>
                      <Button variant="ghost" size="icon" title="查看装箱详情">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </Link>
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(container)} title="编辑">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(container.id)} title="删除">
                      <Trash className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ContainerDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        container={editingContainer}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
