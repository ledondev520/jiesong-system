/**
 * Input: 库存服务、销售服务
 * Output: 库存与出口合同管理页面（Tab切换）
 * Pos: 核心业务页面，管理库存状态和出口合同/装箱
 * 
 * 2026-01-20 重构：货柜功能已合并到出口合同，EXP号即货柜号
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Inventory, SalesContract, InventoryStatus, SalesStatus } from '@/types';
import { inventoryService } from '@/services/inventory.service';
import { salesService } from '@/services/sales.service';
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
import { Plus, Eye, Ship, Warehouse, MoreHorizontal, Box } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

/**
 * 职责：渲染库存与出口合同管理页面
 * 思路：
 *   1. 使用Tab切换库存/出口合同视图
 *   2. 库存页面支持状态快速更新
 *   3. 出口合同页面显示装箱概览，点击进入详情页查看3D
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
  
  // 出口合同状态（原货柜）
  const [contracts, setContracts] = useState<SalesContract[]>([]);
  const [contractLoading, setContractLoading] = useState(true);

  // 0. 初始化加载
  useEffect(() => {
    loadInventory();
    loadContracts();
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

  // 2. 加载出口合同（替代原货柜）
  const loadContracts = async () => {
    setContractLoading(true);
    try {
      const response = await salesService.getAll({ page: 1, pageSize: 100 });
      setContracts(response.data?.items || []);
    } catch {
      toast.error('加载出口合同失败');
    } finally {
      setContractLoading(false);
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
   * 获取出口合同状态徽章
   */
  const getContractStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-100 text-blue-800' },
      [SalesStatus.PACKING]: { label: '装箱中', className: 'bg-yellow-100 text-yellow-800' },
      [SalesStatus.SHIPPED]: { label: '已发运', className: 'bg-purple-100 text-purple-800' },
      [SalesStatus.ARRIVED]: { label: '已到达', className: 'bg-green-100 text-green-800' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-gray-700 text-white' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-100 text-red-800' },
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

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">库存与货柜</h2>
        <p className="text-muted-foreground">管理商品库存状态和出口合同装箱</p>
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

        {/* 货柜Tab（现为出口合同列表） */}
        <TabsContent value="container" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              一个出口合同 (EXP) = 一个货柜，点击眼睛图标查看装箱详情和3D可视化
            </p>
            <Link href="/dashboard/sales/create">
              <Button>
                <Plus className="mr-2 h-4 w-4" /> 创建出口合同
              </Button>
            </Link>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号 (货柜号)</TableHead>
                  <TableHead>目的港口</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>预计到达</TableHead>
                  <TableHead>装箱情况</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contractLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : contracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      暂无出口合同，点击"创建出口合同"开始
                    </TableCell>
                  </TableRow>
                ) : (
                  contracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Ship className="h-4 w-4 text-blue-500" />
                          {contract.contractNo}
                        </div>
                      </TableCell>
                      <TableCell>{contract.port?.name || '-'}</TableCell>
                      <TableCell>{getContractStatusBadge(contract.status)}</TableCell>
                      <TableCell>
                        {contract.estimatedArrival 
                          ? format(new Date(contract.estimatedArrival), 'yyyy-MM-dd') 
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Box className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-sm">{contract.totalBoxes || 0} 箱</div>
                            <div className="text-xs text-muted-foreground">{contract.volume?.toFixed(2) || 0} CBM</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/sales/${contract.id}`}>
                          <Button variant="ghost" size="icon" title="查看装箱详情与3D可视化">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
