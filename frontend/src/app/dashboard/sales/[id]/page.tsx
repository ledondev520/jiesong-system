/**
 * Input: 出口合同详情API、商品API
 * Output: 出口合同详情页面（含装箱管理和3D可视化）
 * Pos: 销售管理子页面，展示合同详情与装箱可视化
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, use, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { SalesContract, PackingItem, Product, Store, SalesStatus } from '@/types';
import { salesService } from '@/services/sales.service';
import { productService } from '@/services/product.service';
import { storeService } from '@/services/store.service';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Plus, Pencil, Trash, Ship, Package, Weight, Box, Boxes } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CONTAINER_40HQ } from '@/lib/binPacking';

// 动态导入 3D 组件（避免 SSR 问题）
const Container3DView = lazy(() => import('@/components/container/Container3DView'));

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [contract, setContract] = useState<SalesContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [activeTab, setActiveTab] = useState('packing');
  
  // 添加/编辑商品对话框
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PackingItem | null>(null);
  const [itemForm, setItemForm] = useState({
    productId: '',
    storeId: '',
    quantity: 0,
    boxes: 0,
    grossWeight: 0,
    netWeight: 0,
    volume: 0,
    note: '',
  });

  useEffect(() => {
    loadData();
  }, [id]);

  /**
   * 职责：加载合同详情和基础数据
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const [contractRes, productsRes, storesRes] = await Promise.all([
        salesService.getById(id),
        productService.getAll({ pageSize: 500 }),
        storeService.getAll({ pageSize: 100 }),
      ]);
      setContract(contractRes.data);
      setProducts(productsRes.data?.items || []);
      setStores(storesRes.data?.items || []);
    } catch (error) {
      toast.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

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
      grossWeight: 0,
      netWeight: 0,
      volume: 0,
      note: '',
    });
    setIsItemDialogOpen(true);
  };

  /**
   * 职责：打开编辑商品对话框
   */
  const handleEditItem = (item: PackingItem) => {
    setEditingItem(item);
    setItemForm({
      productId: item.productId,
      storeId: item.storeId || '',
      quantity: item.quantity,
      boxes: item.boxes || 0,
      grossWeight: item.grossWeight || 0,
      netWeight: item.netWeight || 0,
      volume: item.volume || 0,
      note: item.note || '',
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
      loadData();
    } catch (error) {
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
      loadData();
    } catch (error) {
      toast.error('保存失败');
    }
  };

  /**
   * 职责：选择商品时自动填充体积/重量
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
      }));
    } else {
      setItemForm(prev => ({ ...prev, productId }));
    }
  };

  /**
   * 职责：获取状态徽章
   */
  const getStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, { label: string; className: string }> = {
      [SalesStatus.DRAFT]: { label: '草稿', className: 'bg-gray-500' },
      [SalesStatus.CONFIRMED]: { label: '已确认', className: 'bg-blue-500' },
      [SalesStatus.PACKING]: { label: '装箱中', className: 'bg-yellow-500' },
      [SalesStatus.SHIPPED]: { label: '已发运', className: 'bg-purple-500' },
      [SalesStatus.ARRIVED]: { label: '已到达', className: 'bg-green-500' },
      [SalesStatus.COMPLETED]: { label: '已完成', className: 'bg-gray-700' },
      [SalesStatus.CANCELLED]: { label: '已取消', className: 'bg-red-500' },
    };
    const config = statusMap[status] || { label: status, className: '' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  if (!contract) {
    return <div className="text-center py-10">合同不存在</div>;
  }

  // 计算容量利用率
  const volumeUsed = contract.volume || 0;
  const weightUsed = contract.grossWeight || 0;
  const volumePercent = Math.min((volumeUsed / (CONTAINER_40HQ.length * CONTAINER_40HQ.width * CONTAINER_40HQ.height / 1e9)) * 100, 100);
  const weightPercent = Math.min((weightUsed / CONTAINER_40HQ.maxWeight) * 100, 100);
  
  // 计算 CBM（使用厂家建议值）
  const maxCBM = CONTAINER_40HQ.maxVolume;
  const usedCBM = volumeUsed;
  const cbmPercent = Math.min((usedCBM / maxCBM) * 100, 100);

  return (
    <div className="space-y-6 pb-10">
      {/* 页头 */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Ship className="h-6 w-6 text-blue-500" />
            <h2 className="text-3xl font-bold tracking-tight">{contract.contractNo}</h2>
            {getStatusBadge(contract.status)}
          </div>
          <p className="text-muted-foreground">
            目的港: {contract.port?.name || '未指定'} | 
            预计到达: {contract.estimatedArrival ? format(new Date(contract.estimatedArrival), 'yyyy-MM-dd') : '-'}
          </p>
        </div>
      </div>

      {/* 容量概览 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Box className="h-5 w-5 text-purple-500" />
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
              <Boxes className="h-5 w-5 text-blue-500" />
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
              <Weight className="h-5 w-5 text-orange-500" />
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
              <Package className="h-5 w-5 text-green-500" />
              <div>
                <div className="text-2xl font-bold">${contract.totalAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">合同金额</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 标签页 */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="packing">装箱明细</TabsTrigger>
          <TabsTrigger value="3d">3D 可视化</TabsTrigger>
          <TabsTrigger value="info">合同信息</TabsTrigger>
        </TabsList>

        {/* 装箱明细 */}
        <TabsContent value="packing">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  装箱明细
                </CardTitle>
                <CardDescription>管理货柜内的商品</CardDescription>
              </div>
              <Button onClick={handleAddItem}>
                <Plus className="mr-2 h-4 w-4" /> 添加商品
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品名称</TableHead>
                    <TableHead>尺寸 (L×W×H mm)</TableHead>
                    <TableHead className="text-right">箱数</TableHead>
                    <TableHead className="text-right">毛重(kg)</TableHead>
                    <TableHead className="text-right">体积(CBM)</TableHead>
                    <TableHead className="w-[100px]">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!contract.packingItems?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                        暂无装箱商品，点击"添加商品"开始装柜
                      </TableCell>
                    </TableRow>
                  ) : (
                    contract.packingItems.map((item) => {
                      const product = products.find(p => p.id === item.productId);
                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">
                            {product?.customsName || '未知商品'}
                            {product?.specification && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({product.specification})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {product?.length && product?.width && product?.height
                              ? `${product.length}×${product.width}×${product.height}`
                              : '-'}
                          </TableCell>
                          <TableCell className="text-right">{item.boxes || '-'}</TableCell>
                          <TableCell className="text-right">{item.grossWeight || '-'}</TableCell>
                          <TableCell className="text-right">{item.volume?.toFixed(4) || '-'}</TableCell>
                          <TableCell className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleEditItem(item)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteItem(item.id)}>
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3D 可视化 */}
        <TabsContent value="3d">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Boxes className="h-5 w-5 text-blue-500" />
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

        {/* 合同信息 */}
        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>合同信息</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm text-muted-foreground">合同编号</div>
                <div className="font-medium">{contract.contractNo}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">状态</div>
                <div>{getStatusBadge(contract.status)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">总金额</div>
                <div className="font-medium">${contract.totalAmount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">已收款</div>
                <div className="font-medium">${contract.receivedAmount.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">汇率</div>
                <div className="font-medium">{contract.exchangeRate}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">目的港</div>
                <div className="font-medium">{contract.port?.name || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">签订日期</div>
                <div className="font-medium">
                  {contract.signedAt ? format(new Date(contract.signedAt), 'yyyy-MM-dd') : '-'}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">预计到达</div>
                <div className="font-medium">
                  {contract.estimatedArrival ? format(new Date(contract.estimatedArrival), 'yyyy-MM-dd') : '-'}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 添加/编辑商品对话框 */}
      <Dialog open={isItemDialogOpen} onOpenChange={setIsItemDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? '编辑商品' : '添加商品到货柜'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">商品 *</label>
              <Select 
                value={itemForm.productId} 
                onValueChange={handleProductChange}
                disabled={!!editingItem}
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择商品" />
                </SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.customsName} 
                      {p.length && p.width && p.height && (
                        <span className="text-muted-foreground ml-1">
                          ({p.length}×{p.width}×{p.height}mm)
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">数量</label>
                <Input 
                  type="number" 
                  value={itemForm.quantity}
                  onChange={(e) => setItemForm(prev => ({ ...prev, quantity: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">箱数</label>
                <Input 
                  type="number" 
                  value={itemForm.boxes}
                  onChange={(e) => setItemForm(prev => ({ ...prev, boxes: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">毛重 (kg)</label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={itemForm.grossWeight}
                  onChange={(e) => setItemForm(prev => ({ ...prev, grossWeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">净重 (kg)</label>
                <Input 
                  type="number" 
                  step="0.01"
                  value={itemForm.netWeight}
                  onChange={(e) => setItemForm(prev => ({ ...prev, netWeight: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">体积 (CBM)</label>
                <Input 
                  type="number" 
                  step="0.0001"
                  value={itemForm.volume}
                  onChange={(e) => setItemForm(prev => ({ ...prev, volume: parseFloat(e.target.value) || 0 }))}
                />
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
            <Button onClick={handleSaveItem}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
