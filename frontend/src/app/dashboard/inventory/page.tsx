'use client';

import { useState, useEffect } from 'react';
import { Inventory, InventoryStatus } from '@/types';
import { inventoryService } from '@/services/inventory.service';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_LABEL_MAP: Record<InventoryStatus, string> = {
  [InventoryStatus.PRODUCING]: '生产中',
  [InventoryStatus.PACKING]: '包装中',
  [InventoryStatus.SHIPPING]: '运输中',
  [InventoryStatus.INBOUND]: '入库',
  [InventoryStatus.OUTBOUND]: '出库',
};

const getStatusBadgeTone = (status: InventoryStatus): 'default' | 'secondary' | 'destructive' | 'outline' => {
  switch (status) {
    case InventoryStatus.INBOUND:
      return 'default';
    case InventoryStatus.OUTBOUND:
      return 'secondary';
    case InventoryStatus.PRODUCING:
    case InventoryStatus.PACKING:
    case InventoryStatus.SHIPPING:
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
      const response = await inventoryService.getAll();
      setInventory(response.data.items);
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
      [InventoryStatus.PRODUCING]: [InventoryStatus.PACKING],
      [InventoryStatus.PACKING]: [InventoryStatus.SHIPPING],
      [InventoryStatus.SHIPPING]: [InventoryStatus.INBOUND],
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
              {/* 手机端隐藏次要列，保持主信息可见 */}
              <TableHead className="hidden sm:table-cell">HS 编码</TableHead>
              <TableHead className="hidden md:table-cell max-w-[200px]">申报信息</TableHead>
              <TableHead className="hidden sm:table-cell">单位</TableHead>
              <TableHead className="hidden xs:table-cell">数量</TableHead>
              <TableHead>当前状态</TableHead>
              <TableHead className="w-[60px] sm:w-[100px]">操作</TableHead>
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
                  <TableCell className="font-medium">
                    <div>{item.product?.customsName}</div>
                    {/* 手机端在名称下方内嵌数量，避免横滑 */}
                    <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {item.product?.unit && <span>{item.product.unit} · </span>}
                      <span>×{item.quantity}</span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell font-mono text-sm">{item.product?.hsCode || '-'}</TableCell>
                  <TableCell className="hidden md:table-cell max-w-[200px] truncate" title={item.product?.declaration || ''}>
                    {item.product?.declaration || '-'}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{item.product?.unit || '-'}</TableCell>
                  <TableCell className="hidden xs:table-cell">{item.quantity}</TableCell>
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
