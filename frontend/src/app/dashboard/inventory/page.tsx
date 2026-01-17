'use client';

import { useState, useEffect } from 'react';
import { Inventory, InventoryStatus } from '@/types';
import { inventoryService } from '@/services/inventory.service';
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
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    setLoading(true);
    try {
      const response = await inventoryService.getAll({ page: 1, pageSize: 100 });
      setInventory(response.data?.items || []);
    } catch (error) {
      toast.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: InventoryStatus) => {
    switch (status) {
      case InventoryStatus.PRODUCING: return <Badge variant="outline" className="border-yellow-500 text-yellow-600">生产中</Badge>;
      case InventoryStatus.PACKING: return <Badge className="bg-orange-500">包装中</Badge>;
      case InventoryStatus.SHIPPING: return <Badge className="bg-blue-500">运输中</Badge>;
      case InventoryStatus.INBOUND: return <Badge className="bg-purple-500">已入库</Badge>;
      case InventoryStatus.OUTBOUND: return <Badge className="bg-green-500">已出库</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  const handleStatusChange = async (id: string, newStatus: InventoryStatus) => {
    try {
      await inventoryService.updateStatus(id, newStatus);
      setInventory(inventory.map(item => item.id === id ? { ...item, status: newStatus } : item));
      toast.success(`状态已更新为: ${newStatus}`);
    } catch (error) {
      toast.error('状态更新失败');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">库存管理</h2>
          <p className="text-muted-foreground">监控商品生产与流转状态。</p>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品名称</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>当前状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">加载中...</TableCell>
               </TableRow>
            ) : inventory.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={4} className="text-center py-10">暂无库存记录。</TableCell>
               </TableRow>
            ) : (
              inventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product?.customsName}</TableCell>
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
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.PRODUCING)}>设为: 生产中</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.PACKING)}>设为: 包装中</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.SHIPPING)}>设为: 运输中</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.INBOUND)}>设为: 已入库</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleStatusChange(item.id, InventoryStatus.OUTBOUND)}>设为: 已出库</DropdownMenuItem>
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
