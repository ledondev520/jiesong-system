/**
 * Input: 客户（含默认条款）、该客户的门店、商品（服务端搜索）、服务端报价预览
 * Output: 新建出口订单：订单级表头（客户、USD、贸易术语、付款条件、装货港、现汇）+ 商品 × 门店明细网格
 * Pos: /dashboard/orders/new；单价只来自 POST /pricing/preview（整美元后取整到 5 的倍数），可人工覆盖并标记「手动价」
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { ProductPicker } from "@/components/orders/ProductPicker";
import { PasteRowsDialog } from "@/components/orders/PasteRowsDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { describeFailure } from "@/lib/error-reason";
import { formatMoney } from "@/lib/format";
import {
  buildCreationPayload,
  emptyLine,
  isManualPrice,
  lineTotal,
  orderTotal,
  pricingInputs,
  pricingPending,
  storeSubtotals,
  validateOrder,
  withCurrentPricing,
  type OrderHeader,
  type OrderLine,
} from "@/lib/order-lines";
import { customerService, INCOTERM_OPTIONS } from "@/services/customer.service";
import { pricingPreviewService } from "@/services/pricing-preview.service";
import { salesService } from "@/services/sales.service";
import type { Customer, Store } from "@/types";

const emptyHeader: OrderHeader = {
  customerId: "",
  incoterm: "FOB",
  paymentTerms: "",
  portOfLoading: "",
  exchangeRate: "",
};

export function OrderEditor() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [header, setHeader] = useState<OrderHeader>(emptyHeader);
  const [lines, setLines] = useState<OrderLine[]>([emptyLine()]);
  const [pasting, setPasting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const requestKey = useRef(crypto.randomUUID());
  const previewTicket = useRef(0);
  // 最近一次失败的报价预览对应的 previewKey；输入再变化会重新请求并清除
  const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);

  const applyCustomer = useCallback((customer: Customer) => {
    setHeader((current) => ({
      ...current,
      customerId: customer.id,
      incoterm: customer.defaultIncoterm || "FOB",
      paymentTerms: customer.defaultPaymentTerms ?? "",
      portOfLoading: customer.defaultPortOfLoading ?? "",
    }));
    setLines((current) => current.map((line) => ({ ...line, storeId: "" })));
    customerService
      .getStores(customer.id)
      .then((response) => setStores(response.data.items))
      .catch((reason) => setLoadError(describeFailure("加载门店失败", reason)));
  }, []);

  useEffect(() => {
    customerService
      .getAll({ pageSize: 100 })
      .then((response) => {
        setCustomers(response.data.items);
        if (response.data.items.length === 0)
          setLoadError(
            "暂无启用的客户，请先到「客户与门店」新增客户后再建订单",
          );
        // 只有一个启用客户（Seapot）时默认选中
        if (response.data.items.length === 1)
          applyCustomer(response.data.items[0]);
      })
      .catch((reason) => setLoadError(describeFailure("加载客户失败", reason)));
  }, [applyCustomer]);

  // 实时报价：成本/商品/现汇变化后 350ms 请求服务端；迟到的旧响应丢弃
  const previewKey = useMemo(
    () =>
      JSON.stringify([
        header.exchangeRate,
        lines.map((line) => [line.key, line.productId, line.costCny]),
        previewRetry,
      ]),
    [header.exchangeRate, lines, previewRetry],
  );
  useEffect(() => {
    const priced = lines.filter(
      (line) => line.productId && Number(line.costCny) > 0,
    );
    if (priced.length === 0) return;
    const ticket = ++previewTicket.current;
    const timer = setTimeout(async () => {
      try {
        const spot = Number(header.exchangeRate);
        const response = await pricingPreviewService.preview(
          priced.map((line) => ({
            productId: line.productId,
            costCny: Number(line.costCny),
          })),
          Number.isFinite(spot) && spot > 0 ? spot : undefined,
        );
        if (ticket !== previewTicket.current) return;
        // 记下这次报价用的输入：现汇为空时服务端用了规则现汇，表头随后会填成它
        const rate =
          header.exchangeRate.trim() || String(response.data.spotRate);
        const byKey = new Map(
          priced.map((line, index) => [
            line.key,
            {
              suggested: response.data.results[index]?.unitPriceUsd ?? null,
              suggestedFor: pricingInputs(line, rate),
            },
          ]),
        );
        setPreviewFailedFor(null);
        setLines((current) =>
          current.map((line) =>
            byKey.has(line.key) ? { ...line, ...byKey.get(line.key) } : line,
          ),
        );
        setHeader((current) =>
          current.exchangeRate
            ? current
            : { ...current, exchangeRate: String(response.data.spotRate) },
        );
      } catch {
        // 失败时旧建议价已因输入变化作废（withCurrentPricing）；提示并阻止提交，直到重新报价成功
        if (ticket === previewTicket.current) setPreviewFailedFor(previewKey);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewKey 已覆盖 lines/exchangeRate 的相关变化
  }, [previewKey]);

  const patchLine = (key: string, patch: Partial<OrderLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  // 只用按当前现汇/商品/成本算出的建议价；过期的视为待报价
  const pricedLines = withCurrentPricing(lines, header.exchangeRate);
  const pending = pricingPending(lines, header.exchangeRate);
  const previewFailed = previewFailedFor === previewKey;

  const submit = async () => {
    if (previewFailed)
      return setError("单价计算失败，请稍后重试，或为这些行填写人工单价");
    if (pending) return setError("正在按最新现汇和成本计算单价，请稍候再提交");
    const problem = validateOrder(header, pricedLines);
    if (problem) return setError(problem);
    setError(null);
    setSubmitting(true);
    try {
      const response = await salesService.createWithItems(
        buildCreationPayload(header, pricedLines),
        requestKey.current,
      );
      const id = response.data?.id;
      if (!id) throw new Error("创建订单失败：未返回订单ID");
      toast.success("订单已创建");
      router.push(`/dashboard/sales/${id}`);
    } catch (reason) {
      setError(describeFailure("创建失败", reason));
    } finally {
      setSubmitting(false);
    }
  };

  const total = orderTotal(pricedLines);
  const subtotals = storeSubtotals(pricedLines);
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      <PageHeader
        title="新建出口订单"
        description="先填订单条款，再按商品 × 门店录入明细；单价由报价规则实时给出"
        backHref="/dashboard/orders"
      />
      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">订单条款</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="order-customer">客户 *</Label>
            <select
              id="order-customer"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={header.customerId}
              onChange={(event) => {
                const customer = customers.find(
                  (item) => item.id === event.target.value,
                );
                if (customer) applyCustomer(customer);
              }}
            >
              <option value="">请选择</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>币种</Label>
            <Input aria-label="币种" value="USD" disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-incoterm">贸易术语</Label>
            <select
              id="order-incoterm"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={header.incoterm}
              onChange={(event) =>
                setHeader({ ...header, incoterm: event.target.value })
              }
            >
              {INCOTERM_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-payment">付款条件</Label>
            <Input
              id="order-payment"
              value={header.paymentTerms}
              onChange={(event) =>
                setHeader({ ...header, paymentTerms: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-port">装货港</Label>
            <Input
              id="order-port"
              value={header.portOfLoading}
              onChange={(event) =>
                setHeader({ ...header, portOfLoading: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="order-rate">现汇 (¥/$) *</Label>
            <Input
              id="order-rate"
              inputMode="decimal"
              value={header.exchangeRate}
              placeholder="默认取报价规则现汇"
              onChange={(event) =>
                setHeader({ ...header, exchangeRate: event.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">明细（商品 × 门店）</CardTitle>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!header.customerId}
              onClick={() => setPasting(true)}
            >
              <ClipboardPaste className="mr-1 h-4 w-4" /> 从 Excel 粘贴
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setLines((current) => [...current, emptyLine()])}
            >
              <Plus className="mr-1 h-4 w-4" /> 添加一行
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {pricedLines.map((line, index) => (
            <div
              key={line.key}
              className="grid items-end gap-2 rounded-lg border p-3 md:grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_auto]"
              data-testid="order-line"
            >
              <div className="space-y-1">
                <Label className="text-xs">商品 *</Label>
                <ProductPicker
                  ariaLabel={`第 ${index + 1} 行搜索商品`}
                  value={
                    line.productId
                      ? { id: line.productId, name: line.productName }
                      : null
                  }
                  onSelect={(product) =>
                    patchLine(line.key, {
                      productId: product.id,
                      productName: product.customsName,
                      unit: product.unit ?? "",
                      suggested: null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">门店 *</Label>
                <select
                  aria-label={`第 ${index + 1} 行门店`}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={line.storeId}
                  onChange={(event) =>
                    patchLine(line.key, { storeId: event.target.value })
                  }
                >
                  <option value="">
                    {header.customerId ? "选择门店" : "先选客户"}
                  </option>
                  {stores
                    .filter((store) => store.isActive)
                    .map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.code
                          ? `${store.code} · ${store.name}`
                          : store.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">数量 *</Label>
                <Input
                  aria-label={`第 ${index + 1} 行数量`}
                  inputMode="decimal"
                  className="h-9"
                  value={line.quantity}
                  onChange={(event) =>
                    patchLine(line.key, { quantity: event.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">采购成本 ¥ *</Label>
                <Input
                  aria-label={`第 ${index + 1} 行采购成本`}
                  inputMode="decimal"
                  className="h-9"
                  value={line.costCny}
                  onChange={(event) =>
                    patchLine(line.key, {
                      costCny: event.target.value,
                      suggested: null,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1 text-xs">
                  单价 ${" "}
                  {isManualPrice(line) ? (
                    <SemanticBadge tone="warning">手动价</SemanticBadge>
                  ) : null}
                </Label>
                <Input
                  aria-label={`第 ${index + 1} 行单价`}
                  inputMode="decimal"
                  className="h-9"
                  value={
                    isManualPrice(line)
                      ? line.manualPrice
                      : line.suggested === null
                        ? ""
                        : String(line.suggested)
                  }
                  placeholder={line.suggested === null ? "待报价" : undefined}
                  onChange={(event) =>
                    patchLine(line.key, {
                      manualPrice:
                        event.target.value === String(line.suggested ?? "")
                          ? ""
                          : event.target.value,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2 md:justify-end">
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatMoney(lineTotal(line), "USD")}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`删除第 ${index + 1} 行`}
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((item) => item.key !== line.key),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1 text-sm">
            <p className="font-semibold">
              订单合计 {formatMoney(total, "USD")}
            </p>
            {[...subtotals].map(([storeId, amount]) => (
              <p key={storeId} className="text-muted-foreground">
                {storeName(storeId)}：{formatMoney(amount, "USD")}
              </p>
            ))}
          </div>
          <div className="space-y-2 sm:text-right">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {previewFailed ? (
              <p className="text-sm text-destructive">
                单价计算失败，可重试或填写人工单价{" "}
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setPreviewRetry((count) => count + 1)}
                >
                  重试报价
                </Button>
              </p>
            ) : pending ? (
              <p role="status" className="text-sm text-muted-foreground">
                正在按最新现汇和成本计算单价…
              </p>
            ) : null}
            <Button
              onClick={() => void submit()}
              disabled={submitting}
              className="h-10 rounded-xl"
            >
              {submitting ? "创建中..." : "创建订单"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {pasting ? (
        <PasteRowsDialog
          stores={stores}
          onClose={() => setPasting(false)}
          onAdd={(added) =>
            setLines((current) => [
              ...current.filter(
                (line) => line.productId || line.quantity || line.costCny,
              ),
              ...added,
            ])
          }
        />
      ) : null}
    </div>
  );
}
