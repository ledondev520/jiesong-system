/**
 * Input: 商品服务API、URL初始关键词/低库存/资料不全参数、独立商品编辑/保存会话
 * Output: 商品管理页面，失败保留草稿、旧保存不干扰新会话或当前筛选；卡片不含删除（删除在详情页危险区），显示可用库存，未维护的重量/体积显示「未维护」
 * Pos: 资料模块页面；库存已拆到 /dashboard/inventory
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import {
  BusinessWrite,
  useBusinessReadOnly,
} from "@/lib/hooks/useBusinessReadOnly";
import {
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useRef,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Product } from "@/types";
import { productService } from "@/services/product.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Search, Package, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMeasure } from "./measure";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/data-state";
import { ProductDialog } from "./components/ProductDialog";
import { PageHeader } from "@/components/layout/PageHeader";
import { MobileListCard } from "@/components/mobile";
import { PageSizeSelect } from "@/components/ui/page-size-select";
import { toast } from "sonner";
import { runAwait } from "@/lib/run-await";
import { useTableSort } from "@/lib/hooks/useTableSort";

/**
 * 职责：将输入值延迟一段时间后再稳定输出，避免高频副作用触发。
 * 思路：
 * 1. 每次 value 变化时启动新的定时器；
 * 2. 在 cleanup 中清理上一次定时器，确保只保留最后一次输入；
 * 3. 定时到期后更新防抖值。
 * @param value 需要进行防抖处理的输入值
 * @param delay 防抖延迟时间（毫秒）
 * @returns 延迟稳定后的值
 */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // 1. 启动延迟更新
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 2. 清理上一次定时器
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

/** 仅含空白的 HS 编码视为未填写 */
const hasHsCode = (hsCode?: string | null) => Boolean(hsCode?.trim());

/** 资料不全：毛重、体积、HS 编码缺失或为 0（与后端 incomplete 筛选口径一致） */
function missingFields(product: Product): string[] {
  const missing: string[] = [];
  if (!product.grossWeight) missing.push("毛重");
  if (!product.volume) missing.push("体积");
  if (!hasHsCode(product.hsCode)) missing.push("HS编码");
  return missing;
}

// 默认每页条数（由 PageSizeSelect 组件控制）
const DEFAULT_PAGE_SIZE = 20;

