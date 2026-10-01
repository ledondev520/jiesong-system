/**
 * Input: 出口合同详情、采购来源、40HQ 排柜、单证核对、退税准备与单柜财务 Interface
 * Output: 含手机装箱明细卡片的排柜/发运、出口三单、申报单证、船司核对、退税材料、财务结算与核销跟进的专项单主页面
 * Pos: 出口专项单装柜主页面，复用采购完工资料并承载排柜到发运的唯一主线路
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { BusinessWrite } from '@/lib/hooks/useBusinessReadOnly';
import { useState, useEffect, use, lazy, Suspense, useMemo, useRef, useCallback } from 'react';
import { SalesContract, PackingItem, Product, Store, SalesStatus, Inventory } from '@/types';
import { salesService } from '@/services/sales.service';
import { productService } from '@/services/product.service';
import { storeService } from '@/services/store.service';
import { inventoryService } from '@/services/inventory.service';
import { listContractFiles, type ContractFile } from '@/services/contractFile.service';
import { Button } from '@/components/ui/button';
import { MobileListCard } from '@/components/mobile';
import { useMobile } from '@/lib/hooks/useMobile';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Pencil, Trash, Package, Weight, Box, Boxes, Search, PackageCheck, Camera, FileSpreadsheet, FileSearch, FileCheck2, Container, Anchor, Truck, CheckCircle2, CircleDashed, CircleDot, ArrowRight, DollarSign, MapPin, AlertTriangle, Loader2, Download, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';
import {
  CONTAINER_40HQ,
  SHIPPING_READY_THRESHOLD_PCT,
  buildPackingBoxes,
  evaluateShippingReadiness,
  packBoxes,
} from '@/lib/binPacking';
import { formatDate } from '@/lib/date-format';
import { PageHeader } from '@/components/layout/PageHeader';
import ContractFiles from '@/components/contract/ContractFiles';
import { Alert, AlertDescription } from '@/components/ui/alert';

// 动态导入 3D 组件（避免 SSR 问题）
const Container3DView = lazy(() => import('@/components/container/Container3DView'));
const GenerateThreeFormsDialog = lazy(() =>
  import('@/components/dialog/GenerateThreeFormsDialog').then((module) => ({
    default: module.GenerateThreeFormsDialog,
  })),
);
const ExportPacketWorkbenchDialog = lazy(() =>
  import('@/components/dialog/ExportPacketWorkbenchDialog').then((module) => ({
    default: module.ExportPacketWorkbenchDialog,
  })),
);
const PackingListCheckDialog = lazy(() =>
  import('@/components/dialog/PackingListCheckDialog').then((module) => ({
    default: module.PackingListCheckDialog,
  })),
);
const TaxRefundPreparationDialog = lazy(() =>
  import('@/components/dialog/TaxRefundPreparationDialog').then((module) => ({
    default: module.TaxRefundPreparationDialog,
  })),
);
const ImportPurchaseItemsDialog = lazy(() =>
  import('./ImportPurchaseItemsDialog').then((module) => ({
    default: module.ImportPurchaseItemsDialog,
  })),
);
const SalesFinancePanel = lazy(() =>
  import('./SalesFinancePanel').then((module) => ({
    default: module.SalesFinancePanel,
  })),
);
const ForexVerificationPanel = lazy(() =>
  import('@/components/finance/ForexVerificationPanel').then((module) => ({
    default: module.ForexVerificationPanel,
  })),
);
import { ContractInfoEditor } from '@/components/sales/ContractInfoEditor';

interface PageProps {
  params: Promise<{ id: string }>;
}

const LOGISTICS_EVENTS = [
  { status: SalesStatus.DRAFT, label: '合同草稿', icon: CircleDashed },
  { status: SalesStatus.CONFIRMED, label: '合同确认', icon: CircleDot },
  { status: SalesStatus.PACKING, label: '装箱装柜', icon: Boxes },
  { status: SalesStatus.SHIPPED, label: '报关发运', icon: Truck },
  { status: SalesStatus.ARRIVED, label: '到港清关', icon: Anchor },
  { status: SalesStatus.COMPLETED, label: '收款完成', icon: CheckCircle2 },
];

const STATUS_ORDER: Record<SalesStatus, number> = {
  [SalesStatus.DRAFT]: 0,
  [SalesStatus.CONFIRMED]: 1,
  [SalesStatus.PACKING]: 2,
  [SalesStatus.SHIPPED]: 3,
  [SalesStatus.ARRIVED]: 4,
  [SalesStatus.COMPLETED]: 5,
  [SalesStatus.CANCELLED]: -1,
};

const SALES_NEXT_ACTIONS: Partial<Record<SalesStatus, { status: SalesStatus; label: string }>> = {
  [SalesStatus.DRAFT]: { status: SalesStatus.CONFIRMED, label: '确认出口合同' },
  [SalesStatus.CONFIRMED]: { status: SalesStatus.PACKING, label: '选择采购装柜' },
  [SalesStatus.PACKING]: { status: SalesStatus.SHIPPED, label: '确认发运' },
  [SalesStatus.SHIPPED]: { status: SalesStatus.ARRIVED, label: '确认到港' },
};

export default function SalesDetailPage({ params }: PageProps) {
  const isMobile = useMobile();
  const { id } = use(params);
  const [contract, setContract] = useState<SalesContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [inventories, setInventories] = useState<Inventory[]>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [referenceDataLoading, setReferenceDataLoading] = useState(false);
  const referenceDataLoadedRef = useRef(false);
  const [activeTab, setActiveTab] = useState('packing');
  const [productSearch, setProductSearch] = useState('');

  // 添加/编辑商品对话框
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  const [itemForm, setItemForm] = useState({
    productId: '',
    storeId: '',
    quantity: 0,
    boxes: 0,
    unitPrice: 0,
    grossWeight: 0,
    netWeight: 0,
    volume: 0,
    note: '',
    length: 0,
    width: 0,
    height: 0,
  });

  // 一键生成三张表对话框状态
  const [threeFormsDialogOpen, setThreeFormsDialogOpen] = useState(false);
  const [exportPacketOpen, setExportPacketOpen] = useState(false);
  // 船司装箱单核对对话框状态
  const [packingCheckOpen, setPackingCheckOpen] = useState(false);
  const [taxPreparationOpen, setTaxPreparationOpen] = useState(false);
  const [importPurchaseOpen, setImportPurchaseOpen] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [exportingWorkbook, setExportingWorkbook] = useState(false);

  // 截图区域引用
  const headerRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLDivElement>(null);
  const packingRef = useRef<HTMLDivElement>(null);
  const view3dRef = useRef<HTMLDivElement>(null);

  const handleThreeFormsGenerated = (results: {
    customsDeclarationId?: string;
    forexId?: string;
    taxRefundId?: string;
  }) => {
    if (results.customsDeclarationId) toast.success(`报关单已生成`);
    if (results.forexId) toast.success(`外汇核销单已生成`);
    if (results.taxRefundId) toast.success('出口退税单已生成');
  };

  const handleExportWorkbook = async () => {
    if (!contract) return;
    setExportingWorkbook(true);
    try {
      await salesService.exportExcel(contract.id, contract.contractNo);
      toast.success('出口工作簿已导出');
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '导出出口工作簿失败');
    } finally {
      setExportingWorkbook(false);
    }
  };

  const handleAdvanceStatus = async (nextStatus: SalesStatus) => {
    if (!contract) return;
    if (nextStatus === SalesStatus.PACKING && contract.status === SalesStatus.CONFIRMED) {
      setImportPurchaseOpen(true);
      return;
    }
    setStatusUpdating(true);
    try {
      await salesService.updateStatus(contract.id, nextStatus);
      toast.success('出口合同阶段已更新');
      await loadData();
      if (nextStatus === SalesStatus.SHIPPED) setTaxPreparationOpen(true);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '状态推进失败');
    } finally {
      setStatusUpdating(false);
    }
  };

  /**
   * 职责：保存页面为图片（头部+统计+装箱明细+3D可视化合并为一张长图）
   */
  const handleSaveAsImage = async () => {
    if (!contract) {
      toast.error('合同数据未加载');
      return;
    }
    
    toast.info('正在生成图片，请稍候...');
    const prevTab = activeTab;
    
    try {
      const { domToPng } = await import('modern-screenshot');
      await loadReferenceData();
      const images: string[] = [];

      // 1. 截取头部
      if (headerRef.current) {
        const headerImg = await domToPng(headerRef.current, { scale: 2, backgroundColor: '#ffffff' });
        images.push(headerImg);
      }

      // 2. 截取统计卡片
      if (statsRef.current) {
        const statsImg = await domToPng(statsRef.current, { scale: 2, backgroundColor: '#ffffff' });
        images.push(statsImg);
      }

      // 3. 截取装箱明细
      setActiveTab('packing');
      await new Promise(r => setTimeout(r, 300));
      if (packingRef.current) {
        const packingImg = await domToPng(packingRef.current, { scale: 2, backgroundColor: '#ffffff' });
        images.push(packingImg);
      }
      toast.info('正在处理3D视图...');

      // 4. 截取3D可视化（直接获取WebGL canvas）
      setActiveTab('3d');
      await new Promise(r => setTimeout(r, 1500));
      if (view3dRef.current) {
        const webglCanvas = view3dRef.current.querySelector('canvas');
        if (webglCanvas) {
          images.push(webglCanvas.toDataURL('image/png'));
        }
      }

      // 5. 加载所有图片并合并
      const loadedImages = await Promise.all(
        images.map(src => new Promise<HTMLImageElement>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(img);
          img.src = src;
        }))
      );

      // 计算总尺寸
      const maxWidth = Math.max(...loadedImages.map(img => img.width));
      const totalHeight = loadedImages.reduce((sum, img) => sum + img.height + 40, 40);

      // 创建最终canvas
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = maxWidth;
      finalCanvas.height = totalHeight;

      const ctx = finalCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, maxWidth, totalHeight);
        
        let y = 20;
        for (const img of loadedImages) {
          if (img.width > 0) {
            const x = (maxWidth - img.width) / 2;
            ctx.drawImage(img, x, y);
            y += img.height + 40;
          }
        }
      }

      // 6. 下载
      const link = document.createElement('a');
      link.download = `${contract.contractNo}-装箱明细.png`;
      link.href = finalCanvas.toDataURL('image/png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success('图片已保存');
    } catch (error) {
      console.error('保存图片失败:', error);
      toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setActiveTab(prevTab);
    }
  };

  /**
   * 职责：首屏仅加载合同详情，缩短详情页切换等待时间。
   */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [contractRes, filesRes] = await Promise.all([
        salesService.getById(id),
        listContractFiles(id, 'SALES'),
      ]);
      setContract(contractRes.data);
      setContractFiles(filesRes.data || []);
    } catch {
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  /**
   * 职责：按需加载商品、门店、库存列表，避免阻塞首屏。
   */
  const loadReferenceData = useCallback(async () => {
    if (referenceDataLoadedRef.current || referenceDataLoading) {
      return;
    }

    setReferenceDataLoading(true);
    try {
      const [productsRes, storesRes, inventoryRes] = await Promise.all([
        productService.getAll({ pageSize: 500, lite: true }),
        storeService.getAll({ pageSize: 100, lite: true }),
        inventoryService.getAll({ pageSize: 500, lite: true }),
      ]);
      setProducts(productsRes.data?.items || []);
      setStores(storesRes.data?.items || []);
      setInventories(inventoryRes.data?.items || []);
      referenceDataLoadedRef.current = true;
    } catch {
      toast.error('加载商品、门店和库存数据失败');
    } finally {
      setReferenceDataLoading(false);
    }
  }, [referenceDataLoading]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (isItemDialogOpen || activeTab === '3d' || activeTab === 'info') {
      void loadReferenceData();
    }
  }, [activeTab, isItemDialogOpen, loadReferenceData]);

  /**
   * 职责：打开添加商品对话框
   */
  const handleAddItem = () => {
    setEditingItem(null);
    setItemForm({
      productId: '',
      storeId: '',
      quantity: 0,
      boxes: 0,
      unitPrice: 0,
      grossWeight: 0,
      netWeight: 0,
      volume: 0,
      note: '',
      length: 0,
      width: 0,
      height: 0,
    });
    setIsItemDialogOpen(true);
  };

  /**
   * 职责：打开编辑商品对话框
   */
  const handleEditItem = (item: PackingItem) => {
    setEditingItem(item);
    const product = item.product || products.find(p => p.id === item.productId);
    const sourceLocked = Boolean(item.purchaseItemId);
    setItemForm({
      productId: item.productId,
      storeId: item.storeId || '',
      quantity: item.quantity,
      boxes: item.boxes || 0,
      unitPrice: item.unitPrice || 0,
      grossWeight: item.grossWeight || 0,
      netWeight: item.netWeight || 0,
      volume: item.volume || 0,
      note: item.note || '',
      length: item.length || (!sourceLocked ? product?.length : 0) || 0,
      width: item.width || (!sourceLocked ? product?.width : 0) || 0,
      height: item.height || (!sourceLocked ? product?.height : 0) || 0,
    });
    setIsItemDialogOpen(true);
  };

  /**
   * 职责：删除装箱明细
   */
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('确定要删除这个商品吗？')) return;
    try {
      await salesService.removePackingItem(id, itemId);
      toast.success('商品已删除');
      void loadData();
    } catch {
      toast.error('删除失败');
    }
  };

  /**
   * 职责：保存装箱明细
   */
  const handleSaveItem = async () => {
    if (!itemForm.productId) {
      toast.error('请选择商品');
      return;
    }
    try {
      if (editingItem) {
        await salesService.updatePackingItem(id, editingItem.id, itemForm);
        toast.success('商品更新成功');
      } else {
        await salesService.addPackingItem(id, itemForm);
        toast.success('商品添加成功');
      }
      setIsItemDialogOpen(false);
      void loadData();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    }
  };

  /**
   * 职责：计算商品优先级并排序
   */
  const sortedProducts = useMemo(() => {
    const productsWithInventory = new Set(
      inventories
        .filter(inv => inv.quantity > 0)
        .map(inv => inv.productId)
    );
    
    let filtered = products;
    if (productSearch.trim()) {
      const keyword = productSearch.toLowerCase();
      filtered = products.filter(p => 
        p.customsName?.toLowerCase().includes(keyword) ||
        p.specification?.toLowerCase().includes(keyword)
      );
    }
    
    return [...filtered].sort((a, b) => {
      const aHasInventory = productsWithInventory.has(a.id) ? 1 : 0;
      const bHasInventory = productsWithInventory.has(b.id) ? 1 : 0;
      return bHasInventory - aHasInventory;
    });
  }, [products, inventories, productSearch]);

  /**
   * 职责：检查商品是否有库存
   */
  const hasInventory = (productId: string) => {
    return inventories.some(inv => inv.productId === productId && inv.quantity > 0);
  };

  /**
   * 职责：选择商品时自动填充体积/重量/尺寸
   */
  const handleProductChange = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setItemForm(prev => ({
        ...prev,
        productId,
        grossWeight: product.grossWeight || prev.grossWeight,
        netWeight: product.netWeight || prev.netWeight,
        volume: product.volume || prev.volume,
        length: product.length || 0,
        width: product.width || 0,
        height: product.height || 0,
      }));
    } else {
      setItemForm(prev => ({ ...prev, productId }));
    }
  };

  /**
   * 职责：获取状态徽章
   */
  const getStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; tone: React.ComponentProps<typeof SemanticBadge>['tone'] }> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'info' },
      [SalesStatus.PACKING]: { label: '装箱中', tone: 'warning' },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress' },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success' },
      [SalesStatus.COMPLETED]: { label: '已完成', tone: 'secondary' },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  const packingRows = useMemo(() => contract?.packingItems ?? [], [contract?.packingItems]);
  const sourceFieldsLocked = Boolean(editingItem?.purchaseItemId);
  const packingBoxes = useMemo(
    () => buildPackingBoxes(packingRows, products),
    [packingRows, products],
  );
  const packingPlan = useMemo(() => packBoxes(packingBoxes), [packingBoxes]);
  const estimatedDimensionCount = useMemo(
    () => packingBoxes.filter((box) => box.isEstimated).length,
    [packingBoxes],
  );

  /**
   * 职责：装箱明细行排序取值
   */
  const packingAccessor = useCallback((item: PackingItem, key: string) => {
    switch (key) {
      case 'productName':
        return item.product?.customsName ?? '';
      case 'quantity':
        return item.quantity;
      case 'boxes':
        return item.boxes ?? null;
      case 'unitPrice':
        return item.unitPrice ?? null;
      case 'totalPrice':
        return item.totalPrice ?? null;
      case 'grossWeight':
        return item.grossWeight ?? null;
      default:
        return null;
    }
  }, []);

  const packingSort = useTableSort(packingRows, packingAccessor);

  /**
   * 职责：构建物流时间线数据
   */
  const logisticsTimeline = useMemo(() => {
    if (!contract) return [];
    const currentStep = STATUS_ORDER[contract.status] ?? 0;
    const timeline = [];

    // 合同创建
    timeline.push({
      date: contract.createdAt,
      label: '合同创建',
      description: `合同编号 ${contract.contractNo}`,
      state: 'completed' as const,
    });

    if (contract.signedAt) {
      timeline.push({
        date: contract.signedAt,
        label: '合同签订',
        description: contract.port?.name ? `目的港：${contract.port.name}` : '合同已签订',
        state: 'completed' as const,
      });
    }

    if (contract.packingItems && contract.packingItems.length > 0) {
      timeline.push({
        date: contract.updatedAt,
        label: '装箱完成',
        description: `${contract.totalBoxes || 0} 箱，${(contract.volume || 0).toFixed(2)} CBM`,
        state: currentStep >= STATUS_ORDER[SalesStatus.PACKING] ? 'completed' as const : 'pending' as const,
      });
    }

    if (contract.shippedAt) {
      timeline.push({
        date: contract.shippedAt,
        label: '报关发运',
        description: contract.customsBroker ? `报关行：${contract.customsBroker}` : '已报关发运',
        state: 'completed' as const,
      });
    } else if (currentStep >= STATUS_ORDER[SalesStatus.SHIPPED]) {
      timeline.push({
        date: contract.updatedAt,
        label: '报关发运',
        description: '已报关发运',
        state: 'completed' as const,
      });
    }

    if (contract.estimatedArrival) {
      timeline.push({
        date: contract.estimatedArrival,
        label: '预计到港',
        description: contract.port?.name ? `目的港：${contract.port.name}` : '',
        state: currentStep >= STATUS_ORDER[SalesStatus.ARRIVED] ? 'completed' as const : 'pending' as const,
      });
    }

    if (contract.payments && contract.payments.length > 0) {
      const lastPayment = contract.payments[contract.payments.length - 1];
      timeline.push({
        date: lastPayment.paymentDate,
        label: '收款记录',
        description: `$${(contract.receivedAmount || 0).toLocaleString()} / $${(contract.totalAmount || 0).toLocaleString()}`,
        state: (contract.receivedAmount || 0) >= (contract.totalAmount || 0) ? 'completed' as const : 'pending' as const,
      });
    }

    return timeline;
  }, [contract]);

  /**
   * 职责：提取报关 HS 编码列表
   */
  const hsCodeList = useMemo(() => {
    if (!contract?.packingItems) return [];
    const map = new Map<string, { hsCode: string; productName: string; quantity: number; totalPrice: number }>();
    for (const item of contract.packingItems) {
      const hs = item.product?.hsCode;
      if (!hs) continue;
      const productName = item.product?.customsName || '未知商品';
      const groupKey = `${hs}\u0000${productName}`;
      const existing = map.get(groupKey);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.totalPrice || 0;
      } else {
        map.set(groupKey, {
          hsCode: hs,
          productName,
          quantity: item.quantity,
          totalPrice: item.totalPrice || 0,
        });
      }
    }
    return Array.from(map.values());
  }, [contract?.packingItems]);

  const missingHsItems = useMemo(() => {
    if (!contract?.packingItems) return [];
    return contract.packingItems
      .filter((item) => !item.product?.hsCode)
      .map((item) => item.product?.customsName || '未知商品');
  }, [contract?.packingItems]);

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  if (!contract) {
    return <div className="text-center py-10">合同不存在</div>;
  }

  // 计算容量利用率
  const volumeUsed = contract.volume || 0;
  const weightUsed = contract.grossWeight || 0;
  const weightPercent = Math.min((weightUsed / CONTAINER_40HQ.maxWeight) * 100, 100);
  
  const maxCBM = CONTAINER_40HQ.maxVolume;
  const usedCBM = volumeUsed;
  const cbmPercent = Math.min((usedCBM / maxCBM) * 100, 100);

  // 出柜条件：毛重(22t)或体积(68CBM)任一利用率 ≥ 80%
  const readiness = evaluateShippingReadiness(weightUsed, usedCBM, {
    unplacedBoxCount: packingPlan.unplacedBoxes.length,
  });

  const currentStepIndex = STATUS_ORDER[contract.status] ?? 0;
  const nextSalesAction = SALES_NEXT_ACTIONS[contract.status];
  const shipmentBlocked = nextSalesAction?.status === SalesStatus.SHIPPED && !readiness.ready;
  const readinessHeadline = readiness.overloaded
    ? `不可出货：${readiness.overloadReasons.includes('weight') ? '毛重超过 22t' : ''}${readiness.overloadReasons.length === 2 ? '、' : ''}${readiness.overloadReasons.includes('volume') ? '体积超过 68 CBM' : ''}`
    : !readiness.physicalFit
      ? `不可出货：仍有 ${readiness.unplacedBoxCount} 箱未装下`
      : readiness.ready
        ? '满足出柜条件且全部箱件可装下'
        : '未达出柜标准';
  const readinessIsBlocking = readiness.overloaded || !readiness.physicalFit;

  return (
    <div className="min-w-0 space-y-6 pb-10">
      {/* 页头 */}
      <div ref={headerRef}>
        <PageHeader
          title={contract.contractNo}
          description={`目的港: ${contract.port?.name || '未指定'} | 签订: ${formatDate(contract.signedAt)} | 预计到达: ${formatDate(contract.estimatedArrival)}`}
          backHref="/dashboard/sales"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {getStatusBadge(contract.status)}
              {nextSalesAction && (
                <BusinessWrite><Button
                  onClick={() => handleAdvanceStatus(nextSalesAction.status)}
                  disabled={statusUpdating || shipmentBlocked}
                  title={shipmentBlocked ? readinessHeadline : undefined}
                >
                  {statusUpdating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                  {nextSalesAction.label}
                </Button></BusinessWrite>
              )}
              <BusinessWrite><Button variant="outline" onClick={handleExportWorkbook} disabled={exportingWorkbook}>
                {exportingWorkbook ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                导出出口工作簿
              </Button></BusinessWrite>
              <BusinessWrite><Button variant="default" onClick={() => setExportPacketOpen(true)}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                出口三单工作台
              </Button></BusinessWrite>
              <Button variant="outline" onClick={handleSaveAsImage}>
                <Camera className="mr-2 h-4 w-4" />
                保存为图片
              </Button>
              <BusinessWrite><Button variant="outline" onClick={() => setPackingCheckOpen(true)}>
                <FileSearch className="mr-2 h-4 w-4" />
                核对船司装箱单
              </Button></BusinessWrite>
              <BusinessWrite><Button variant="outline" onClick={() => setTaxPreparationOpen(true)}>
                <FileCheck2 className="mr-2 h-4 w-4" />
                检查退税材料
              </Button></BusinessWrite>
              <BusinessWrite><Button
                variant="outline"
                onClick={() => setThreeFormsDialogOpen(true)}
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                生成申报三表
              </Button></BusinessWrite>
            </div>
          }
        />
      </div>

      {/* 出柜条件（双80%指标）：毛重 22t / 体积 68CBM 任一 ≥ 80% 即可出柜 */}
      <div
        className={
          readinessIsBlocking
            ? 'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-red-200 bg-red-50/70 px-4 py-3 dark:border-red-900 dark:bg-red-950/40'
            : readiness.ready
            ? 'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/40'
            : 'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/40'
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {readinessIsBlocking ? (
            <AlertTriangle className="h-5 w-5 text-red-600" />
          ) : readiness.ready ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <CircleDashed className="h-5 w-5 text-amber-600" />
          )}
          <span className={readinessIsBlocking ? 'text-sm font-semibold text-red-700 dark:text-red-400' : readiness.ready ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-400' : 'text-sm font-semibold text-amber-700 dark:text-amber-400'}>
            {readinessHeadline}
          </span>
          <span className="text-xs text-muted-foreground">
            （毛重或体积任一利用率 ≥ {SHIPPING_READY_THRESHOLD_PCT}%）
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Weight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">毛重利用率</span>
          <span className={readiness.weightPct >= SHIPPING_READY_THRESHOLD_PCT ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400' : 'font-semibold tabular-nums'}>
            {readiness.weightPct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">/ {CONTAINER_40HQ.maxWeight / 1000}t</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Container className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">3D排柜</span>
          <span className={readiness.physicalFit ? 'font-semibold text-emerald-700 dark:text-emerald-400' : 'font-semibold text-red-700 dark:text-red-400'}>
            已装 {packingPlan.placedBoxes.length} 箱 / 未装 {packingPlan.unplacedBoxes.length} 箱
          </span>
        </div>
        {estimatedDimensionCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            {estimatedDimensionCount} 项尺寸由体积推算，出货前需复核
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <Boxes className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">体积利用率</span>
          <span className={readiness.volumePct >= SHIPPING_READY_THRESHOLD_PCT ? 'font-semibold tabular-nums text-emerald-700 dark:text-emerald-400' : 'font-semibold tabular-nums'}>
            {readiness.volumePct.toFixed(1)}%
          </span>
          <span className="text-muted-foreground">/ {CONTAINER_40HQ.maxVolume} CBM</span>
        </div>
      </div>

      {/* 容量概览 */}
      <div ref={statsRef} className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{contract.totalBoxes || 0}</div>
                <p className="text-xs text-muted-foreground">总箱数</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{usedCBM.toFixed(2)}</div>
                <p className="text-xs text-muted-foreground">体积 (CBM) / {maxCBM}</p>
              </div>
            </div>
            <Progress value={cbmPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Weight className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">{weightUsed.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">毛重 (kg) / {CONTAINER_40HQ.maxWeight.toLocaleString()}</p>
              </div>
            </div>
            <Progress value={weightPercent} className="mt-2 h-2" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <div>
                <div className="text-2xl font-bold">${(contract.totalAmount || 0).toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">合同金额</p>
              </div>
            </div>
            {(contract.receivedAmount || 0) > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">已收款</span>
                  <span className="font-medium">${(contract.receivedAmount || 0).toLocaleString()}</span>
                </div>
                <Progress 
                  value={Math.min(((contract.receivedAmount || 0) / (contract.totalAmount || 1)) * 100, 100)} 
                  className="mt-1 h-1.5" 
                />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 货柜详情 + 物流时间线 + 报关/收款 概览 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 货柜详情卡片 */}
        <Card className="min-w-0 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Container className="h-4 w-4 text-primary" />
              货柜详情
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="flex items-center gap-3 rounded-lg bg-muted/40 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                <Container className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium">{contract.contractNo}</p>
                <p className="text-xs text-muted-foreground">40HQ 标准货柜</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">尺寸</p>
                <p className="break-words text-sm font-medium tabular-nums">
                  {CONTAINER_40HQ.length}×{CONTAINER_40HQ.width}×{CONTAINER_40HQ.height} mm
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">体积</p>
                <p className="text-sm font-medium tabular-nums">{usedCBM.toFixed(2)} / {maxCBM} CBM</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">毛重</p>
                <p className="text-sm font-medium tabular-nums">{weightUsed.toLocaleString()} kg</p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">净重</p>
                <p className="text-sm font-medium tabular-nums">{(contract.netWeight || 0).toLocaleString()} kg</p>
              </div>
            </div>
            {contract.port?.name && (
              <div className="flex items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
                <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">目的港：</span>
                <span className="text-xs font-medium">{contract.port.name}</span>
              </div>
            )}
            {contract.isFumigated && (
              <div className="flex items-center gap-2 text-xs text-amber-700">
                <PackageCheck className="h-3.5 w-3.5" />
                <span>已熏蒸处理</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 物流时间线 */}
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4 text-primary" />
              物流时间线
            </CardTitle>
          </CardHeader>
          <CardContent className="min-w-0 pt-0">
            <div className="flex min-w-0 items-center gap-1.5 mb-4 overflow-x-auto pb-1">
              {LOGISTICS_EVENTS.map((event, idx) => {
                const EventIcon = event.icon;
                const isCompleted = idx <= currentStepIndex;
                const isCurrent = idx === currentStepIndex;
                return (
                  <div key={event.status} className="flex items-center gap-1.5 shrink-0">
                    <div
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        isCompleted
                          ? isCurrent
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-primary/10 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      <EventIcon className="h-3 w-3" />
                      {event.label}
                    </div>
                    {idx < LOGISTICS_EVENTS.length - 1 && (
                      <ArrowRight className={`h-3 w-3 shrink-0 ${isCompleted && idx < currentStepIndex ? 'text-primary/50' : 'text-muted-foreground/30'}`} />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-0">
              {logisticsTimeline.map((item, idx) => (
                <div key={idx} className="relative flex gap-4 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`h-2 w-2 rounded-full ${item.state === 'completed' ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                    {idx < logisticsTimeline.length - 1 && (
                      <div className={`w-px flex-1 mt-1 ${item.state === 'completed' ? 'bg-primary/30' : 'bg-border'}`} />
                    )}
                  </div>
                  <div className="flex-1 -mt-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{formatDate(item.date)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              ))}
              {logisticsTimeline.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">暂无物流记录</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
        <TabsList>
          <TabsTrigger value="packing">装箱明细</TabsTrigger>
          <TabsTrigger value="3d">3D 可视化</TabsTrigger>
          <TabsTrigger value="info">合同信息</TabsTrigger>
          <TabsTrigger value="customs">报关信息</TabsTrigger>
          <TabsTrigger value="finance">财务结算</TabsTrigger>
        </TabsList>

        {/* 装箱明细 */}
        <TabsContent value="packing">
          <Card ref={packingRef}>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  装箱明细
                </CardTitle>
                <CardDescription>管理货柜内的商品</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <BusinessWrite><Button variant="outline" onClick={() => setImportPurchaseOpen(true)}>
                  <PackageCheck className="mr-2 h-4 w-4" /> 从已完工采购导入
                </Button></BusinessWrite>
                <BusinessWrite><Button onClick={handleAddItem}>
                  <Plus className="mr-2 h-4 w-4" /> 手动添加商品
                </Button></BusinessWrite>
              </div>
            </CardHeader>
            <CardContent>
              {isMobile ? (
                <div className="space-y-3">
                  {packingSort.sortedData.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">暂无装箱商品，可从已完工采购导入，也可手动添加</p>
                  ) : packingSort.sortedData.map((item) => (
                    <MobileListCard
                      key={item.id}
                      title={item.product?.customsName || '未知商品'}
                      subtitle={[item.specification || item.product?.specification, item.purchaseContractNo ? `来源 ${item.purchaseContractNo}` : null].filter(Boolean).join(' · ')}
                      fields={[
                        { label: '数量', value: item.quantity ?? '-' },
                        { label: '箱数', value: item.boxes ?? '-' },
                        { label: '单价', value: item.unitPrice != null ? `$${item.unitPrice.toLocaleString()}` : '-' },
                        { label: '毛重', value: item.grossWeight != null ? `${item.grossWeight} kg` : '-' },
                      ]}
                      amount={{ label: '总价', value: item.totalPrice != null ? `$${item.totalPrice.toLocaleString()}` : '-', emphasis: 'primary' }}
                      action={
                        <div className="grid grid-cols-2 gap-2">
                          <BusinessWrite><Button variant="outline" className="h-11" aria-label={`编辑 ${item.product?.customsName || '装箱商品'}`} onClick={() => handleEditItem(item)}>
                            <Pencil className="mr-1.5 h-4 w-4" />编辑
                          </Button></BusinessWrite>
                          <BusinessWrite><Button variant="outline" className="h-11 text-destructive" aria-label={`删除 ${item.product?.customsName || '装箱商品'}`} onClick={() => handleDeleteItem(item.id)}>
                            <Trash className="mr-1.5 h-4 w-4" />删除
                          </Button></BusinessWrite>
                        </div>
                      }
                    />
                  ))}
                </div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead
                      sortKey="productName"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                    >
                      商品名称
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="quantity"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                      className="text-right"
                    >
                      数量
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="boxes"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                      className="text-right"
                    >
                      箱数
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="unitPrice"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                      className="text-right"
                    >
                      单价($)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="totalPrice"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                      className="text-right"
                    >
                      总价($)
                    </SortableTableHead>
                    <SortableTableHead
                      sortKey="grossWeight"
                      currentSortKey={packingSort.sortKey}
                      currentSortDir={packingSort.sortDir}
                      onSort={packingSort.onSort}
                      className="text-right"
                    >
                      毛重(kg)
                    </SortableTableHead>
                    <TableHead className="w-[80px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!packingSort.sortedData.length ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        暂无装箱商品，可从已完工采购导入，也可手动添加
                      </TableCell>
                    </TableRow>
                  ) : (
                    packingSort.sortedData.map((item) => {
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {item.product?.customsName || '未知商品'}
                            {(item.specification || item.product?.specification) && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({item.specification || item.product?.specification})
                              </span>
                            )}
                            {item.purchaseContractNo ? (
                              <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">
                                来源 {item.purchaseContractNo}
                              </span>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-right">{item.quantity || '-'}</TableCell>
                          <TableCell className="text-right">{item.boxes ?? '-'}</TableCell>
                          <TableCell className="text-right">
                            {item.unitPrice ? `$${item.unitPrice.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right font-medium text-primary">
                            {item.totalPrice ? `$${item.totalPrice.toLocaleString()}` : '-'}
                          </TableCell>
                          <TableCell className="text-right">{item.grossWeight || '-'}</TableCell>
                          <TableCell className="flex gap-1">
                            <BusinessWrite><Button
                              variant="ghost"
                              size="icon"
                              aria-label={`编辑 ${item.product?.customsName || '装箱商品'}`}
                              onClick={() => handleEditItem(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button></BusinessWrite>
                            <BusinessWrite><Button
                              variant="ghost"
                              size="icon"
                              aria-label={`删除 ${item.product?.customsName || '装箱商品'}`}
                              onClick={() => handleDeleteItem(item.id)}
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button></BusinessWrite>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3D 可视化 */}
        <TabsContent value="3d">
          <Card ref={view3dRef}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-primary" />
                3D 装箱可视化
              </CardTitle>
              <CardDescription>
                40HQ 标准货柜 ({CONTAINER_40HQ.length}×{CONTAINER_40HQ.width}×{CONTAINER_40HQ.height} mm)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contract.packingItems && contract.packingItems.length > 0 ? (
                <Suspense fallback={<div className="h-[500px] flex items-center justify-center">加载3D场景...</div>}>
                  <Container3DView 
                    packingItems={contract.packingItems}
                    products={products}
                  />
                </Suspense>
              ) : (
                <div className="h-[500px] flex items-center justify-center text-muted-foreground">
                  请先添加装箱商品以查看3D效果
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 合同信息（可编辑） */}
        <TabsContent value="info">
          <ContractInfoEditor 
            contract={contract}
            stores={stores}
            onSave={async (data) => {
              try {
                await salesService.update(id, data);
                toast.success('合同信息更新成功');
                void loadData();
              } catch {
                toast.error('更新失败');
              }
            }}
          />
        </TabsContent>

        {/* 报关信息 */}
        <TabsContent value="customs">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                报关 HS 编码
              </CardTitle>
              <CardDescription>
                根据装箱明细自动汇总的海关申报信息
              </CardDescription>
            </CardHeader>
            <CardContent>
              {missingHsItems.length > 0 && (
                <Alert variant="destructive" className="mb-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">仍有 {missingHsItems.length} 项装箱商品未匹配 HS 编码</p>
                      <p>未匹配：{missingHsItems.join('、')}</p>
                      <p className="text-xs">
                        为避免申报遗漏，请先通过历史记录、AI 建议或人工确认补齐；申报三表会阻止不完整单据生成。
                      </p>
                    </div>
                    <BusinessWrite><Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setThreeFormsDialogOpen(true)}
                    >
                      处理未匹配 HS 编码
                    </Button></BusinessWrite>
                  </AlertDescription>
                </Alert>
              )}
              {hsCodeList.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  暂无报关信息，请先在装箱明细中添加带有 HS 编码的商品
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HS 编码</TableHead>
                      <TableHead>商品名称</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">总价 ($)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hsCodeList.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-sm font-medium">{item.hsCode}</TableCell>
                        <TableCell>{item.productName}</TableCell>
                        <TableCell className="text-right">{item.quantity.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium">
                          ${item.totalPrice.toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 单柜财务结算：仅进入标签时加载，避免阻塞装柜首屏。 */}
        <TabsContent value="finance" className="space-y-4">
          {activeTab === 'finance' && (
            <Suspense fallback={<div className="py-10 text-center text-sm text-muted-foreground">正在汇总财务数据...</div>}>
              <SalesFinancePanel
                salesContractId={contract.id}
                contractNo={contract.contractNo}
                onChanged={loadData}
              />
              <ForexVerificationPanel salesContractId={contract.id} />
            </Suspense>
          )}
        </TabsContent>
      </Tabs>

      <ContractFiles
        contractId={id}
        contractType="SALES"
        files={contractFiles}
        onChange={setContractFiles}
        title="源文件附件"
        description="支持 PDF、JPG、PNG、XLSX、DOCX 格式，单文件最大 10MB，归档 WPS 出货合同、装箱单、报关单、退税联、提单等原始文件"
        emptyHint="暂无附件，点击「上传附件」归档出货源文件"
      />

      {/* 添加/编辑商品对话框 */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑商品' : '添加商品到货柜'}</DialogTitle>
            <DialogDescription>
              {sourceFieldsLocked
                ? '采购来源资料保持锁定，仅补充出口售价和备注。'
                : '填写商品信息和规格尺寸，尺寸将用于3D可视化。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {sourceFieldsLocked ? (
              <Alert>
                <LockKeyhole className="h-4 w-4" />
                <AlertDescription>
                  数量、箱数、毛净重、体积和尺寸来自采购完工资料。若需改变箱数，请删除后重新导入，系统会重新计算剩余可排数量。
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="space-y-2">
              <label className="text-sm font-medium">商品 *</label>
              {/* 搜索框 */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索商品名称..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="pl-9"
                  disabled={!!editingItem || referenceDataLoading}
                />
              </div>
              <Select 
                value={itemForm.productId} 
                onValueChange={handleProductChange}
                disabled={!!editingItem || referenceDataLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择商品（有库存的优先显示）" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {referenceDataLoading ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      加载商品和库存中...
                    </div>
                  ) : sortedProducts.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground text-center">
                      {productSearch ? '未找到匹配商品' : '暂无商品'}
                    </div>
                  ) : (
                    sortedProducts.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <div className="flex items-center gap-2">
                          {hasInventory(p.id) && (
                            <PackageCheck className="h-3 w-3 text-primary flex-shrink-0" />
                          )}
                          <span>{p.customsName}</span>
                          {p.length && p.width && p.height && (
                            <span className="text-muted-foreground text-xs">
                              ({p.length}×{p.width}×{p.height}mm)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <PackageCheck className="mr-1 inline h-3 w-3 text-primary" />
                表示有库存
              </p>
            </div>

            {/* 商品规格尺寸（用于3D可视化） */}
            {itemForm.productId && (
              <div className="p-3 bg-primary/7 rounded-lg border border-primary/22">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-primary">
                    商品规格尺寸（用于3D可视化）
                  </span>
                  {(itemForm.length === 0 || itemForm.width === 0 || itemForm.height === 0) && (
                    <span className="text-xs text-primary/80">
                      请填写尺寸以获得准确的3D效果
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">长度 (mm)</label>
                    <Input 
                      aria-label="长度"
                      type="number" 
                      value={itemForm.length || ''}
                      placeholder="500"
                      disabled={sourceFieldsLocked}
                      onChange={(e) => setItemForm(prev => ({ ...prev, length: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">宽度 (mm)</label>
                    <Input 
                      aria-label="宽度"
                      type="number" 
                      value={itemForm.width || ''}
                      placeholder="500"
                      disabled={sourceFieldsLocked}
                      onChange={(e) => setItemForm(prev => ({ ...prev, width: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">高度 (mm)</label>
                    <Input 
                      aria-label="高度"
                      type="number" 
                      value={itemForm.height || ''}
                      placeholder="500"
                      disabled={sourceFieldsLocked}
                      onChange={(e) => setItemForm(prev => ({ ...prev, height: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">数量</label>
                <Input 
                  aria-label="数量"
                  type="number" 
                  value={itemForm.quantity}
                  disabled={sourceFieldsLocked}
                  onChange={(e) => setItemForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">箱数</label>
                <Input 
                  aria-label="箱数"
                  type="number" 
                  value={itemForm.boxes}
                  disabled={sourceFieldsLocked}
                  onChange={(e) => setItemForm(prev => ({ ...prev, boxes: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* 价格信息 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">单价 (USD)</label>
                <Input 
                  aria-label="单价"
                  type="number" 
                  step="0.01"
                  value={itemForm.unitPrice || ''}
                  placeholder="0.00"
                  onChange={(e) => setItemForm(prev => ({ ...prev, unitPrice: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">总价 (USD)</label>
                <div className="h-10 rounded-md border bg-muted/50 px-3 py-2 text-sm font-medium text-primary">
                  ${(itemForm.unitPrice * itemForm.quantity).toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">自动计算: 单价 × 数量</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">毛重 (kg)</label>
                <Input 
                  aria-label="毛重"
                  type="number" 
                  step="0.01"
                  value={itemForm.grossWeight}
                  disabled={sourceFieldsLocked}
                  onChange={(e) => setItemForm(prev => ({ ...prev, grossWeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">净重 (kg)</label>
                <Input 
                  aria-label="净重"
                  type="number" 
                  step="0.01"
                  value={itemForm.netWeight}
                  disabled={sourceFieldsLocked}
                  onChange={(e) => setItemForm(prev => ({ ...prev, netWeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">体积 (CBM)</label>
                <Input 
                  aria-label="体积"
                  type="number" 
                  step="0.0001"
                  value={itemForm.volume}
                  disabled={sourceFieldsLocked}
                  onChange={(e) => setItemForm(prev => ({ ...prev, volume: parseFloat(e.target.value) || 0 }))}
                />
                {/* 体积预估提示 */}
                {itemForm.length > 0 && itemForm.width > 0 && itemForm.height > 0 && itemForm.boxes > 0 && (
                  <p className="text-xs text-primary">
                    预估: {((itemForm.length * itemForm.width * itemForm.height / 1e9) * itemForm.boxes).toFixed(4)} CBM
                    （{itemForm.length}×{itemForm.width}×{itemForm.height}mm × {itemForm.boxes}箱）
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">备注</label>
              <Input 
                value={itemForm.note}
                onChange={(e) => setItemForm(prev => ({ ...prev, note: e.target.value }))}
                placeholder="可选备注"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsItemDialogOpen(false)}>取消</Button>
            <Button onClick={handleSaveItem} disabled={referenceDataLoading}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {threeFormsDialogOpen && (
        <Suspense fallback={null}>
          <GenerateThreeFormsDialog
            open={threeFormsDialogOpen}
            onOpenChange={setThreeFormsDialogOpen}
            salesContract={contract}
            onGenerated={handleThreeFormsGenerated}
          />
        </Suspense>
      )}

      {exportPacketOpen && (
        <Suspense fallback={null}>
          <ExportPacketWorkbenchDialog
            open={exportPacketOpen}
            onOpenChange={setExportPacketOpen}
            salesContract={contract}
            onGenerated={loadData}
          />
        </Suspense>
      )}

      {packingCheckOpen && (
        <Suspense fallback={null}>
          <PackingListCheckDialog
            open={packingCheckOpen}
            onOpenChange={setPackingCheckOpen}
            contractId={contract.id}
            contractNo={contract.contractNo}
            onChanged={loadData}
          />
        </Suspense>
      )}

      {taxPreparationOpen && (
        <Suspense fallback={null}>
          <TaxRefundPreparationDialog
            open={taxPreparationOpen}
            onOpenChange={setTaxPreparationOpen}
            salesContractId={contract.id}
            contractNo={contract.contractNo}
          />
        </Suspense>
      )}

      {importPurchaseOpen && (
        <Suspense fallback={null}>
          <ImportPurchaseItemsDialog
            open={importPurchaseOpen}
            onOpenChange={setImportPurchaseOpen}
            salesContractId={contract.id}
            onImported={loadData}
          />
        </Suspense>
      )}
    </div>
  );
}
