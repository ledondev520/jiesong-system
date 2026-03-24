/**
 * Input: 采购合同服务
 * Output: 采购合同管理页面
 * Pos: 核心业务页面，管理供应商采购合同
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { useRouter, useSearchParams } from 'next/navigation';
import { PurchaseContract, PurchaseStatus, PurchaseItem } from '@/types';
import { purchaseService } from '@/services/purchase.service';
import { cachedFetch } from '@/lib/api-cache';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { AmountText } from '@/components/ui/amount-text';
import { Plus, Eye, FileText, ShoppingCart, Package, Loader2, FileDown, Filter, X, Store, Truck } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contractDocService } from '@/services/contractDoc.service';
import { PageHeader } from '@/components/layout/PageHeader';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { Card, CardContent } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

// 扩展类型
interface PurchaseContractDetail extends PurchaseContract {
  items?: PurchaseItem[];
}

/**
 * 职责：渲染采购合同管理页面
 * 思路：
 *   1. 显示采购合同列表
 *   2. 提供筛选和分页
 *   3. 支持查看详情和生成合同文档
 */
export default function ContractsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const statusFromUrl = searchParams.get('status') || 'ALL';
  
  // 筛选状态
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState(statusFromUrl);
  const [productSearch, setProductSearch] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  
  // 分页状态
  const [purchasePage, setPurchasePage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  
  // 同步URL参数变化
  useEffect(() => {
    setPurchaseStatusFilter(statusFromUrl || 'ALL');
  }, [statusFromUrl]);
  
  // 采购合同状态
  const [purchaseContracts, setPurchaseContracts] = useState<PurchaseContract[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  
  // 计算筛选后的采购合同（用于分页显示）
  const filteredPurchaseContracts = useMemo(() => {
    let filtered = purchaseContracts;
    if (purchaseStatusFilter && purchaseStatusFilter !== 'ALL') {
      filtered = filtered.filter(c => c.status === purchaseStatusFilter);
    }
    if (storeFilter && storeFilter !== 'ALL') {
      filtered = filtered.filter(c => c.storeName?.includes(storeFilter));
    }
    if (productSearch.trim()) {
      const search = productSearch.trim().toLowerCase();
      filtered = filtered.filter(c => {
        const productName = c.items?.[0]?.product?.customsName || '';
        return productName.toLowerCase().includes(search);
      });
    }
    return filtered;
  }, [purchaseContracts, purchaseStatusFilter, storeFilter, productSearch]);
  
  const purchaseTotalPages = Math.ceil(filteredPurchaseContracts.length / pageSize);
  const pagedPurchaseContracts = filteredPurchaseContracts.slice(
    (purchasePage - 1) * pageSize,
    purchasePage * pageSize
  );
  const procurementOverview = useMemo(() => {
    const activeContracts = purchaseContracts.filter((contract) =>
      [PurchaseStatus.DRAFT, PurchaseStatus.SIGNED, PurchaseStatus.PRODUCING].includes(contract.status)
    ).length;
    const producingContracts = purchaseContracts.filter((contract) => contract.status === PurchaseStatus.PRODUCING).length;
    const shippedPendingReceipt = purchaseContracts.filter((contract) => contract.status === PurchaseStatus.SHIPPED).length;
    const activeStores = new Set(purchaseContracts.map((contract) => contract.storeName).filter(Boolean)).size;

    return {
      activeContracts,
      producingContracts,
      shippedPendingReceipt,
      activeStores,
    };
  }, [purchaseContracts]);
  
  // 筛选或每页条数变化时重置页码
  useEffect(() => {
    setPurchasePage(1);
  }, [purchaseStatusFilter, storeFilter, productSearch, pageSize]);
  
  // 采购详情弹窗状态
  const [detailOpen, setDetailOpen] = useState(false);
  const detailLoading = false;
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseContractDetail | null>(null);
  
  // 生成合同文档弹窗状态
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [generateForm, setGenerateForm] = useState({
    storeName: '',
    deliveryAddress: '',
    deliveryContact: '',
    depositRate: '30',
  });

  // 0. 初始化加载
  useEffect(() => {
    loadPurchaseContracts();
  }, []);

  // 1. 加载采购合同（带缓存，pageSize 降至 100 减少负载）
  const loadPurchaseContracts = async () => {
    setPurchaseLoading(true);
    try {
      const response = await cachedFetch(
        'purchase-contracts-list',
        () => purchaseService.getAll({ page: 1, pageSize: 100 }),
      );
      setPurchaseContracts(response.data?.items || []);
    } catch {
      toast.error('加载采购合同失败');
    } finally {
      setPurchaseLoading(false);
    }
  };

  // 4. 打开生成合同文档弹窗
  const openGenerateDialog = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    setGenerateForm({ storeName: '', deliveryAddress: '', deliveryContact: '', depositRate: '30' });
    setGenerateOpen(true);
  };

  // 5. 生成购销合同文档
  const handleGenerateContract = async () => {
    if (!selectedPurchaseId) return;
    
    setGenerateLoading(true);
    try {
      const blob = await contractDocService.generateFromPurchase(
        selectedPurchaseId,
        generateForm
      );
      
      const contract = purchaseContracts.find(c => c.id === selectedPurchaseId);
      const filename = `购销合同${contract?.contractNo?.replace('PO', 'CG') || ''}.docx`;
      contractDocService.downloadDocument(blob, filename);
      
      toast.success('合同文档已生成');
      setGenerateOpen(false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : '生成合同文档失败';
      toast.error(message);
    } finally {
      setGenerateLoading(false);
    }
  };

  // 关闭弹窗时清理状态
  const closeDetail = () => {
    setDetailOpen(false);
    setPurchaseDetail(null);
  };

  const hasActiveFilters = purchaseStatusFilter !== 'ALL' || Boolean(storeFilter) || Boolean(productSearch);
  const storeOptions = useMemo(
    () => Array.from(new Set(purchaseContracts.filter((c) => c.storeName).map((c) => c.storeName!))).sort(),
    [purchaseContracts]
  );

  const resetFilters = () => {
    setPurchaseStatusFilter('ALL');
    setStoreFilter('');
    setProductSearch('');
    setPurchasePage(1);
  };

  const renderFilterControls = (variant: 'desktop' | 'mobile') => {
    const isMobile = variant === 'mobile';
    const triggerClassName = isMobile
      ? 'h-11 w-full rounded-2xl border-border/70 bg-background/80 text-left'
      : 'h-10 w-32 rounded-xl border-border/70 bg-background/70';
    const storeClassName = isMobile
      ? 'h-11 w-full rounded-2xl border-border/70 bg-background/80 text-left'
      : 'h-10 w-36 rounded-xl border-border/70 bg-background/70';
    const inputClassName = isMobile
      ? 'h-11 w-full rounded-2xl border-border/70 bg-background/80'
      : 'h-10 w-40 rounded-xl border-border/70 bg-background/70';

    return (
      <>
        <div className={isMobile ? 'space-y-2' : 'contents'}>
          {isMobile && <Label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">合同状态</Label>}
          <Select value={purchaseStatusFilter} onValueChange={setPurchaseStatusFilter}>
            <SelectTrigger className={triggerClassName}>
              <SelectValue placeholder="全部状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部状态</SelectItem>
              <SelectItem value="DRAFT">草稿</SelectItem>
              <SelectItem value="SIGNED">已签约</SelectItem>
              <SelectItem value="PRODUCING">生产中</SelectItem>
              <SelectItem value="SHIPPED">已发货</SelectItem>
              <SelectItem value="RECEIVED">已收货</SelectItem>
              <SelectItem value="COMPLETED">已完成</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className={isMobile ? 'space-y-2' : 'contents'}>
          {isMobile && <Label className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">发货店铺</Label>}
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className={storeClassName}>
              <SelectValue placeholder="全部店铺" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">全部店铺</SelectItem>
              {storeOptions.map((store) => (
                <SelectItem key={store} value={store}>{store}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={isMobile ? 'space-y-2' : 'contents'}>
          {isMobile && <Label htmlFor="mobile-product-search" className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">商品搜索</Label>}
          <Input
            id={isMobile ? 'mobile-product-search' : undefined}
            placeholder="搜索商品名称..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className={inputClassName}
          />
        </div>
      </>
    );
  };

  /**
   * 获取采购状态徽章
   */
  const getPurchaseStatusBadge = (status: PurchaseStatus) => {
    const statusMap: Record<PurchaseStatus, { label: string; tone: React.ComponentProps<typeof SemanticBadge>["tone"] }> = {
      [PurchaseStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [PurchaseStatus.SIGNED]: { label: '已签订', tone: 'info' },
      [PurchaseStatus.PRODUCING]: { label: '生产中', tone: 'warning' },
      [PurchaseStatus.SHIPPED]: { label: '已发货', tone: 'progress' },
      [PurchaseStatus.RECEIVED]: { label: '已收货', tone: 'secondary' },
      [PurchaseStatus.COMPLETED]: { label: '已完成', tone: 'success' },
      [PurchaseStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="采购合同"
        description="管理供应商采购合同"
      />

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">采购执行概览</p>
            <h3 className="text-lg font-semibold tracking-tight">围绕下单、生产与收货节奏安排跟进动作</h3>
          </div>
          <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
            当前活跃合同 {procurementOverview.activeContracts}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-sm text-muted-foreground">待推进合同</p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{procurementOverview.activeContracts}</p>
              </div>
              <ShoppingCart className="h-5 w-5 text-primary" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-sm text-muted-foreground">生产中</p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{procurementOverview.producingContracts}</p>
              </div>
              <Package className="h-5 w-5 text-amber-600" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-sm text-muted-foreground">已发货待收货</p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{procurementOverview.shippedPendingReceipt}</p>
              </div>
              <Truck className="h-5 w-5 text-emerald-600" />
            </CardContent>
          </Card>
          <Card className="border-border/70">
            <CardContent className="flex items-center justify-between gap-3 pt-5">
              <div>
                <p className="text-sm text-muted-foreground">合作店铺</p>
                <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{procurementOverview.activeStores}</p>
              </div>
              <Store className="h-5 w-5 text-sky-600" />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 采购合同内容 */}
      <div className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between md:gap-4">
            {/* 筛选区域 */}
            <div className="hidden surface-panel flex-wrap items-center gap-2 px-3 py-2 md:flex">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {renderFilterControls('desktop')}
              {hasActiveFilters && (
                <Button
                  variant="ghost" 
                  size="sm"
                  className="rounded-xl"
                  onClick={resetFilters}
                >
                  <X className="h-4 w-4 mr-1" />
                  重置
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 md:hidden">
              <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="h-11 rounded-2xl">
                    <Filter className="mr-2 h-4 w-4" />
                    筛选与搜索
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="rounded-t-3xl px-0 pb-0">
                  <SheetHeader className="border-b px-5 pb-4">
                    <SheetTitle>筛选与搜索</SheetTitle>
                    <SheetDescription>先收窄范围，再快速定位合同，避免在手机上来回滑动。</SheetDescription>
                  </SheetHeader>
                  <div className="space-y-5 px-5 py-5">
                    {renderFilterControls('mobile')}
                  </div>
                  <div className="flex gap-3 border-t px-5 py-4">
                    <Button variant="outline" className="h-11 flex-1 rounded-2xl" onClick={resetFilters}>
                      重置
                    </Button>
                    <Button className="h-11 flex-1 rounded-2xl" onClick={() => setMobileFiltersOpen(false)}>
                      查看结果
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
              <Button className="h-11 rounded-2xl" onClick={() => router.push('/dashboard/purchase/create')}>
                <Plus className="mr-2 h-4 w-4" /> 新增采购
              </Button>
            </div>

            <Button className="hidden h-10 rounded-xl md:inline-flex" onClick={() => router.push('/dashboard/purchase/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增采购
            </Button>
          </div>

          <div className="grid gap-3 md:hidden">
            {purchaseLoading ? (
              <Card className="border-dashed border-border/70">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  加载中...
                </CardContent>
              </Card>
            ) : pagedPurchaseContracts.length === 0 ? (
              <Card className="border-dashed border-border/70">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {hasActiveFilters ? '没有符合筛选条件的合同' : '暂无采购合同'}
                </CardContent>
              </Card>
            ) : (
              pagedPurchaseContracts.map((contract) => {
                const firstProduct = contract.items?.[0]?.product;
                const productName = firstProduct?.customsName || '未填写商品';
                return (
                  <Card key={contract.id} className="overflow-hidden border-border/70">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="text-base font-semibold tracking-tight">{contract.contractNo}</p>
                          <p className="truncate text-sm text-muted-foreground">{productName}</p>
                        </div>
                        <div className="shrink-0">{getPurchaseStatusBadge(contract.status)}</div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 rounded-2xl bg-muted/55 p-3">
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">供应商</p>
                          <p className="text-sm font-medium">{contract.supplier?.name || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">发货店铺</p>
                          <p className="text-sm font-medium">{contract.storeName || '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">签订日期</p>
                          <p className="text-sm font-medium">{contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '—'}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">付款进度</p>
                          <AmountText tone={contract.paidAmount < contract.totalAmount ? 'warning' : 'success'} size="sm">
                            ¥{contract.paidAmount.toLocaleString()}
                          </AmountText>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">合同总额</p>
                          <p className="mt-1 text-base font-semibold tabular-nums">¥{contract.totalAmount.toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-border/70 bg-background px-3 py-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">已付金额</p>
                          <AmountText tone={contract.paidAmount < contract.totalAmount ? 'warning' : 'success'} size="sm" className="mt-1 block text-base font-semibold tabular-nums">
                            ¥{contract.paidAmount.toLocaleString()}
                          </AmountText>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <Button
                          variant="outline"
                          className="h-11 rounded-2xl"
                          onClick={() => router.push(`/dashboard/purchase/${contract.id}`)}
                          aria-label={`查看 ${contract.contractNo} 详情`}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          查看详情
                        </Button>
                        <Button
                          className="h-11 rounded-2xl"
                          onClick={() => openGenerateDialog(contract.id)}
                          aria-label={`为 ${contract.contractNo} 生成购销合同`}
                        >
                          <FileDown className="mr-2 h-4 w-4" />
                          生成合同
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          <div className="hidden overflow-hidden surface-panel md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>商品名称</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>发货店铺</TableHead>
                  <TableHead>签订日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总金额 (¥)</TableHead>
                  <TableHead className="text-right">已付 (¥)</TableHead>
                  <TableHead className="w-[100px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : pagedPurchaseContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="py-12 text-center text-muted-foreground">
                      {(purchaseStatusFilter !== 'ALL' || storeFilter || productSearch) ? '没有符合筛选条件的合同' : '暂无采购合同'}
                    </TableCell>
                  </TableRow>
                ) : (
                  pagedPurchaseContracts.map((contract) => {
                    const firstProduct = contract.items?.[0]?.product;
                    const productName = firstProduct?.customsName || '-';
                    return (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {contract.contractNo}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={productName}>
                        {productName || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {contract.supplier?.name ? (
                          <>
                            {contract.supplier.name}
                            {contract.supplier.hasQualityIssue && (
                              <Badge variant="destructive" className="ml-2 text-xs">质量问题</Badge>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[120px] truncate" title={contract.storeName || ''}>
                        {contract.storeName || '-'}
                      </TableCell>
                      <TableCell>
                        {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                      </TableCell>
                      <TableCell>{getPurchaseStatusBadge(contract.status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {contract.totalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <AmountText tone={contract.paidAmount < contract.totalAmount ? 'warning' : 'success'}>
                          {contract.paidAmount.toLocaleString()}
                        </AmountText>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="rounded-xl border border-border/65 bg-background/55"
                            onClick={() => router.push(`/dashboard/purchase/${contract.id}`)}
                            aria-label={`查看 ${contract.contractNo} 详情`}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="rounded-xl border border-border/65 bg-background/55"
                            onClick={() => openGenerateDialog(contract.id)}
                            aria-label={`为 ${contract.contractNo} 生成购销合同`}
                            title="生成购销合同"
                          >
                            <FileDown className="h-4 w-4 text-primary" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )})
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* 分页控件 */}
          <div className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              共 {filteredPurchaseContracts.length} 条
              {purchaseTotalPages > 1 && `，第 ${purchasePage}/${purchaseTotalPages} 页`}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <PageSizeSelect
                value={pageSize}
                onChange={(size) => { setPageSize(size); setPurchasePage(1); }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPurchasePage(p => Math.max(1, p - 1))}
                disabled={purchasePage === 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPurchasePage(p => Math.min(purchaseTotalPages, p + 1))}
                disabled={purchasePage === purchaseTotalPages || purchaseTotalPages <= 1}
              >
                下一页
              </Button>
            </div>
          </div>
      </div>

      {/* 采购合同详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {detailLoading ? (
            <DialogHeader>
              <DialogTitle>加载中...</DialogTitle>
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </DialogHeader>
          ) : purchaseDetail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShoppingCart className="h-5 w-5" />
                  采购合同详情：{purchaseDetail.contractNo}
                </DialogTitle>
                <DialogDescription>
                  供应商：{purchaseDetail.supplier?.name || '未知'}
                  {' | '}
                  {purchaseDetail.signedAt ? `签订日期：${format(new Date(purchaseDetail.signedAt), 'yyyy-MM-dd')}` : '未设置签订日期'}
                  {purchaseDetail.storeName && (
                    <> | 发货店铺：{purchaseDetail.storeName}</>
                  )}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* 金额汇总 */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">合同金额</p>
                    <p className="text-xl font-bold">
                      ¥{purchaseDetail.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">已付款</p>
                    <AmountText tone="success" size="lg">
                      ¥{purchaseDetail.paidAmount.toLocaleString()}
                    </AmountText>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">状态</p>
                    <div className="mt-1">{getPurchaseStatusBadge(purchaseDetail.status)}</div>
                  </div>
                </div>
                
                {/* 商品明细 */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    商品明细
                  </h4>
                  {purchaseDetail.items && purchaseDetail.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>商品名称</TableHead>
                          <TableHead>规格</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead className="text-right">单价 (¥)</TableHead>
                          <TableHead className="text-right">小计 (¥)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {purchaseDetail.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.product?.customsName || '未知商品'}
                            </TableCell>
                            <TableCell>
                              {item.specification || item.product?.specification || '-'}
                            </TableCell>
                            <TableCell>
                              {item.quantity} {item.unit || item.product?.unit}
                            </TableCell>
                            <TableCell className="text-right">
                              ¥{item.unitPrice.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              ¥{item.totalPrice.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-center py-4 text-muted-foreground">
                      暂无商品明细
                    </p>
                  )}
                </div>
                
                {/* 备注 */}
                {purchaseDetail.note && (
                  <div className="p-3 bg-muted rounded">
                    <p className="text-sm text-muted-foreground">备注：{purchaseDetail.note}</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <DialogHeader>
              <DialogTitle>合同详情</DialogTitle>
              <DialogDescription>暂无数据</DialogDescription>
            </DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {/* 生成购销合同弹窗 */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-primary" />
              生成购销合同
            </DialogTitle>
            <DialogDescription>
              填写收货信息后，系统将自动生成标准购销合同文档
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="storeName">收货店铺名称</Label>
              <Input 
                id="storeName"
                placeholder="例如：米尔皮塔"
                value={generateForm.storeName}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, storeName: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deliveryAddress">收货地址</Label>
              <Input 
                id="deliveryAddress"
                placeholder="完整收货地址"
                value={generateForm.deliveryAddress}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, deliveryAddress: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="deliveryContact">收货联系人</Label>
              <Input 
                id="deliveryContact"
                placeholder="联系人及电话"
                value={generateForm.deliveryContact}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, deliveryContact: e.target.value }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="depositRate">首付比例 (%)</Label>
              <Input 
                id="depositRate"
                type="number"
                min="0"
                max="100"
                placeholder="默认30%"
                value={generateForm.depositRate}
                onChange={(e) => setGenerateForm(prev => ({ ...prev, depositRate: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">合同中&quot;第一笔款项&quot;的比例，默认为30%</p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGenerateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleGenerateContract} disabled={generateLoading}>
              {generateLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  生成中...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  生成合同
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
