'use client';

import { useState, useEffect } from 'react';
import { Container, ContainerStatus } from '@/types';
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
import { Plus, Pencil, Trash, Ship } from 'lucide-react';
import { ContainerDialog } from './components/ContainerDialog';
import { toast } from 'sonner';
import { PORTS } from '@/lib/constants';
import { format } from 'date-fns';

export default function ContainersPage() {
  const [containers, setContainers] = useState<Container[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);

  useEffect(() => {
    loadContainers();
  }, []);

  const loadContainers = async () => {
    setLoading(true);
    try {
      // Mock Data
      await new Promise(r => setTimeout(r, 500));
      setContainers([
        { 
          id: '1', 
          containerNo: '25-001-LA', 
          portId: '1', 
          status: ContainerStatus.SHIPPED, 
          totalBoxes: 500,
          grossWeight: 12000,
          netWeight: 11500,
          volume: 28,
          estimatedArrival: new Date('2026-02-15').toISOString(),
          createdAt: '', 
          updatedAt: '' 
        },
        { 
          id: '2', 
          containerNo: '25-002-OAK', 
          portId: '2', 
          status: ContainerStatus.LOADING, 
          totalBoxes: 0,
          grossWeight: 0,
          netWeight: 0,
          volume: 0,
          createdAt: '', 
          updatedAt: '' 
        },
      ]);
    } catch (error) {
      toast.error('加载货柜失败');
    } finally {
      setLoading(false);
    }
  };

  const getPortName = (portId: string) => {
    return PORTS.find(p => p.id === portId)?.name || '未知港口';
  };

  const getStatusBadge = (status: ContainerStatus) => {
    switch (status) {
      case ContainerStatus.PENDING: return <Badge variant="outline">待装柜</Badge>;
      case ContainerStatus.LOADING: return <Badge className="bg-yellow-500">装柜中</Badge>;
      case ContainerStatus.SHIPPED: return <Badge className="bg-blue-500">已发运</Badge>;
      case ContainerStatus.ARRIVED: return <Badge className="bg-green-500">已到达</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const handleCreate = () => {
    setEditingContainer(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (container: Container) => {
    setEditingContainer(container);
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('确定要删除此货柜吗？')) {
      setContainers(containers.filter(c => c.id !== id));
      toast.success('货柜已删除');
    }
  };

  const handleSubmit = async (data: any) => {
    if (editingContainer) {
      setContainers(containers.map(c => c.id === editingContainer.id ? { ...c, ...data } : c));
      toast.success('货柜更新成功');
    } else {
      setContainers([...containers, { id: Math.random().toString(), ...data, status: ContainerStatus.PENDING, createdAt: '', updatedAt: '' }]);
      toast.success('货柜创建成功');
    }
    setIsDialogOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">货柜管理</h2>
          <p className="text-muted-foreground">管理集装箱装运与物流状态。</p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="mr-2 h-4 w-4" /> 创建货柜
        </Button>
      </div>

      <div className="rounded-md border">
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
                    {container.containerNo}
                  </TableCell>
                  <TableCell>{getPortName(container.portId)}</TableCell>
                  <TableCell>{getStatusBadge(container.status)}</TableCell>
                  <TableCell>{container.estimatedArrival ? format(new Date(container.estimatedArrival), 'yyyy-MM-dd') : '-'}</TableCell>
                  <TableCell>
                    <div className="text-sm">{container.totalBoxes} 箱</div>
                    <div className="text-xs text-muted-foreground">{container.volume} CBM</div>
                  </TableCell>
                  <TableCell className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(container)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(container.id)}>
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
