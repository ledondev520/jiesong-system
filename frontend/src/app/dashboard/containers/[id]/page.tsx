/**
 * Input: 货柜详情API
 * Output: 货柜装箱详情页面
 * Pos: 货柜管理子页面，展示装箱明细与容量可视化
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { Container, ContainerItem, Product, Store, ContainerStatus } from '@/types';
import { containerService } from '@/services/container.service';
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
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Pencil, Trash, Package, Weight, Box } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { PageHeader } from '@/components/layout/PageHeader';

// 40HQ 标准货柜规格（厂家建议值）
const CONTAINER_40HQ = {
  maxVolume: 68,      // CBM（厂家建议最大装载体积）
  maxWeight: 22500,   // kg (厂家建议最大毛重 22.5吨)
  length: 12.03,      // m
  width: 2.35,        // m
  height: 2.69,       // m
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function ContainerDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const router = useRouter();
  const [container, setContainer] = useState<Container | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  
  // 添加/编辑商品对话框
  const [isItemDialogOpen, setIsItemDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ContainerItem | null>(null);
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
   * 职责：加载货柜详情和基础数据
   */
  const loadData = async () => {
    setLoading(true);
    try {
      const [containerRes, productsRes, storesRes] = await Promise.all([
        containerService.getById(id),
        productService.getAll({ pageSize: 500 }),
        storeService.getAll({ pageSize: 100 }),
      ]);
      setContainer(containerRes.data);
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
  const handleEditItem = (item: ContainerItem) => {
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
      await containerService.removeItem(id, itemId);
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
        await containerService.updateItem(id, editingItem.id, itemForm);
        toast.success('商品更新成功');
      } else {
        await containerService.addItem(id, itemForm);
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
  const getStatusBadge = (status: ContainerStatus) => {
    switch (status) {
      case ContainerStatus.PENDING: return <SemanticBadge tone="neutral">待装柜</SemanticBadge>;
      case ContainerStatus.LOADING: return <SemanticBadge tone="warning">装柜中</SemanticBadge>;
      case ContainerStatus.SHIPPED: return <SemanticBadge tone="progress">已发运</SemanticBadge>;
      case ContainerStatus.ARRIVED: return <SemanticBadge tone="success">已到达</SemanticBadge>;
      default: return <SemanticBadge tone="secondary">{status}</SemanticBadge>;
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">加载中...</div>;
  }

  if (!container) {
    return <div className="text-center py-10">货柜不存在</div>;
  }

  // 计算容量利用率
  const volumeUsed = container.volume || 0;
  const weightUsed = container.grossWeight || 0;
  const volumePercent = Math.min((volumeUsed / CONTAINER_40HQ.maxVolume) * 100, 100);
  const weightPercent = Math.min((weightUsed / CONTAINER_40HQ.maxWeight) * 100, 100);

  return (
    <div className="space-y-6 pb-10">
      {/* 页头 */}
      <PageHeader
        title={container.containerNo}
        description={`目的港: ${container.port?.name || '-'} | 预计到达: ${container.estimatedArrival ? format(new Date(container.estimatedArrival), 'yyyy-MM-dd') : '-'}`}
        actions={getStatusBadge(container.status)}
      />

      {/* 容量可视化卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="h-5 w-5 text-chart-4" />
              体积利用率
            </CardTitle>
            <CardDescription>
              40HQ 建议装载体积: {CONTAINER_40HQ.maxVolume} CBM（厂家建议）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>已用: {volumeUsed.toFixed(2)} CBM</span>
                <span>剩余: {(CONTAINER_40HQ.maxVolume - volumeUsed).toFixed(2)} CBM</span>
              </div>
              <Progress 
                value={volumePercent} 
                className={`h-4 ${volumePercent > 90 ? '[&>div]:bg-destructive' : volumePercent > 70 ? '[&>div]:bg-chart-4' : '[&>div]:bg-chart-3'}`}
              />
              <div className="text-right text-sm font-medium">
                {volumePercent.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Weight className="h-5 w-5 text-chart-5" />
              载重利用率
            </CardTitle>
            <CardDescription>
              40HQ 建议最大毛重: {CONTAINER_40HQ.maxWeight.toLocaleString()} kg（厂家建议）
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>已用: {weightUsed.toLocaleString()} kg</span>
                <span>剩余: {(CONTAINER_40HQ.maxWeight - weightUsed).toLocaleString()} kg</span>
              </div>
              <Progress 
                value={weightPercent} 
                className={`h-4 ${weightPercent > 90 ? '[&>div]:bg-destructive' : weightPercent > 70 ? '[&>div]:bg-chart-4' : '[&>div]:bg-chart-3'}`}
              />
              <div className="text-right text-sm font-medium">
                {weightPercent.toFixed(1)}%
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 汇总信息 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{container.totalBoxes || 0}</div>
            <p className="text-xs text-muted-foreground">总箱数</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{(container.grossWeight || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">毛重 (kg)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{(container.netWeight || 0).toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">净重 (kg)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{(container.volume || 0).toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">体积 (CBM)</p>
          </CardContent>
        </Card>
      </div>

      {/* 装箱明细列表 */}
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
                <TableHead>门店</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">箱数</TableHead>
                <TableHead className="text-right">毛重(kg)</TableHead>
                <TableHead className="text-right">净重(kg)</TableHead>
                <TableHead className="text-right">体积(CBM)</TableHead>
                <TableHead className="w-[100px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!container.items?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                    暂无装箱商品，点击"添加商品"开始装柜
                  </TableCell>
                </TableRow>
              ) : (
                container.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.product?.customsName}
                      {item.product?.specification && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({item.product.specification})
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{item.store?.name || '-'}</TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right">{item.boxes || '-'}</TableCell>
                    <TableCell className="text-right">{item.grossWeight || '-'}</TableCell>
                    <TableCell className="text-right">{item.netWeight || '-'}</TableCell>
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
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
                      {p.customsName} {p.specification ? `(${p.specification})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">所属门店</label>
              <Select 
                value={itemForm.storeId} 
                onValueChange={(v) =>
                  setItemForm((prev) => ({
                    ...prev,
                    // Radix Select.Item 不允许空字符串，使用 NONE 作为未指定门店哨兵值
                    storeId: v === '__NONE__' ? '' : v,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择门店（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__NONE__">不指定门店</SelectItem>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
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
