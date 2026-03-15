/**
 * Input: 经营执行中台 API
 * Output: 经营执行中台页面
 * Pos: 经营执行模块统一入口
 */

'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import {
  AlertCircle,
  ClipboardList,
  Download,
  Loader2,
  PackageSearch,
  Save,
  Siren,
  TimerReset,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, FINANCE_TABS } from '@/components/layout/ModuleTabHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
  opsExecutionService,
  type OpsTaskItem,
  type OpsTaskSummary,
  type OpsUnshippedItem,
  type OpsUnshippedSummary,
  type PurchaseChecklistResult,
} from '@/services/opsExecution.service';

const STATUS_OPTIONS = [
  { value: 'ALL', label: '全部状态' },
  { value: 'PRODUCING', label: '生产中' },
  { value: 'PACKING', label: '包装中' },
  { value: 'SHIPPING', label: '运输中' },
  { value: 'INBOUND', label: '已入库' },
] as const;

const STORE_TYPE_OPTIONS = ['标准店', '旗舰店'] as const;
const OPENING_STAGE_OPTIONS = ['筹备期', '试营业', '正式营业'] as const;

const inventoryStatusMap = {
  PRODUCING: { label: '生产中', tone: 'warning' as const },
  PACKING: { label: '包装中', tone: 'danger' as const },
  SHIPPING: { label: '运输中', tone: 'progress' as const },
  INBOUND: { label: '已入库', tone: 'secondary' as const },
  OUTBOUND: { label: '已出库', tone: 'success' as const },
};

const taskPriorityMap = {
  HIGH: { label: '高优先级', variant: 'default' as const },
  MEDIUM: { label: '中优先级', variant: 'secondary' as const },
  LOW: { label: '低优先级', variant: 'outline' as const },
};

const taskStatusMap = {
  TODO: { label: '待办', tone: 'warning' as const },
  DONE: { label: '已完成', tone: 'success' as const },
};

const emptyUnshippedSummary: OpsUnshippedSummary = {
  totalItems: 0,
  totalOrders: 0,
  totalQuantity: 0,
  unassignedItems: 0,
};

const emptyTaskSummary: OpsTaskSummary = {
  totalItems: 0,
  overdueItems: 0,
  dueTodayItems: 0,
  highPriorityItems: 0,
};

const formatDateTime = (value: string) => {
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    return '-';
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
};

