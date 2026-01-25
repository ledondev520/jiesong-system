/**
 * Input: 采购合同服务、销售合同服务
 * Output: 合同管理页面（采购合同 + 出口合同 Tab切换）
 * Pos: 核心业务页面，管理采购合同和出口合同
 * 
 * 架构说明：出口合同与货柜一对一关系，每个 EXP 编号的出口合同即为一个货柜
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PurchaseContract, SalesContract, PurchaseStatus, SalesStatus, PurchaseItem } from '@/types';
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
import { Plus, Eye, FileText, TrendingUp, ShoppingCart, Package, Loader2, FileDown, Filter } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { contractDocService } from '@/services/contractDoc.service';
import { PORTS } from '@/lib/constants';

// 扩展类型
interface PurchaseContractDetail extends PurchaseContract {
  items?: PurchaseItem[];
}

/**
 * 职责：渲染合同管理页面
 * 思路：
 *   1. 使用Tab切换采购合同/出口合同
 *   2. 出口合同与货柜一对一（EXP编号即货柜编号）
 *   3. 提供快速新建入口
 */
export default function ContractsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = searchParams.get('tab') || 'purchase';
  const statusFromUrl = searchParams.get('status') || '';
  
  // Tab状态（受控模式）
  const [activeTab, setActiveTab] = useState(tabFromUrl);
  
  // 筛选状态
  const [purchaseStatusFilter, setPurchaseStatusFilter] = useState(statusFromUrl);
  const [salesStatusFilter, setSalesStatusFilter] = useState(statusFromUrl);
  
  // 同步URL参数变化
  useEffect(() => {
    setActiveTab(tabFromUrl);
    if (tabFromUrl === 'purchase') {
      setPurchaseStatusFilter(statusFromUrl);
    } else {
      setSalesStatusFilter(statusFromUrl);
    }
  }, [tabFromUrl, statusFromUrl]);
  
  // 采购合同状态
  const [purchaseContracts, setPurchaseContracts] = useState<PurchaseContract[]>([]);
  const [purchaseLoading, setPurchaseLoading] = useState(true);
  
  // 货柜（出口合同）状态
  const [salesContracts, setSalesContracts] = useState<SalesContract[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  
  // 采购详情弹窗状态
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
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

  // 2. 加载货柜（出口合同）列表
  const loadSalesContracts = async () => {
    setSalesLoading(true);
    try {
      const response = await salesService.getAll({ page: 1, pageSize: 100 });
      setSalesContracts(response.data?.items || []);
    } catch {
      toast.error('加载货柜列表失败');
    } finally {
      setSalesLoading(false);
    }
  };

  // 3. 查看采购合同详情
  const viewPurchaseDetail = async (id: string) => {
    setDetailLoading(true);
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

  // 获取港口名称
  const getPortName = (portId: string | undefined | null) => {
    if (!portId) return '未指定';
    return PORTS.find(p => p.id === portId)?.name || '未知港口';
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
   * 获取货柜状态徽章
   */
  const getSalesStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: '' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-500' },
      [SalesStatus.PACKING]: { label: '装柜中', className: 'bg-yellow-500' },
      [SalesStatus.SHIPPED]: { label: '已发运', className: 'bg-purple-500' },
      [SalesStatus.ARRIVED]: { label: '已到达', className: 'bg-green-500' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-gray-500' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-500' },
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
          <div className="flex justify-between items-center gap-4">
            {/* 状态筛选 */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={purchaseStatusFilter} onValueChange={setPurchaseStatusFilter}>
                <SelectTrigger className="w-[150px]">
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
              {purchaseStatusFilter && purchaseStatusFilter !== 'ALL' && (
                <Badge variant="secondary">
                  筛选中: {purchaseContracts.filter(c => c.status === purchaseStatusFilter).length} 条
                </Badge>
              )}
            </div>
            <Button onClick={() => router.push('/dashboard/purchase/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增采购
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>商品名称</TableHead>
                  <TableHead>供应商</TableHead>
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
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : (() => {
                  const filtered = purchaseStatusFilter && purchaseStatusFilter !== 'ALL'
                    ? purchaseContracts.filter(c => c.status === purchaseStatusFilter)
                    : purchaseContracts;
                  return filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                      {purchaseStatusFilter && purchaseStatusFilter !== 'ALL' ? '没有符合筛选条件的合同' : '暂无采购合同'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((contract) => {
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
                        {productName}
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
                        <div className="flex gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => router.push(`/dashboard/purchase/${contract.id}`)}
                            title="查看详情"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => openGenerateDialog(contract.id)}
                            title="生成购销合同"
                          >
                            <FileDown className="h-4 w-4 text-blue-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );})
                )})()}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* 出口合同Tab */}
        <TabsContent value="sales" className="space-y-4">
          <div className="flex justify-between items-center gap-4">
            {/* 状态筛选 */}
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={salesStatusFilter} onValueChange={setSalesStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">全部状态</SelectItem>
                  <SelectItem value="DRAFT">草稿</SelectItem>
                  <SelectItem value="CONFIRMED">已确认</SelectItem>
                  <SelectItem value="PACKING">装箱中</SelectItem>
                  <SelectItem value="SHIPPED">已发运</SelectItem>
                  <SelectItem value="ARRIVED">已到达</SelectItem>
                  <SelectItem value="COMPLETED">已完成</SelectItem>
                </SelectContent>
              </Select>
              {salesStatusFilter && salesStatusFilter !== 'ALL' && (
                <Badge variant="secondary">
                  筛选中: {salesContracts.filter(c => c.status === salesStatusFilter).length} 条
                </Badge>
              )}
            </div>
            <Button onClick={() => router.push('/dashboard/sales/create')}>
              <Plus className="mr-2 h-4 w-4" /> 新增出口
            </Button>
          </div>
          
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>合同编号</TableHead>
                  <TableHead>目的港口</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>签订日期</TableHead>
                  <TableHead>箱数/体积</TableHead>
                  <TableHead className="text-right">金额 ($)</TableHead>
                  <TableHead className="w-[80px]">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salesLoading ? (
                   <TableRow>
                     <TableCell colSpan={7} className="text-center py-10">加载中...</TableCell>
                   </TableRow>
                ) : (() => {
                  const filtered = salesStatusFilter && salesStatusFilter !== 'ALL'
                    ? salesContracts.filter(c => c.status === salesStatusFilter)
                    : salesContracts;
                  return filtered.length === 0 ? (
                   <TableRow>
                     <TableCell colSpan={7} className="text-center py-10">
                       {salesStatusFilter && salesStatusFilter !== 'ALL' ? '没有符合筛选条件的合同' : '暂无出口合同'}
                     </TableCell>
                   </TableRow>
                ) : (
                  filtered.map((contract) => (
                    <TableRow key={contract.id}>
                      <TableCell className="font-medium flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                        {contract.contractNo}
                      </TableCell>
                      <TableCell>{getPortName(contract.portId)}</TableCell>
                      <TableCell>{getSalesStatusBadge(contract.status)}</TableCell>
                      <TableCell>
                        {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{contract.totalBoxes || 0} 箱</div>
                        <div className="text-xs text-muted-foreground">{(contract.volume || 0).toFixed(2)} CBM</div>
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        ${contract.totalAmount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/sales/${contract.id}`}>
                          <Button variant="ghost" size="icon" title="查看详情">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )})()}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

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

      {/* 生成购销合同弹窗 */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5 text-blue-500" />
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
              <p className="text-xs text-muted-foreground">合同中"第一笔款项"的比例，默认为30%</p>
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
