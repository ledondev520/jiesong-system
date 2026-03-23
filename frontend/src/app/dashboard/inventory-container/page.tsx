/**
 * Input: 库存服务
 * Output: 库存状态管理页面（单条/批量状态流转）
 * Pos: 核心业务页面，管理商品库存状态与检索
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
import { StatusBadge, type StatusBadgeConfig } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, RefreshCw, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { TableStateRow } from '@/components/ui/data-state';

const STATUS_LABEL_MAP: Record<InventoryStatus, string> = {
  [InventoryStatus.PRODUCING]: '生产中',
  [InventoryStatus.PACKING]: '包装中',
  [InventoryStatus.SHIPPING]: '运输中',
  [InventoryStatus.INBOUND]: '已入库',
  [InventoryStatus.OUTBOUND]: '已出库',
};

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
  const [loadError, setLoadError] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchUpdating, setBatchUpdating] = useState(false);
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  /**
   * 职责：将关键词输入做轻量防抖，避免请求风暴。
   * 思路：关键词变化后延时 300ms 更新查询关键词，并清理旧定时器。
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedKeyword(keyword.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  /**
   * 职责：根据防抖关键词触发后端查询。
   * 思路：仅当 debouncedKeyword 改变时重拉列表。
   */
  useEffect(() => {
    loadInventory(debouncedKeyword);
  }, [debouncedKeyword]);

  /**
   * 职责：加载库存列表并同步清空失效选中项。
   * 思路：
   * 1. 带 keyword 调用后端查询；
   * 2. 回写列表；
   * 3. 仅保留当前列表中仍存在的选中 id。
   * @param searchKeyword 搜索关键词
   * @returns Promise<void>
   */
  const loadInventory = async (searchKeyword = ''): Promise<void> => {
    setLoading(true);
    setLoadError(false);
    try {
      const cacheKey = `inventory-list-${searchKeyword}`;
      const response = await cachedFetch(
        cacheKey,
        () => inventoryService.getAll({ page: 1, pageSize: 100, keyword: searchKeyword || undefined }),
        15_000, // 库存状态变更频繁，TTL 降至 15s
      );
      const nextInventory = response.data?.items || [];
      setInventory(nextInventory);
      setSelectedIds((prevSelectedIds) => {
        const availableIds = new Set(nextInventory.map((item) => item.id));
        return prevSelectedIds.filter((id) => availableIds.has(id));
      });
    } catch {
      setLoadError(true);
      toast.error('加载库存失败');
    } finally {
      setLoading(false);
    }
  };

  /**
   * 获取库存状态徽章
   */
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
   * 职责：解析后端错误消息用于前端提示。
   * @param error 接口错误对象
   * @returns 提示文案
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
   * 职责：返回某个状态允许切换的下一状态列表。
   * @param status 当前库存状态
   * @returns 可切换状态列表
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
   * 职责：更新单条库存状态并同步列表。
   * @param id 库存ID
   * @param newStatus 新状态
   * @returns Promise<void>
   */
  const handleStatusChange = async (id: string, newStatus: InventoryStatus): Promise<void> => {
    try {
      await inventoryService.updateStatus(id, newStatus);
      invalidateCache('inventory-list');
      setInventory((prevInventory) =>
        prevInventory.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
      );
      toast.success(`状态已更新`);
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    }
  };

  /**
   * 职责：切换单条库存的勾选状态。
   * @param id 库存ID
   */
  const toggleSelectedId = (id: string): void => {
    setSelectedIds((prevSelectedIds) => {
      if (prevSelectedIds.includes(id)) {
        return prevSelectedIds.filter((selectedId) => selectedId !== id);
      }
      return [...prevSelectedIds, id];
    });
  };

  /**
   * 职责：全选/取消全选当前列表。
   * @param checked 是否全选
   */
  const toggleSelectAll = (checked: boolean): void => {
    if (checked) {
      setSelectedIds(inventory.map((item) => item.id));
      return;
    }
    setSelectedIds([]);
  };

  /**
   * 职责：批量更新选中库存状态并回写结果。
   * @param status 目标状态
   * @returns Promise<void>
   */
  const handleBatchStatusChange = async (status: InventoryStatus): Promise<void> => {
    if (selectedIds.length === 0) {
      toast.error('请先选择要更新的库存记录');
      return;
    }

    setBatchUpdating(true);
    try {
      const response = await inventoryService.batchUpdateStatus(selectedIds, status);
      const result = response.data;
      if (result?.success) {
        toast.success(`批量更新完成：成功 ${result.success} 条`);
      }
      if (result?.failed) {
        const firstError = result.errors?.[0]?.message || '部分记录更新失败';
        toast.error(`失败 ${result.failed} 条：${firstError}`);
      }
      setSelectedIds([]);
      await loadInventory(debouncedKeyword);
    } catch (error) {
      toast.error(resolveErrorMessage(error));
    } finally {
      setBatchUpdating(false);
    }
  };

  // 客户端分页计算
  const totalPages = Math.ceil(inventory.length / pageSize);
  const pagedInventory = inventory.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="库存状态"
        description="管理商品库存状态，跟踪生产、包装、运输进度"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索商品/采购合同..."
                value={keyword}
                onChange={(event) => { setKeyword(event.target.value); setCurrentPage(1); }}
                className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
              />
            </div>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                className="h-10 rounded-xl"
                onClick={() => { setKeyword(''); setDebouncedKeyword(''); setCurrentPage(1); }}
              >
                <X className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
            <Button
              variant="outline"
              disabled={batchUpdating || selectedIds.length === 0}
              onClick={() => handleBatchStatusChange(InventoryStatus.INBOUND)}
            >
              批量设为已入库
            </Button>
            <Button
              variant="outline"
              disabled={batchUpdating || selectedIds.length === 0}
              onClick={() => handleBatchStatusChange(InventoryStatus.OUTBOUND)}
            >
              批量设为已出库
            </Button>
          </div>
        }
      />

      {/* 库存列表 */}
      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[48px]">
                <Checkbox
                  checked={pagedInventory.length > 0 && pagedInventory.every((item) => selectedIds.includes(item.id))}
                  onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                  aria-label="全选库存记录"
                />
              </TableHead>
              <TableHead>商品名称</TableHead>
              <TableHead>采购合同</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>当前状态</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableStateRow colSpan={6} variant="loading" title="加载中..." />
            ) : loadError ? (
              <TableStateRow
                colSpan={6}
                variant="error"
                title="数据加载失败"
                description="库存列表暂时不可用，请稍后重试。"
                action={
                  <Button variant="outline" size="sm" onClick={() => void loadInventory(debouncedKeyword)}>
                    <RefreshCw className="mr-1 h-4 w-4" />
                    重试
                  </Button>
                }
              />
            ) : inventory.length === 0 ? (
              <TableStateRow
                colSpan={6}
                variant="empty"
                icon={Search}
                title="暂无库存记录"
                description="当前关键词下没有匹配的库存条目。"
              />
            ) : (
              pagedInventory.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.includes(item.id)}
                      onCheckedChange={() => toggleSelectedId(item.id)}
                      aria-label={`选择库存 ${item.product?.customsName || item.id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{item.product?.customsName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.purchaseItem?.purchaseContract?.contractNo || '-'}
                  </TableCell>
                  <TableCell>{item.quantity} {item.product?.unit}</TableCell>
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

      {/* 分页控制 */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>共 {inventory.length} 条{totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ''}</span>
        <div className="flex items-center gap-2">
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
    </div>
  );
}
