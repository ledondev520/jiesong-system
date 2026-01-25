/**
 * Input: 库存服务
 * Output: 库存状态管理页面
 * Pos: 核心业务页面，管理商品库存状态
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { Inventory, InventoryStatus } from '@/types';
import { inventoryService } from '@/services/inventory.service';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

/**
 * 职责：渲染库存状态管理页面
 * 思路：
 *   1. 加载并展示库存列表
 *   2. 支持快速更新库存状态
 */
export default function InventoryPage() {
  // 库存状态
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  // 0. 初始化加载
  useEffect(() => {
    loadInventory();
  }, []);

  // 1. 加载库存
  const loadInventory = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getAll({ page: 1, pageSize: 100 });
      setInventory(response.data?.items || []);
    } catch {
      toast.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取库存状态徽章
   */
  const getStatusBadge = (status: InventoryStatus) => {
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
      <div className="flex items-center gap-3">
        <Warehouse className="h-6 w-6 text-primary" />
        <div>
          <h2 className="text-2xl font-bold tracking-tight">库存状态</h2>
          <p className="text-muted-foreground">管理商品库存状态，跟踪生产、包装、运输进度</p>
        </div>
      </div>

      {/* 库存列表 */}
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
            {loading ? (
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
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
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
    </div>
  );
}
