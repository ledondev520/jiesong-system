/**
 * Input: 库存服务、货柜服务
 * Output: 库存与货柜管理页面（Tab切换）
 * Pos: 核心业务页面，管理库存状态和货柜装箱
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Inventory, Container, InventoryStatus, ContainerStatus } from '@/types';
import { inventoryService } from '@/services/inventory.service';
import { containerService } from '@/services/container.service';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, Pencil, Trash, Ship, Warehouse, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { PORTS } from '@/lib/constants';
import { format } from 'date-fns';
import { ContainerDialog } from '../../dashboard/containers/components/ContainerDialog';

/**
 * 职责：渲染库存与货柜管理页面
 * 思路：
 *   1. 使用Tab切换库存/货柜视图
 *   2. 库存页面支持状态快速更新
 *   3. 货柜页面支持CRUD操作
 */
export default function InventoryContainerPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'inventory';
  
  // Tab状态（受控模式）
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  
  // 同步URL参数变化
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);
  
  // 库存状态
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  
  // 货柜状态
  const [containers, setContainers] = useState<Container[]>([]);
  const [containerLoading, setContainerLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContainer, setEditingContainer] = useState<Container | null>(null);

  // 0. 初始化加载
  useEffect(() => {
    loadInventory();
    loadContainers();
  }, []);

  // 1. 加载库存
  const loadInventory = async () => {
    setInventoryLoading(true);
    try {
      const response = await inventoryService.getAll({ page: 1, pageSize: 100 });
      setInventory(response.data?.items || []);
    } catch {
      toast.error('加载库存失败');
    } finally {
      setInventoryLoading(false);
    }
  };

  // 2. 加载货柜
  const loadContainers = async () => {
    setContainerLoading(true);
    try {
      const response = await containerService.getAll({ page: 1, pageSize: 100 });
      setContainers(response.data?.items || []);
    } catch {
      toast.error('加载货柜失败');
    } finally {
      setContainerLoading(false);
    }
  };

  /**
   * 获取库存状态徽章
   */
  const getInventoryStatusBadge = (status: InventoryStatus) => {
    const statusMap: Record<InventoryStatus, { label: string; className: string }> = {
      [InventoryStatus.PRODUCING]: { label: '生产中', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
      [InventoryStatus.PACKING]: { label: '包装中', className: 'bg-orange-100 text-orange-800' },
      [InventoryStatus.SHIPPING]: { label: '运输中', className: 'bg-blue-100 text-blue-800' },
      [InventoryStatus.INBOUND]: { label: '已入库', className: 'bg-purple-100 text-purple-800' },
      [InventoryStatus.OUTBOUND]: { label: '已出库', className: 'bg-green-100 text-green-800' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge variant="outline" className={config.className}>{config.label}</Badge>;
  };

  /**
   * 获取货柜状态徽章
   */
  const getContainerStatusBadge = (status: ContainerStatus) => {
    const statusMap: Record<ContainerStatus, { label: string; className: string }> = {
      [ContainerStatus.PENDING]: { label: '待装柜', className: 'bg-gray-100 text-gray-800' },
      [ContainerStatus.LOADING]: { label: '装柜中', className: 'bg-yellow-100 text-yellow-800' },
      [ContainerStatus.SHIPPED]: { label: '已发运', className: 'bg-blue-100 text-blue-800' },
      [ContainerStatus.ARRIVED]: { label: '已到达', className: 'bg-green-100 text-green-800' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  /**
   * 更新库存状态
   */
  const handleStatusChange = async (id: string, newStatus: InventoryStatus) => {
    try {
      await inventoryService.updateStatus(id, newStatus);
      setInventory(inventory.map(item => item.id === id ? { ...item, status: newStatus } : item));
      toast.success(`状态已更新`);
    } catch {
      toast.error('状态更新失败');
    }
  };

  /**
   * 获取港口名称
   */
  const getPortName = (portId: string) => {
    return PORTS.find(p => p.id === portId)?.name || '未知港口';
  };

  // 货柜操作
  const handleCreateContainer = () => {
    setEditingContainer(null);
    setIsDialogOpen(true);
  };

  const handleEditContainer = (container: Container) => {
    setEditingContainer(container);
    setIsDialogOpen(true);
  };

  const handleDeleteContainer = async (id: string) => {
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

  const handleContainerSubmit = async (data: Partial<Container>) => {
    try {
      if (editingContainer) {
        await containerService.update(editingContainer.id, data);
        toast.success('货柜更新成功');
      } else {
        await containerService.create(data);
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
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">库存与货柜</h2>
        <p className="text-muted-foreground">管理商品库存状态和货柜装运</p>
      </div>

      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="inventory" className="gap-2">
            <Warehouse className="h-4 w-4" />
            库存状态
          </TabsTrigger>
          <TabsTrigger value="container" className="gap-2">
            <Ship className="h-4 w-4" />
            货柜管理
          </TabsTrigger>
        </TabsList>

        {/* 库存Tab */}
        <TabsContent value="inventory" className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>商品名称</TableHead>
                  <TableHead>采购合同</TableHead>
                  <TableHead>数量</TableHead>
                  <TableHead>当前状态</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : inventory.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                      暂无库存记录
                    </TableCell>
                  </TableRow>
                ) : (
                  inventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product?.customsName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.purchaseItem?.purchaseContract?.contractNo || '-'}
                      </TableCell>
                      <TableCell>{item.quantity} {item.product?.unit}</TableCell>
                      <TableCell>{getInventoryStatusBadge(item.status)}</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.PRODUCING)}>
                              设为: 生产中
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.PACKING)}>
                              设为: 包装中
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.SHIPPING)}>
                              设为: 运输中
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.INBOUND)}>
                              设为: 已入库
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.OUTBOUND)}>
                              设为: 已出库
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 货柜Tab */}
        <TabsContent value="container" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleCreateContainer}>
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
                  <TableHead>预计到达</TableHead>
                  <TableHead>箱数/体积</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {containerLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : containers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      暂无货柜数据
                    </TableCell>
                  </TableRow>
                ) : (
                  containers.map((container) => (
                    <TableRow key={container.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-muted-foreground" />
                          {container.containerNo}
                        </div>
                      </TableCell>
                      <TableCell>{getPortName(container.portId)}</TableCell>
                      <TableCell>{getContainerStatusBadge(container.status)}</TableCell>
                      <TableCell>
                        {container.estimatedArrival 
                          ? format(new Date(container.estimatedArrival), 'yyyy-MM-dd') 
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{container.totalBoxes} 箱</div>
                        <div className="text-xs text-muted-foreground">{container.volume} CBM</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => handleEditContainer(container)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDeleteContainer(container.id)}>
                            <Trash className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 货柜编辑弹窗 */}
      <ContainerDialog 
        open={isDialogOpen} 
        onOpenChange={setIsDialogOpen}
        container={editingContainer}
        onSubmit={handleContainerSubmit}
      />
    </div>
  );
}
