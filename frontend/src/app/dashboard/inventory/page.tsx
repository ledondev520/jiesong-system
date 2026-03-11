'use client';

import { useState, useEffect } from 'react';
import { Inventory, InventoryStatus, Product } from '@/types';
import { inventoryService } from '@/services/inventory.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/layout/PageHeader';
import { MoreHorizontal, Package } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL_MAP: Record<InventoryStatus, string> = {
  [InventoryStatus.INBOUND]: '入库',
  [InventoryStatus.OUTBOUND]: '出库',
};

const getStatusBadgeTone = (status: InventoryStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case InventoryStatus.INBOUND:
      return 'default';
    case InventoryStatus.OUTBOUND:
      return 'secondary';
    default:
      return 'outline';
  }
};

const resolveErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
};

export default function InventoryPage() {
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInventory();
  }, []);

  const loadInventory = async () => {
    try {
      const data = await inventoryService.list();
      setInventory(data);
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: InventoryStatus) => (
    <Badge variant={getStatusBadgeTone(status)}>{STATUS_LABEL_MAP[status]}</Badge>
  );

  /**
   * 获取允许的状态流转
   */
  const getAllowedNextStatuses = (status: InventoryStatus): InventoryStatus[] => {
    const transitionMap: Record<InventoryStatus, InventoryStatus[]> = {
      [InventoryStatus.INBOUND]: [InventoryStatus.OUTBOUND],
      [InventoryStatus.OUTBOUND]: [],
    };
    return transitionMap[status] || [];
  };

  /**
   * 职责：更新库存状态并同步本地展示。
   * @param id 库存 ID
   * @param newStatus 目标状态
   * @returns Promise<void>
   */
  const handleStatusChange = async (id: string, newStatus: InventoryStatus): Promise<void> => {
    // 二次确认：回滚操作需要特别提示
    const isRevertAction = newStatus === InventoryStatus.INBOUND;
    const confirmed = window.confirm(
      isRevertAction
        ? '此操作将恢复库存记录为入库状态，可能会影响当前的出库记录。确定要继续吗？'
        : `确定将库存状态更新为 "${STATUS_LABEL_MAP[newStatus]}" 吗？`
    );

    if (!confirmed) return;

    try {
      await inventoryService.updateStatus(id, newStatus);
      setInventory((prevInventory) =>
        prevInventory.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
      toast.success(`状态已更新为：${STATUS_LABEL_MAP[newStatus]}`);
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="库存管理"
        description="监控商品生产与流转状态。"
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品名称</TableHead>
              <TableHead>HS 编码</TableHead>
              <TableHead className="max-w-[200px]">申报信息</TableHead>
              <TableHead>单位</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>当前状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow>
                 <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
               </TableRow>
            ) : inventory.length === 0 ? (
               <TableRow>
                 <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">暂无库存记录。</TableCell>
               </TableRow>
            ) : (
              inventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.product?.customsName}</TableCell>
                  <TableCell className="font-mono text-sm">{item.product?.hsCode || '-'}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={item.product?.declaration || ''}>
                    {item.product?.declaration || '-'}
                  </TableCell>
                  <TableCell>{item.product?.unit || '-'}</TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{getStatusBadge(item.status)}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {getAllowedNextStatuses(item.status).length === 0 ? (
                          <DropdownMenuItem disabled>无可用下一状态</DropdownMenuItem>
                        ) : (
                          getAllowedNextStatuses(item.status).map((nextStatus) => (
                            <DropdownMenuItem
                              key={`${item.id}-${nextStatus}`}
                              onClick={() => handleStatusChange(item.id, nextStatus)}
                            >
                              设为：{STATUS_LABEL_MAP[nextStatus]}
                            </DropdownMenuItem>
                          ))
                        )}
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
