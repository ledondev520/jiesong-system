/**
 * Input: productId, currentPrice, supplierId（可选）
 * Output: 单价红绿灯组件——与历史成交价对比并展示涨跌幅
 * Pos: 采购单品表单内的智能比价组件，依赖 GET /products/:id/price-history
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

interface PriceHistoryItem {
  id: string;
  price: number;
  supplierId: string | null;
  recordedAt: string;
  supplier?: { id: string; name: string; shortName?: string } | null;
}

interface PriceGuardProps {
  /** 商品 ID */
  productId: string;
  /** 当前填入的单价 */
  currentPrice: number;
  /** 当前选中的供应商 ID（用于优先比较同一供应商历史价） */
  supplierId?: string;
}

/**
 * 职责：从价格历史接口拉取数据，计算涨跌幅并渲染红绿灯徽章
 * 思路：
 *   1. productId / supplierId 变化时拉取近5条价格历史
 *   2. 优先使用同一供应商的最近一次成交价作为基准
 *   3. 若同供应商无记录，降级为全库最近一次成交价
 *   4. 比较 currentPrice vs 基准价，输出 🟢/🟡/🔴 徽章
 */
export function PriceGuard({ productId, currentPrice, supplierId }: PriceGuardProps) {
  const [basePrice, setBasePrice] = useState<number | null>(null);
  const [baseSupplierName, setBaseSupplierName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setBasePrice(null);
      return;
    }

    let cancelled = false;
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await api.get<ApiResponse<PriceHistoryItem[]>, ApiResponse<PriceHistoryItem[]>>(
          `/products/${productId}/price-history?limit=10`
        );
        if (cancelled) return;

        const history = res.data ?? [];
        if (history.length === 0) {
          setBasePrice(null);
          setBaseSupplierName(null);
          return;
        }

        // 1. 优先取同供应商最近一条
        const sameSupplier = supplierId
          ? history.find((h) => h.supplierId === supplierId)
          : null;

        if (sameSupplier) {
          setBasePrice(sameSupplier.price);
          setBaseSupplierName(sameSupplier.supplier?.shortName ?? sameSupplier.supplier?.name ?? null);
        } else {
          // 2. 降级：全库最近一条
          setBasePrice(history[0].price);
          setBaseSupplierName(history[0].supplier?.shortName ?? history[0].supplier?.name ?? null);
        }
      } catch {
        // 静默失败：比价失败不阻断采购录入
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchHistory();
    return () => { cancelled = true; };
  }, [productId, supplierId]);

  // 当前价格无效或未输入时不展示
  if (!productId || currentPrice <= 0 || loading) return null;

  // 首次采购（无历史）
  if (basePrice === null) {
    return (
      <Badge variant="outline" className="text-xs gap-1 text-muted-foreground border-muted">
        <Minus className="h-3 w-3" />
        首次采购，无历史价可对比
      </Badge>
    );
  }

  const diffPct = ((currentPrice - basePrice) / basePrice) * 100;
  const isRise = diffPct > 0.5;  // 涨价超0.5%才算涨
  const isDrop = diffPct < -0.5;

  if (isRise) {
    return (
      <Badge variant="destructive" className="text-xs gap-1">
        <TrendingUp className="h-3 w-3" />
        涨价 +{diffPct.toFixed(1)}%
        {baseSupplierName && <span className="opacity-70">（vs {baseSupplierName} ¥{basePrice}）</span>}
      </Badge>
    );
  }

  if (isDrop) {
    return (
      <Badge className="text-xs gap-1 bg-green-600 hover:bg-green-600">
        <TrendingDown className="h-3 w-3" />
        价格优异 {diffPct.toFixed(1)}%
        {baseSupplierName && <span className="opacity-70">（vs {baseSupplierName} ¥{basePrice}）</span>}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className="text-xs gap-1">
      <Minus className="h-3 w-3" />
      持平 ¥{basePrice}
      {baseSupplierName && <span className="opacity-70">（{baseSupplierName}）</span>}
    </Badge>
  );
}
