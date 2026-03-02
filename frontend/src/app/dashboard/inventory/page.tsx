/**
 * Input: 库存服务API
 * Output: 库存管理页面
 * Pos: 核心业务页面，负责库存记录和状态流转
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

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
import { StatusBadge, type StatusBadgeConfig } from '@/components/ui/status-badge';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

const STATUS_LABEL_MAP: Record<InventoryStatus, string> = {
  [InventoryStatus.PRODUCING]: '生产中',
  [InventoryStatus.PACKING]: '包装中',
  [InventoryStatus.SHIPPING]: '运输中',
  [InventoryStatus.INBOUND]: '已入库',
  [InventoryStatus.OUTBOUND]: '已出库',
};

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
    } catch {
      toast.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: InventoryStatus) => {
    const statusMap: Record<InventoryStatus, StatusBadgeConfig> = {
      [InventoryStatus.PRODUCING]: { label: '生产中', tone: 'warning' },
      [InventoryStatus.PACKING]: { label: '包装中', tone: 'danger' },
      [InventoryStatus.SHIPPING]: { label: '运输中', tone: 'progress' },
      [InventoryStatus.INBOUND]: { label: '已入库', tone: 'secondary' },
      [InventoryStatus.OUTBOUND]: { label: '已出库', tone: 'success' },
    };
    return <StatusBadge status={status} statusMap={statusMap} />;
  };

  /**
   * 职责：解析接口错误消息，优先展示后端业务约束提示。
   * @param error 接口错误对象
   * @returns 错误文案
   */
  const resolveErrorMessage = (error: unknown): string => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as { message?: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return '状态更新失败';
  };

  /**
   * 职责：返回当前状态允许的下一状态集合，避免前端发起非法跳转请求。
   * @param status 当前库存状态
   * @returns 下一状态列表
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
   * @param id 库存ID
   * @param newStatus 目标状态
   * @returns Promise<void>
   */
  const handleStatusChange = async (id: string, newStatus: InventoryStatus): Promise<void> => {
    try {
      await inventoryService.updateStatus(id, newStatus);
      setInventory((prevInventory) =>
        prevInventory.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
      toast.success(`状态已更新为: ${newStatus}`);
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
              <TableHead>HS编码</TableHead>
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
                              设为: {STATUS_LABEL_MAP[nextStatus]}
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
