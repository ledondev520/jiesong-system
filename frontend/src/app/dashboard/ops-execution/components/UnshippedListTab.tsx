/**
 * Input: opsExecutionService（未发货清单 API）
 * Output: 未发货清单Tab组件（筛选、汇总卡片、表格、分发操作）
 * Pos: 经营执行中台 - 未发货清单子Tab
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/date-format';
import {
  opsExecutionService,
  type OpsUnshippedItem,
  type OpsUnshippedSummary,
} from '@/services/opsExecution.service';

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'PACKING', label: '包装中' },
  { value: 'SHIPPING', label: '运输中' },
  { value: 'INBOUND', label: '已入库' },
] as const;

const inventoryStatusMap = {
  PRODUCING: { label: '生产中', tone: 'warning' as const },
  PACKING: { label: '包装中', tone: 'danger' as const },
  SHIPPING: { label: '运输中', tone: 'progress' as const },
  INBOUND: { label: '已入库', tone: 'secondary' as const },
  OUTBOUND: { label: '已出库', tone: 'success' as const },
};

const emptyUnshippedSummary: OpsUnshippedSummary = {
  totalItems: 0,
  totalOrders: 0,
  totalQuantity: 0,
  unassignedItems: 0,
};

/**
 * 职责：渲染未发货清单Tab（含筛选、汇总KPI、表格与分发操作）
 */
export function UnshippedListTab() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<OpsUnshippedItem[]>([]);
  const [summary, setSummary] = useState<OpsUnshippedSummary>(emptyUnshippedSummary);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [assigneeName, setAssigneeName] = useState('');
  const [draftAssignees, setDraftAssignees] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const fetchUnshippedList = async (params?: {
    keyword?: string;
    status?: string;
    assigneeName?: string;
  }) => {
    setLoading(true);
    try {
      const response = await opsExecutionService.getUnshippedList({
        page: 1,
        pageSize: 50,
        keyword: params?.keyword,
        status: params?.status,
        assigneeName: params?.assigneeName,
      });
      const nextItems = response.data?.items || [];
      setItems(nextItems);
      setSummary(response.data?.summary || emptyUnshippedSummary);
      setDraftAssignees(Object.fromEntries(nextItems.map((item) => [item.key, item.assigneeName || ''])));
    } catch {
      toast.error('加载未发货清单失败');
    } finally {
      setLoading(false);
    }
  };

  const loadUnshippedList = useEffectEvent(async () => {
    await fetchUnshippedList({
      keyword: keyword.trim() || undefined,
      status: status === 'ALL' ? undefined : status,
      assigneeName: assigneeName.trim() || undefined,
    });
  });

  useEffect(() => {
    void loadUnshippedList();
  }, [status]);

  const totalQuantityLabel = useMemo(
    () => Number(summary.totalQuantity || 0).toLocaleString(),
    [summary.totalQuantity],
  );

  const handleSaveAssignee = async (item: OpsUnshippedItem) => {
    const nextAssigneeName = (draftAssignees[item.key] || '').trim();
    if (!nextAssigneeName) {
      toast.error('请先填写负责人');
      return;
    }

    setSavingKey(item.key);
    try {
      await opsExecutionService.assignUnshippedAssignee({
        salesContractId: item.salesContractId,
        productId: item.productId,
        status: item.status,
        assigneeName: nextAssigneeName,
      });
      setItems((current) =>
        current.map((currentItem) =>
          currentItem.key === item.key
            ? { ...currentItem, assigneeName: nextAssigneeName }
            : currentItem,
        ),
      );
      setSummary((current) => ({
        ...current,
        unassignedItems: Math.max(0, current.unassignedItems + (item.assigneeName ? 0 : -1)),
      }));
      toast.success('负责人已更新');
    } catch {
      toast.error('负责人更新失败');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* KPI 汇总卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">待跟进条目</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalItems}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">涉及订单</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalOrders}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">待处理数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalQuantityLabel}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">未分发条目</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{summary.unassignedItems}</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选与表格 */}
      <Card>
        <CardHeader>
          <CardTitle>筛选与分发</CardTitle>
          <CardDescription>按订单、SKU、仓库状态聚合，并支持直接指定负责人。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_minmax(0,240px)_auto_auto]">
            <Input
              placeholder="搜索订单号、商品名称或 SKU"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="仓库状态筛选">
                <SelectValue placeholder="选择仓库状态" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="按负责人筛选，如小周"
              value={assigneeName}
              onChange={(event) => setAssigneeName(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={() =>
                void fetchUnshippedList({
                  keyword: keyword.trim() || undefined,
                  status: status === 'ALL' ? undefined : status,
                  assigneeName: assigneeName.trim() || undefined,
                })
              }
            >
              刷新清单
            </Button>
            {(keyword || status !== 'ALL' || assigneeName) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setKeyword('');
                  setStatus('ALL');
                  setAssigneeName('');
                  void fetchUnshippedList({});
                }}
              >
                <X className="h-4 w-4 mr-1" />
                重置
              </Button>
            )}
          </div>

          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              加载中...
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <AlertCircle className="h-8 w-8" />
              <p>当前没有待跟进的未发货条目。</p>
            </div>
          ) : (
            <div className="surface-panel overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>订单号</TableHead>
                    <TableHead>SKU / 商品</TableHead>
                    <TableHead>仓库状态</TableHead>
                    <TableHead className="text-right">待处理数量</TableHead>
                    <TableHead className="text-right">记录数</TableHead>
                    <TableHead>负责人</TableHead>
                    <TableHead className="w-[180px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-medium">{item.orderNo}</TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{item.skuName}</div>
                          <div className="text-xs text-muted-foreground">{item.skuCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} statusMap={inventoryStatusMap} />
                      </TableCell>
                      <TableCell className="text-right">
                        {item.quantity} {item.unit}
                      </TableCell>
                      <TableCell className="text-right">{item.recordCount}</TableCell>
                      <TableCell>{item.assigneeName || '未分发'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Input
                            aria-label={`负责人-${item.orderNo}-${item.skuName}`}
                            value={draftAssignees[item.key] || ''}
                            onChange={(event) =>
                              setDraftAssignees((current) => ({
                                ...current,
                                [item.key]: event.target.value,
                              }))
                            }
                            placeholder="如：小周"
                            className="h-9"
                          />
                          <Button
                            size="sm"
                            disabled={savingKey === item.key}
                            aria-label={`保存负责人-${item.orderNo}-${item.skuName}`}
                            onClick={() => void handleSaveAssignee(item)}
                          >
                            {savingKey === item.key ? '保存中' : '保存'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 更新时间 */}
      {items.length > 0 && items[0].latestUpdatedAt && (
        <p className="text-xs text-muted-foreground text-right">
          最近更新：{formatDateTime(items[0].latestUpdatedAt)}
        </p>
      )}
    </div>
  );
}
