/**
 * Input: 商品名称、门店名称
 * Output: 匹配的出口合同列表
 * Pos: 工作台小工具，快速查询商品位置
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Search, Package, MapPin, Ship, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/axios';

interface TrackResult {
  salesContractId: string;
  contractNo: string;       // EXP编号
  portName: string;         // 目的港
  status: string;           // 状态
  eta?: string;             // 预计到达
  storeName: string;        // 门店
  productName: string;      // 商品
  quantity: number;         // 数量
}

/**
 * 职责：商品追踪组件
 * 思路：
 *   1. 用户输入商品名称（必填）
 *   2. 可选输入门店名称
 *   3. 搜索匹配的出口合同
 *   4. 显示结果列表，点击可跳转
 */
export function ProductTracker() {
  const router = useRouter();
  const [productKeyword, setProductKeyword] = useState('');
  const [storeKeyword, setStoreKeyword] = useState('');
  const [results, setResults] = useState<TrackResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!productKeyword.trim()) {
      toast.error('请输入商品名称');
      return;
    }

    setLoading(true);
    setSearched(true);
    try {
      const response = await api.get('/dashboard/track-product', {
        params: {
          product: productKeyword.trim(),
          store: storeKeyword.trim() || undefined,
        },
      });
      setResults((response as any).data || []);
    } catch (error) {
      console.error('查询失败:', error);
      toast.error('查询失败，请稍后重试');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; tone: React.ComponentProps<typeof SemanticBadge>["tone"] }> = {
      DRAFT: { label: '草稿', tone: 'neutral' },
      CONFIRMED: { label: '已确认', tone: 'info' },
      PACKING: { label: '装箱中', tone: 'warning' },
      SHIPPED: { label: '已发运', tone: 'progress' },
      ARRIVED: { label: '已到达', tone: 'success' },
      COMPLETED: { label: '已完成', tone: 'secondary' },
      CANCELLED: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5 text-primary" />
          商品追踪
        </CardTitle>
        <CardDescription>
          输入商品名称和门店，快速查找对应的货柜信息
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 搜索区域 */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="商品名称（如：不锈钢门）*"
              value={productKeyword}
              onChange={(e) => setProductKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <div className="relative flex-1">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="门店名称（可选）"
              value={storeKeyword}
              onChange={(e) => setStoreKeyword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleSearch} disabled={loading} className="shrink-0">
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                查询
              </>
            )}
          </Button>
        </div>

        {/* 结果区域 */}
        {searched && (
          <div className="space-y-2">
            {results.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                未找到匹配的货柜记录
              </div>
            ) : (
              <>
                <div className="text-sm text-muted-foreground">
                  找到 {results.length} 条记录
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {results.map((item, index) => (
                    <div
                      key={`${item.salesContractId}-${index}`}
                      className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/dashboard/sales/${item.salesContractId}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Ship className="h-5 w-5 text-primary shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-medium">{item.contractNo}</span>
                            {getStatusBadge(item.status)}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {item.productName} → {item.storeName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            目的港: {item.portName}
                            {item.eta && ` | 预计到达: ${item.eta}`}
                          </div>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