export default function OpsExecutionPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<OpsUnshippedItem[]>([]);
  const [summary, setSummary] = useState<OpsUnshippedSummary>(emptyUnshippedSummary);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('ALL');
  const [assigneeName, setAssigneeName] = useState('');
  const [draftAssignees, setDraftAssignees] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [checklistStoreType, setChecklistStoreType] = useState<(typeof STORE_TYPE_OPTIONS)[number]>('标准店');
  const [checklistOpeningStage, setChecklistOpeningStage] = useState<(typeof OPENING_STAGE_OPTIONS)[number]>('筹备期');
  const [checklistTemplateName, setChecklistTemplateName] = useState('标准店-筹备期');
  const [checklistResult, setChecklistResult] = useState<PurchaseChecklistResult | null>(null);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistSaving, setChecklistSaving] = useState(false);
  const [checklistExporting, setChecklistExporting] = useState(false);

  const [taskItems, setTaskItems] = useState<OpsTaskItem[]>([]);
  const [taskSummary, setTaskSummary] = useState<OpsTaskSummary>(emptyTaskSummary);
  const [taskLoading, setTaskLoading] = useState(true);
  const [taskInput, setTaskInput] = useState('');
  const [taskCreating, setTaskCreating] = useState(false);

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

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setTaskLoading(true);
      try {
        const response = await opsExecutionService.getTasks();
        if (cancelled) {
          return;
        }
        setTaskItems(response.data?.items || []);
        setTaskSummary(response.data?.summary || emptyTaskSummary);
      } catch {
        if (!cancelled) {
          toast.error('加载任务列表失败');
        }
      } finally {
        if (!cancelled) {
          setTaskLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalQuantityLabel = useMemo(() => (
    Number(summary.totalQuantity || 0).toLocaleString()
  ), [summary.totalQuantity]);

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
      setItems((current) => current.map((currentItem) => (
        currentItem.key === item.key
          ? { ...currentItem, assigneeName: nextAssigneeName }
          : currentItem
      )));
      setSummary((current) => ({
        ...current,
        unassignedItems: Math.max(
          0,
          current.unassignedItems + (item.assigneeName ? 0 : -1),
        ),
      }));
      toast.success('负责人已更新');
    } catch {
      toast.error('负责人更新失败');
    } finally {
      setSavingKey(null);
    }
  };

  const handleGenerateChecklist = async () => {
    setChecklistLoading(true);
    try {
      const response = await opsExecutionService.generatePurchaseChecklist({
        storeType: checklistStoreType,
        openingStage: checklistOpeningStage,
      });
      const result = response.data || null;
      setChecklistResult(result);
      if (result?.templateName) {
        setChecklistTemplateName(result.templateName);
      }
    } catch {
      toast.error('生成采购清单失败');
    } finally {
      setChecklistLoading(false);
    }
  };

  const handleSaveChecklistTemplate = async () => {
    if (!checklistResult) {
      toast.error('请先生成采购清单');
      return;
    }

    setChecklistSaving(true);
    try {
      await opsExecutionService.savePurchaseChecklistTemplate({
        storeType: checklistStoreType,
        openingStage: checklistOpeningStage,
        templateName: checklistTemplateName.trim() || checklistResult.templateName,
        items: checklistResult.items,
      });
      toast.success('模板已保存');
    } catch {
      toast.error('模板保存失败');
    } finally {
      setChecklistSaving(false);
    }
  };

  const handleExportChecklist = async () => {
    if (!checklistResult) {
      toast.error('请先生成采购清单');
      return;
    }

    setChecklistExporting(true);
    try {
      await opsExecutionService.exportPurchaseChecklist({
        storeType: checklistStoreType,
        openingStage: checklistOpeningStage,
        templateName: checklistTemplateName.trim() || checklistResult.templateName,
        items: checklistResult.items,
      });
      toast.success('采购清单已导出');
    } catch {
      toast.error('导出采购清单失败');
    } finally {
      setChecklistExporting(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskInput.trim()) {
      toast.error('请先输入任务内容');
      return;
    }

    setTaskCreating(true);
    try {
      const response = await opsExecutionService.createTask({
        naturalLanguageInput: taskInput.trim(),
      });
      const task = response.data;
      if (task) {
        const existed = taskItems.some((item) => item.id === task.id);
        setTaskItems((current) => [task, ...current.filter((currentTask) => currentTask.id !== task.id)]);
        setTaskSummary((current) => ({
          totalItems: current.totalItems + (existed ? 0 : 1),
          overdueItems: current.overdueItems,
          dueTodayItems: current.dueTodayItems,
          highPriorityItems: current.highPriorityItems + (task.priority === 'HIGH' && !existed ? 1 : 0),
        }));
      }
      setTaskInput('');
      toast.success('任务已创建');
    } catch {
      toast.error('任务创建失败');
    } finally {
      setTaskCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={FINANCE_TABS} moduleName="财务" />
      <PageHeader
        title="经营执行中台"
        description="统一承接门店采购清单、未发货分发与任务提醒。"
      />

      <Tabs defaultValue="unshipped" className="space-y-6">
        <TabsList className="border bg-background">
          <TabsTrigger value="unshipped" className="gap-2">
            <PackageSearch className="h-4 w-4" />
            未发货清单
          </TabsTrigger>
          <TabsTrigger value="purchase-checklist" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            门店采购清单
          </TabsTrigger>
          <TabsTrigger value="task-reminder" className="gap-2">
            <Siren className="h-4 w-4" />
            任务提醒引擎
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unshipped" className="space-y-6">
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

          <Card>
            <CardHeader>
              <CardTitle>筛选与分发</CardTitle>
              <CardDescription>按订单、SKU、仓库状态聚合，并支持直接指定负责人。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_200px_minmax(0,240px)_auto]">
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
                  onClick={() => void fetchUnshippedList({
                    keyword: keyword.trim() || undefined,
                    status: status === 'ALL' ? undefined : status,
                    assigneeName: assigneeName.trim() || undefined,
                  })}
                >
                  刷新清单
                </Button>
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
                                onChange={(event) => setDraftAssignees((current) => ({
                                  ...current,
                                  [item.key]: event.target.value,
                                }))}
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
        </TabsContent>

        <TabsContent value="purchase-checklist" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>门店采购清单模块</CardTitle>
              <CardDescription>按店型和开店阶段生成采购项，并支持模板保存与一键导出。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[180px_180px_minmax(0,1fr)_auto_auto_auto]">
                <Select value={checklistStoreType} onValueChange={(value) => setChecklistStoreType(value as (typeof STORE_TYPE_OPTIONS)[number])}>
                  <SelectTrigger aria-label="店型选择">
                    <SelectValue placeholder="店型" />
                  </SelectTrigger>
                  <SelectContent>
                    {STORE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={checklistOpeningStage}
                  onValueChange={(value) => setChecklistOpeningStage(value as (typeof OPENING_STAGE_OPTIONS)[number])}
                >
                  <SelectTrigger aria-label="开店阶段选择">
                    <SelectValue placeholder="开店阶段" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENING_STAGE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  aria-label="采购清单模板名"
                  value={checklistTemplateName}
                  onChange={(event) => setChecklistTemplateName(event.target.value)}
                  placeholder="模板名称"
                />
                <Button onClick={() => void handleGenerateChecklist()}>
                  {checklistLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  生成采购清单
                </Button>
                <Button variant="outline" disabled={checklistSaving} onClick={() => void handleSaveChecklistTemplate()}>
                  <Save className="mr-2 h-4 w-4" />
                  保存模板
                </Button>
                <Button variant="outline" disabled={checklistExporting} onClick={() => void handleExportChecklist()}>
                  <Download className="mr-2 h-4 w-4" />
                  一键导出
                </Button>
              </div>

              {!checklistResult ? (
                <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <ClipboardList className="h-8 w-8" />
                  <p>选择店型和开店阶段后生成采购清单。</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">采购项总数</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{checklistResult.summary.totalItems}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">必备项</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-primary">{checklistResult.summary.requiredCount}</div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">可选项</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold">{checklistResult.summary.optionalCount}</div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="surface-panel overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>分类</TableHead>
                          <TableHead>采购项</TableHead>
                          <TableHead className="text-right">数量</TableHead>
                          <TableHead>备注</TableHead>
                          <TableHead className="w-[90px]">属性</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {checklistResult.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.category}</TableCell>
                            <TableCell className="font-medium">{item.itemName}</TableCell>
                            <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                            <TableCell className="text-muted-foreground">{item.notes || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={item.required ? 'default' : 'outline'}>
                                {item.required ? '必备' : '可选'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="task-reminder" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">任务总数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{taskSummary.totalItems}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">逾期任务</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">{taskSummary.overdueItems}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">今日到期</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{taskSummary.dueTodayItems}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">高优先级</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">{taskSummary.highPriorityItems}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TimerReset className="h-4 w-4" />
                自然语言建任务
              </CardTitle>
              <CardDescription>例如：提醒小周明天10点跟进EXP001未发货，高优先级。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                aria-label="自然语言建任务输入框"
                value={taskInput}
                onChange={(event) => setTaskInput(event.target.value)}
                placeholder="输入自然语言任务描述"
                rows={4}
              />
              <div className="flex justify-end">
                <Button disabled={taskCreating} onClick={() => void handleCreateTask()}>
                  {taskCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  创建任务
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>任务清单</CardTitle>
              <CardDescription>显示责任人、优先级、提醒时间和二次提醒时间。</CardDescription>
            </CardHeader>
            <CardContent>
              {taskLoading ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  加载中...
                </div>
              ) : taskItems.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                  <AlertCircle className="h-8 w-8" />
                  <p>当前还没有任务。</p>
                </div>
              ) : (
                <div className="surface-panel overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>任务</TableHead>
                        <TableHead>责任人</TableHead>
                        <TableHead>优先级</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead>提醒时间</TableHead>
                        <TableHead>二次提醒</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taskItems.map((task) => (
                        <TableRow key={task.id}>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{task.title}</div>
                              {task.sourceText ? (
                                <div className="text-xs text-muted-foreground">{task.sourceText}</div>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell>{task.assigneeName}</TableCell>
                          <TableCell>
                            <Badge variant={taskPriorityMap[task.priority]?.variant || 'outline'}>
                              {taskPriorityMap[task.priority]?.label || task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={task.status} statusMap={taskStatusMap} />
                          </TableCell>
                          <TableCell>{formatDateTime(task.remindAt)}</TableCell>
                          <TableCell>{formatDateTime(task.secondRemindAt)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