function ProductsPageContent() {
  const readOnly = useBusinessReadOnly();
  const searchParams = useSearchParams();
  const router = useRouter();
  const oldInventoryTab = searchParams.get("tab") === "inventory";
  // 库存已迁到 /dashboard/inventory：旧书签 /dashboard/products?tab=inventory 仍可打开并转过去
  useEffect(() => {
    if (oldInventoryTab) router.replace("/dashboard/inventory");
  }, [oldInventoryTab, router]);
  const initialKeyword = searchParams.get("keyword") || "";
  const lowStockParam = searchParams.get("lowStock") === "true";
  const incompleteParam = searchParams.get("incomplete") === "true";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [keyword, setKeyword] = useState(initialKeyword);
  const debouncedKeyword = useDebouncedValue(keyword, 350);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [lowStock, setLowStock] = useState(lowStockParam);
  const [incomplete, setIncomplete] = useState(incompleteParam);
  const latestRequest = useRef(0);
  const dialogSession = useRef(0);
  const [reloadVersion, setReloadVersion] = useState(0);
  const resetPendingRef = useRef(false);

  /** 拉取商品列表；状态只在请求回调中更新，可直接在 effect 中调用 */
  const fetchProducts = useCallback(() => {
    const request = ++latestRequest.current;
    return runAwait(
      () =>
        productService.getAll({
          page: currentPage,
          pageSize,
          keyword: debouncedKeyword || undefined,
          lite: true,
          ...(lowStock ? { lowStock: true } : {}),
          ...(incomplete ? { incomplete: true } : {}),
        }),
      (response) => {
        if (request !== latestRequest.current) return;
        setProducts(response.data?.items || []);
        setTotal(
          response.data?.pagination?.total ?? response.data?.items?.length ?? 0,
        );
      },
      () => {
        if (request !== latestRequest.current) return;
        if (!resetPendingRef.current) setLoadError(true);
        toast.error("加载商品失败");
      },
      () => {
        if (request === latestRequest.current && !resetPendingRef.current)
          setLoading(false);
      },
    );
  }, [currentPage, pageSize, debouncedKeyword, lowStock, incomplete]);

  /** 手动重试 / 保存后重新加载：先进入加载态再拉取 */
  const loadProducts = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    return fetchProducts();
  }, [fetchProducts]);

  // 以下均为渲染期按输入变化调整状态（替代 effect 内 setState）：
  // URL 关键词 / 低库存参数变化时同步到本地筛选
  const [prevInitialKeyword, setPrevInitialKeyword] = useState(initialKeyword);
  if (prevInitialKeyword !== initialKeyword) {
    setPrevInitialKeyword(initialKeyword);
    setKeyword(initialKeyword);
  }
  const [prevLowStockParam, setPrevLowStockParam] = useState(lowStockParam);
  if (prevLowStockParam !== lowStockParam) {
    setPrevLowStockParam(lowStockParam);
    setLowStock(lowStockParam);
  }
  // 防抖关键词 / 低库存筛选变化时回到第 1 页
  const filterKey = JSON.stringify([debouncedKeyword, lowStock, incomplete]);
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setCurrentPage(1);
  }
  // 查询条件或重载信号变化时进入加载态，请求仍在下方 effect 中发起
  const productsQueryKey = JSON.stringify([
    currentPage,
    pageSize,
    debouncedKeyword,
    lowStock,
    incomplete,
    reloadVersion,
  ]);
  const [prevProductsQueryKey, setPrevProductsQueryKey] =
    useState(productsQueryKey);
  if (prevProductsQueryKey !== productsQueryKey) {
    setPrevProductsQueryKey(productsQueryKey);
    setLoading(true);
    setLoadError(false);
  }

  // 加载态已在渲染期重置；原实现在 passive effect 中才重置。为保持原语义：从提交（layout effect）到 passive effect
  // 发起新请求之间到达的旧响应，不写入加载/错误态（原实现中这些写入会被随后 effect 的重置覆盖）。
  useLayoutEffect(() => {
    resetPendingRef.current = true;
  }, [fetchProducts, reloadVersion]);
  useEffect(() => {
    resetPendingRef.current = false;
    void fetchProducts();
  }, [fetchProducts, reloadVersion]);

  const handleCreate = () => {
    dialogSession.current += 1;
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleEdit = (product: Product) => {
    dialogSession.current += 1;
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) dialogSession.current += 1;
    setIsDialogOpen(nextOpen);
  };

  const handleSubmit = async (data: Record<string, unknown>) => {
    const session = dialogSession.current;
    try {
      if (editingProduct) {
        await productService.update(editingProduct.id, data);
        toast.success("商品更新成功");
      } else {
        await productService.create(data);
        toast.success("商品创建成功");
      }
      if (session === dialogSession.current) handleDialogOpenChange(false);
      // Refresh from the latest render, not the filters captured before the save.
      setReloadVersion((version) => version + 1);
    } catch (error) {
      toast.error(editingProduct ? "更新失败" : "创建失败");
      // The dialog must distinguish a failed save from a successful cancellation.
      throw error;
    }
  };

  /**
   * 职责：从商品行取出报关名与数值型计量字段供表格排序
   */
  const productAccessor = useCallback((item: Product, key: string) => {
    switch (key) {
      case "customsName":
        return item.customsName;
      case "grossWeight":
        return item.grossWeight ?? null;
      case "netWeight":
        return item.netWeight ?? null;
      case "volume":
        return item.volume ?? null;
      case "specification":
        return item.specification ?? "";
      case "unit":
        return item.unit ?? "";
      default:
        return null;
    }
  }, []);

  const productSort = useTableSort(products, productAccessor);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pagedProducts = productSort.sortedData;

  return (
    <div className="space-y-6">
      <PageHeader title="商品管理" />

      <div className="flex flex-wrap gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索商品..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="h-10 rounded-xl border-border/70 bg-background/70 pl-9"
          />
        </div>
        {keyword && (
          <Button
            variant="ghost"
            size="sm"
            className="h-10 rounded-xl"
            onClick={() => {
              setKeyword("");
              setCurrentPage(1);
            }}
          >
            <X className="h-4 w-4 mr-1" />
            重置
          </Button>
        )}
        <BusinessWrite>
          <Button onClick={handleCreate} className="h-10 rounded-xl">
            <Plus className="mr-2 h-4 w-4" /> 新增商品
          </Button>
        </BusinessWrite>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant={lowStock ? "default" : "outline"}
          onClick={() => setLowStock((value) => !value)}
          aria-pressed={lowStock}
        >
          低库存
        </Button>
        <Button
          variant={incomplete ? "default" : "outline"}
          onClick={() => setIncomplete((value) => !value)}
          aria-pressed={incomplete}
        >
          资料待补全
        </Button>
      </div>
      {incomplete && (
        <p className="text-sm text-muted-foreground">
          毛重、体积或 HS 编码缺失的商品，补全后才能排柜和报关。
        </p>
      )}
      {lowStock && (
        <p className="text-sm text-muted-foreground">
          按已入库可用数量与商品阈值核对，包含零库存商品。
        </p>
      )}
      {loadError && (
        <ErrorState
          title="商品列表加载失败"
          description="请检查网络后重试。"
          action={
            <Button variant="outline" onClick={() => void loadProducts()}>
              重试
            </Button>
          }
        />
      )}
      {/* 移动端卡片列表 */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
            加载中...
          </div>
        ) : loadError ? null : products.length === 0 ? (
          <div className="surface-panel py-10 text-center text-sm text-muted-foreground">
            {lowStock
              ? "没有低库存商品"
              : incomplete
                ? "没有资料不全的商品"
                : keyword
                  ? "没有匹配的商品"
                  : "暂无商品，点击右上角新增"}
          </div>
        ) : (
          pagedProducts.map((product) => (
            <MobileListCard
              key={product.id}
              title={product.customsName}
              badge={
                product.isActive === false ? (
                  <Badge variant="secondary">已停用</Badge>
                ) : undefined
              }
              subtitle={
                [product.specification, product.unit]
                  .filter(Boolean)
                  .join(" · ") || "-"
              }
              fields={[
                {
                  label: lowStock ? "可用库存 / 阈值" : "可用库存",
                  value: lowStock
                    ? `${product.availableStock ?? 0} / ${product.lowStockThreshold ?? 0}`
                    : String(product.availableStock ?? 0),
                },
                ...(incomplete
                  ? [
                      {
                        label: "缺少资料",
                        value: missingFields(product).join("、") || "-",
                      },
                    ]
                  : []),
                { label: "包装规格", value: product.packingSpec || "-" },
                {
                  label: "毛重",
                  value: formatMeasure(product.grossWeight, "kg"),
                },
                {
                  label: "净重",
                  value: formatMeasure(product.netWeight, "kg"),
                },
                {
                  label: "体积",
                  value: formatMeasure(product.volume, "CBM"),
                },
              ]}
              action={
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 flex-1 rounded-xl"
                    onClick={() =>
                      router.push(`/dashboard/products/${product.id}`)
                    }
                  >
                    详情
                  </Button>
                  <BusinessWrite>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 flex-1 rounded-xl"
                      onClick={() => handleEdit(product)}
                    >
                      <Pencil className="mr-1 h-4 w-4" /> 编辑
                    </Button>
                  </BusinessWrite>
                </div>
              }
            />
          ))
        )}
      </div>

      {/* 桌面端表格 */}
      <div className="surface-panel hidden overflow-hidden md:block">
        {/* 桌面端卡片视图 */}
        <div className="hidden md:block">
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              加载中...
            </div>
          ) : loadError ? null : products.length === 0 ? (
            <EmptyState
              icon={<Package className="h-8 w-8" />}
              title={
                lowStock
                  ? "没有低库存商品"
                  : incomplete
                    ? "没有资料不全的商品"
                    : "暂无商品"
              }
              description={
                lowStock
                  ? "已启用预警阈值的商品均有足够可用库存。"
                  : incomplete
                    ? "所有商品的毛重、体积和 HS 编码都已填写。"
                    : "还没有添加任何商品，点击下方的按钮开始创建"
              }
              action={
                readOnly
                  ? undefined
                  : { label: "新增商品", onClick: handleCreate }
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              {pagedProducts.map((product) => (
                <Card
                  key={product.id}
                  className="cursor-pointer border-border/40 border-l-[3px] border-l-status-green/70 bg-card/60 transition-all duration-300 hover:border-primary/20 hover:bg-card hover:shadow-md hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/10"
                  onClick={() =>
                    router.push(`/dashboard/products/${product.id}`)
                  }
                >
                  <CardContent className="space-y-3 p-4">
                    {/* 名称 + 分类 */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {product.customsName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {product.specification || "—"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {product.isActive === false && (
                          <Badge variant="secondary" className="text-xs">
                            已停用
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-xs">
                          {product.unit || "件"}
                        </Badge>
                      </div>
                    </div>

                    {incomplete && (
                      <p className="text-sm text-status-amber">
                        缺少：{missingFields(product).join("、") || "-"}
                      </p>
                    )}
                    <p
                      className={cn(
                        "text-sm",
                        lowStock ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      可用库存 {product.availableStock ?? 0}
                      {lowStock && (
                        <> / 阈值 {product.lowStockThreshold ?? 0}</>
                      )}
                    </p>
                    {/* 规格信息 */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-xs text-muted-foreground">
                          毛重
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                          {formatMeasure(product.grossWeight, "kg")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-xs text-muted-foreground">
                          净重
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                          {formatMeasure(product.netWeight, "kg")}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/40 p-2">
                        <p className="text-xs text-muted-foreground">
                          体积
                        </p>
                        <p className="text-sm font-bold tabular-nums">
                          {formatMeasure(product.volume, "CBM")}
                        </p>
                      </div>
                    </div>

                    {/* 包装 + HS */}
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="shrink-0">包装:</span>
                        <span className="text-foreground">
                          {product.packingSpec || "—"}
                        </span>
                      </div>
                      {hasHsCode(product.hsCode) && (
                        <div className="flex items-center gap-1.5">
                          <span className="shrink-0">HS编码:</span>
                          <span className="font-mono text-foreground">
                            {product.hsCode}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* 操作 */}
                    <div className="flex gap-2 pt-1 border-t border-border/30">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 rounded-lg text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/dashboard/products/${product.id}`);
                        }}
                      >
                        详情
                      </Button>
                      <BusinessWrite>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 flex-1 rounded-lg text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEdit(product);
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" /> 编辑
                        </Button>
                      </BusinessWrite>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 分页控制 */}
      <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          共 {total} 条
          {totalPages > 1 ? `，第 ${currentPage}/${totalPages} 页` : ""}
        </span>
        <div className="flex items-center gap-2">
          <PageSizeSelect
            value={pageSize}
            onChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages || totalPages <= 1}
          >
            下一页
          </Button>
        </div>
      </div>

      <ProductDialog
        open={isDialogOpen}
        onOpenChange={handleDialogOpenChange}
        product={editingProduct}
        onSubmit={handleSubmit}
      />
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="py-12 text-center text-muted-foreground">加载中...</div>
      }
    >
      <ProductsPageContent />
    </Suspense>
  );
}
