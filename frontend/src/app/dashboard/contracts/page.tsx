/**
 * Input: 采购合同服务、销售合同服务
 * Output: 合同管理页面（采购+销售 Tab切换）
 * Pos: 核心业务页面，管理所有合同
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PurchaseContract, SalesContract, PurchaseStatus, SalesStatus, SalesItem, PurchaseItem } from '@/types';
import { purchaseService } from '@/services/purchase.service';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Eye, FileText, TrendingUp, ShoppingCart, Package, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

// 扩展类型，包含商品明细
interface SalesContractDetail extends SalesContract {
  items?: SalesItem[];
}

interface PurchaseContractDetail extends PurchaseContract {
  items?: PurchaseItem[];
}

/**
 * 职责：渲染合同管理页面
 * 思路：
 *   1. 使用Tab切换采购/销售合同
 *   2. 分别加载和展示两类合同
 *   3. 提供快速新建入口
 */
export default function ContractsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'purchase';
  
  // Tab状态（受控模式）
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  
  // 同步URL参数变化
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);
  
  // 采购合同状态
  const [purchaseContracts, setPurchaseContracts] = useState<PurchaseContract[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  
  // 销售合同状态
  const [salesContracts, setSalesContracts] = useState<SalesContract[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  
  // 详情弹窗状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [salesDetail, setSalesDetail] = useState<SalesContractDetail | null>(null);
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseContractDetail | null>(null);

  // 0. 初始化加载
  useEffect(() => {
    loadPurchaseContracts();
    loadSalesContracts();
  }, []);

  // 1. 加载采购合同
  const loadPurchaseContracts = async () => {
    setPurchaseLoading(true);
    try {
      const response = await purchaseService.getAll({ page: 1, pageSize: 100 });
      setPurchaseContracts(response.data?.items || []);
    } catch {
      toast.error('加载采购合同失败');
    } finally {
      setPurchaseLoading(false);
    }
  };

  // 2. 加载销售合同
  const loadSalesContracts = async () => {
    setSalesLoading(true);
    try {
      const response = await salesService.getAll({ page: 1, pageSize: 100 });
      setSalesContracts(response.data?.items || []);
    } catch {
      toast.error('加载销售合同失败');
    } finally {
      setSalesLoading(false);
    }
  };

  // 3. 查看销售合同详情
  const viewSalesDetail = async (id: string) => {
    setDetailLoading(true);
    setPurchaseDetail(null);
    setDetailOpen(true);
    try {
      const response = await salesService.getById(id);
      setSalesDetail(response.data || null);
    } catch {
      toast.error('加载合同详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 4. 查看采购合同详情
  const viewPurchaseDetail = async (id: string) => {
    setDetailLoading(true);
    setSalesDetail(null);
    setDetailOpen(true);
    try {
      const response = await purchaseService.getById(id);
      setPurchaseDetail(response.data || null);
    } catch {
      toast.error('加载合同详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 关闭弹窗时清理状态
  const closeDetail = () => {
    setDetailOpen(false);
    setSalesDetail(null);
    setPurchaseDetail(null);
  };

  // 计算销售合同的成本价总额（人民币）
  const calculateCostTotal = (items: SalesItem[] | undefined) => {
    if (!items) return 0;
    return items.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);
  };

  /**
   * 获取采购状态徽章
   */
  const getPurchaseStatusBadge = (status: PurchaseStatus) => {
    const statusMap: Record<PurchaseStatus, { label: string; className: string }> = {
      [PurchaseStatus.DRAFT]: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      [PurchaseStatus.SIGNED]: { label: '已签订', className: 'bg-blue-100 text-blue-800' },
      [PurchaseStatus.PRODUCING]: { label: '生产中', className: 'bg-yellow-100 text-yellow-800' },
      [PurchaseStatus.SHIPPED]: { label: '已发货', className: 'bg-purple-100 text-purple-800' },
      [PurchaseStatus.RECEIVED]: { label: '已收货', className: 'bg-cyan-100 text-cyan-800' },
      [PurchaseStatus.COMPLETED]: { label: '已完成', className: 'bg-green-100 text-green-800' },
      [PurchaseStatus.CANCELLED]: { label: '已取消', className: 'bg-red-100 text-red-800' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  /**
   * 获取销售状态徽章
   */
  const getSalesStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: 'bg-gray-100 text-gray-800' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-100 text-blue-800' },
      [SalesStatus.PAID]: { label: '已收款', className: 'bg-green-100 text-green-800' },
      [SalesStatus.SHIPPED]: { label: '已发货', className: 'bg-purple-100 text-purple-800' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-gray-500 text-white' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-100 text-red-800' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">合同管理</h2>
        <p className="text-muted-foreground">管理采购合同与出口合同</p>
      </div>

      {/* Tab切换 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="purchase" className="gap-2">
              <ShoppingCart className="h-4 w-4" />
              采购合同
            </TabsTrigger>
            <TabsTrigger value="sales" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              出口合同
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 采购合同Tab */}
        <TabsContent value="purchase" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/dashboard/purchase/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增采购
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>供应商</TableHead>
                  <TableHead>签订日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">总金额 (¥)</TableHead>
                  <TableHead className="text-right">已付 (¥)</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : purchaseContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      暂无采购合同
                    </TableCell>
                  </TableRow>
                ) : (
                  purchaseContracts.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          {contract.contractNo}
                        </div>
                      </TableCell>
                      <TableCell>
                        {contract.supplier?.name}
                        {contract.supplier?.hasQualityIssue && (
                          <Badge variant="destructive" className="ml-2 text-xs">质量问题</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                      </TableCell>
                      <TableCell>{getPurchaseStatusBadge(contract.status)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {contract.totalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={contract.paidAmount < contract.totalAmount ? 'text-orange-600' : 'text-green-600'}>
                          {contract.paidAmount.toLocaleString()}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => viewPurchaseDetail(contract.id)}
                          title="查看详情"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 销售合同Tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => router.push('/dashboard/sales/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增出口
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>签订日期</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">成本价 (¥)</TableHead>
                  <TableHead className="text-right">售价 ($)</TableHead>
                  <TableHead className="text-right">已收 ($)</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : salesContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      暂无出口合同
                    </TableCell>
                  </TableRow>
                ) : (
                  salesContracts.map((contract) => {
                    // 计算成本价（如果有items）
                    const costTotal = calculateCostTotal(contract.items);
                    return (
                      <TableRow key={contract.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            {contract.contractNo}
                          </div>
                        </TableCell>
                        <TableCell>
                          {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                        </TableCell>
                        <TableCell>{getSalesStatusBadge(contract.status)}</TableCell>
                        <TableCell className="text-right font-medium text-orange-600">
                          ¥{costTotal.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          ${contract.totalAmount.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={contract.receivedAmount < contract.totalAmount ? 'text-orange-600' : 'text-green-600'}>
                            ${contract.receivedAmount.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => viewSalesDetail(contract.id)}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* 合同详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={closeDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {detailLoading ? (
            <DialogHeader>
              <DialogTitle>加载中...</DialogTitle>
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </DialogHeader>
          ) : salesDetail ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  出口合同详情：{salesDetail.contractNo}
                </DialogTitle>
                <DialogDescription>
                  {salesDetail.signedAt ? `签订日期：${format(new Date(salesDetail.signedAt), 'yyyy-MM-dd')}` : '未设置签订日期'}
                  {' | '}状态：{getSalesStatusBadge(salesDetail.status)}
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                {/* 金额汇总 */}
                <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">成本价（人民币）</p>
                    <p className="text-xl font-bold text-orange-600">
                      ¥{calculateCostTotal(salesDetail.items).toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">售价（美元）</p>
                    <p className="text-xl font-bold text-green-600">
                      ${salesDetail.totalAmount.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">已收款</p>
                    <p className="text-xl font-bold">
                      ${salesDetail.receivedAmount.toLocaleString()}
                    </p>
                  </div>
                </div>
                
                {/* 商品明细 */}
                <div>
                  <h4 className="font-medium mb-2 flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    商品明细
                  </h4>
                  {salesDetail.items && salesDetail.items.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>商品名称</TableHead>
                          <TableHead>数量</TableHead>
                          <TableHead className="text-right">成本价 (¥)</TableHead>
                          <TableHead className="text-right">售价 ($)</TableHead>
                          <TableHead>门店</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {salesDetail.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.product?.customsName || '未知商品'}
                            </TableCell>
                            <TableCell>
                              {item.quantity} {item.unit || item.product?.unit}
                            </TableCell>
                            <TableCell className="text-right text-orange-600">
                              ¥{item.costPrice.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              ${item.sellingPrice.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              {item.store?.name || '-'}
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
                {salesDetail.note && (
                  <div className="p-3 bg-muted rounded">
                    <p className="text-sm text-muted-foreground">备注：{salesDetail.note}</p>
                  </div>
                )}
              </div>
            </>
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
                    <p className="text-xl font-bold text-green-600">
                      ¥{purchaseDetail.paidAmount.toLocaleString()}
                    </p>
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
    </div>
  );
}
