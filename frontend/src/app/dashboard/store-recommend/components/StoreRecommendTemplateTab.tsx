'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/data-state';
import type {
  StoreTemplate,
  UniversalTemplate,
} from '@/services/procurementTemplate.service';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  DollarSign,
  Layers,
  Package,
  Store,
  TrendingUp,
} from 'lucide-react';
import {
  CategoryCard,
  categoryIcons,
  downloadMustHaveCSV,
  PriorityBadge,
  priorityConfig,
  sharedIcons,
} from './storeRecommendShared';

interface StoreRecommendTemplateTabProps {
  storeList: string[];
  universalTemplate: UniversalTemplate | null;
  storeTemplate: StoreTemplate | null;
  selectedStore: string;
  loadingTemplate: boolean;
  loadingStoreData: boolean;
  onStoreSelect: (value: string) => void | Promise<void>;
}

export function StoreRecommendTemplateTab({
  storeList,
  universalTemplate,
  storeTemplate,
  selectedStore,
  loadingTemplate,
  loadingStoreData,
  onStoreSelect,
}: StoreRecommendTemplateTabProps) {
  const isUniversal = selectedStore === '__universal__';

  if (loadingTemplate) {
    return <LoadingState title="加载中..." description="正在汇总开业采购模板与门店采购清单。" />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 pb-4 pt-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Store className="h-4 w-4 text-primary" />
            查看模式：
          </div>
          <Select value={selectedStore} onValueChange={onStoreSelect}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="选择门店" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__universal__">通用开业模板（所有门店汇总）</SelectItem>
              {storeList.map((storeName) => (
                <SelectItem key={storeName} value={storeName}>
                  <span className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3" />
                    {storeName}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!isUniversal ? (
            <Badge variant="outline" className="text-xs">
              显示该店历史实际采购
            </Badge>
          ) : null}
        </CardContent>
      </Card>

      {loadingStoreData ? (
        <LoadingState
          title="加载中..."
          description="正在拉取指定门店的历史采购明细。"
          className="min-h-[8rem]"
        />
      ) : null}

      {isUniversal ? (
        universalTemplate ? (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Store className="h-4 w-4" />
                    参考门店
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{universalTemplate.totalStores}</div>
                  <p className="text-xs text-muted-foreground">家门店的真实数据</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Package className="h-4 w-4" />
                    物品种类
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{universalTemplate.totalProducts}</div>
                  <p className="text-xs text-muted-foreground">种采购物品</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-red-500" />
                    必备物品
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-red-600">{universalTemplate.mustHaveCount}</div>
                  <p className="text-xs text-muted-foreground">以{universalTemplate.templateStore}为基准必购</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4" />
                    品类数量
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{Object.keys(universalTemplate.byCategory).length}</div>
                  <p className="text-xs text-muted-foreground">个物品大类</p>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(universalTemplate.byCategory).map(([category, items]) => (
                <CategoryCard key={category} category={category} items={items} />
              ))}
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-red-500" />
                      必备采购清单
                    </CardTitle>
                    <CardDescription className="mt-1">
                      以{universalTemplate.templateStore}门店为基准，这些物品每家新店开业都应采购
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={() => downloadMustHaveCSV(universalTemplate.items, universalTemplate.templateStore)}
                  >
                    <sharedIcons.Download className="h-3.5 w-3.5" />
                    下载清单
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>物品名称</TableHead>
                      <TableHead>品类</TableHead>
                      <TableHead className="text-center">出现门店</TableHead>
                      <TableHead className="text-right">建议采购量</TableHead>
                      <TableHead>参考厂家</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {universalTemplate.items
                      .filter((item) => item.priority === '强烈建议')
                      .map((item) => (
                        <TableRow key={item.name} className="bg-red-50/30 dark:bg-red-950/10">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-red-500" />
                              <div>
                                <div>{item.name}</div>
                                {item.supplement ? (
                                  <div className="text-xs text-muted-foreground">{item.supplement}</div>
                                ) : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-sm">{item.storeCount}家</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {item.avgQtyPerStore != null ? `约 ${item.avgQtyPerStore} ${item.unit !== '—' ? item.unit : ''}` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.manufacturers.length > 0 ? item.manufacturers.join('、') : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  完整采购清单
                </CardTitle>
                <CardDescription>
                  所有 {universalTemplate.totalProducts} 种物品，按优先级排序 · 数量为各门店均值
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>物品名称</TableHead>
                      <TableHead>品类</TableHead>
                      <TableHead>优先级</TableHead>
                      <TableHead className="text-center">出现门店</TableHead>
                      <TableHead className="text-right">均值采购量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {universalTemplate.items.map((item) => (
                      <TableRow key={item.name} className={priorityConfig[item.priority as keyof typeof priorityConfig]?.row || ''}>
                        <TableCell className="font-medium">
                          <div>
                            <div>{item.name}</div>
                            {item.supplement ? <div className="text-xs text-muted-foreground">{item.supplement}</div> : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {item.category}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <PriorityBadge priority={item.priority} />
                        </TableCell>
                        <TableCell className="text-center text-sm">{item.storeCount}</TableCell>
                        <TableCell className="text-right text-sm">
                          {item.avgQtyPerStore != null ? `约 ${item.avgQtyPerStore} ${item.unit !== '—' ? item.unit : ''}` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <EmptyState title="暂无模板数据" description="当前没有可用的通用开业采购模板。" />
        )
      ) : storeTemplate ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Store className="h-4 w-4" />
                  {storeTemplate.storeName}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{storeTemplate.totalProducts}</div>
                <p className="text-xs text-muted-foreground">种采购物品</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                  历史采购总额
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">¥{storeTemplate.totalAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">人民币</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Layers className="h-4 w-4" />
                  涉及品类
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{Object.keys(storeTemplate.byCategory).length}</div>
                <p className="text-xs text-muted-foreground">个大类</p>
              </CardContent>
            </Card>
          </div>

          {Object.entries(storeTemplate.byCategory).map(([category, items]) => {
            const Icon = categoryIcons[category] || sharedIcons.Package;

            return (
              <Card key={category}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-4 w-4 text-primary" />
                    {category}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {items.length}种
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>物品名称</TableHead>
                        <TableHead>补充说明</TableHead>
                        <TableHead className="text-right">采购数量</TableHead>
                        <TableHead>单位</TableHead>
                        <TableHead>规格</TableHead>
                        <TableHead>厂家</TableHead>
                        <TableHead className="text-right">采购金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => (
                        <TableRow key={item.name}>
                          <TableCell className="font-medium">{item.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.supplement || '—'}</TableCell>
                          <TableCell className="text-right text-sm">{item.totalQty > 0 ? item.totalQty : '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.unit || '—'}</TableCell>
                          <TableCell className="max-w-28 truncate text-xs text-muted-foreground">{item.spec || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.manufacturer || '—'}</TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {item.totalAmount > 0 ? `¥${item.totalAmount.toLocaleString()}` : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </>
      ) : (
        <EmptyState title="暂无门店采购数据" description="当前门店还没有可展示的历史采购明细。" />
      )}
    </div>
  );
}
