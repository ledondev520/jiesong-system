/**
 * Input: an optional saved DRAFT quote, the customer list (+ that customer's stores), the signed-in role
 * Output: header (customer, 贸易术语, 现汇, 有效期, 装货港, 付款条件) + the J18 商品 × 门店 grid (ProductPicker, Excel paste, live
 *         rule-price preview). Saves via POST/PUT /quotes. The server prices every line (priceFor); the editor only sends
 *         cost, quantity, store and an optional manual price. 保存并标记已发送 saves first, then transitions.
 * Pos: quote create page and DRAFT detail. Shares lib/order-lines.ts, ProductPicker and PasteRowsDialog with components/orders.
 * Owner decisions 2026-10-31: conversion sets the order FX to spot − 0.2 (server side); a manual unit price is any value >= 0
 *   (no comparison with the rule price). Cost may be empty in a draft (缺成本 → price 0 until filled or overridden).
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ClipboardPaste, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PasteRowsDialog } from "@/components/orders/PasteRowsDialog";
import { ProductPicker } from "@/components/orders/ProductPicker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import { describeFailure } from "@/lib/error-reason";
import { formatMoney } from "@/lib/format";
import {
  emptyLine,
  effectivePrice,
  isManualPrice,
  lineTotal,
  orderTotal,
  storeSubtotals,
  type OrderLine,
} from "@/lib/order-lines";
import {
  linesFromItems,
  parseSpotRate,
  toItemsPayload,
  validateLines,
} from "@/lib/quote";
import { customerService, INCOTERM_OPTIONS } from "@/services/customer.service";
import { pricingPreviewService } from "@/services/pricing-preview.service";
import { quoteService, type Quote } from "@/services/quote.service";
import type { Customer, Store } from "@/types";

interface Props {
  quote?: Quote;
  onSaved: (quote: Quote, options: { markSent: boolean }) => void;
}

export function QuoteEditor({ quote, onSaved }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [customerId, setCustomerId] = useState(quote?.customerId ?? "");
  const [incoterm, setIncoterm] = useState(quote?.incoterm ?? "FOB");
  const [lines, setLines] = useState<OrderLine[]>(() =>
    quote?.items?.length ? linesFromItems(quote.items) : [emptyLine()],
  );
  const [spotRate, setSpotRate] = useState(
    quote?.spotRate ? String(quote.spotRate) : "",
  );
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTerms ?? "");
  const [portOfLoading, setPortOfLoading] = useState(
    quote?.portOfLoading ?? "",
  );
  const [validUntil, setValidUntil] = useState(
    quote?.validUntil?.slice(0, 10) ?? "",
  );
  const [note, setNote] = useState(quote?.note ?? "");
  const [pasting, setPasting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const previewTicket = useRef(0);

  const loadStores = useCallback((id: string) => {
    customerService
      .getStores(id)
      .then((response) => setStores(response.data.items))
      .catch((reason) => setLoadError(describeFailure("加载门店失败", reason)));
  }, []);

  // 换客户：带出客户默认条款，并清空已选门店（门店属于客户）
  const chooseCustomer = useCallback(
    (customer: Customer) => {
      setCustomerId(customer.id);
      setIncoterm(customer.defaultIncoterm || "FOB");
      setPaymentTerms(customer.defaultPaymentTerms ?? "");
      setPortOfLoading(customer.defaultPortOfLoading ?? "");
      setLines((current) => current.map((line) => ({ ...line, storeId: "" })));
      loadStores(customer.id);
    },
    [loadStores],
  );

  useEffect(() => {
    customerService
      .getAll({ pageSize: 100 })
      .then((response) => {
        const items = response.data.items;
        setCustomers(items);
        if (quote?.customerId) loadStores(quote.customerId);
        else if (items.length === 1) chooseCustomer(items[0]); // 只有一个启用客户（Seapot）时默认选中
      })
      .catch((reason) => setLoadError(describeFailure("加载客户失败", reason)));
    // 只在挂载时按所属报价初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 实时规则价：成本/商品/现汇变化后 350ms 请求服务端；迟到的旧响应丢弃
  const previewKey = useMemo(
    () =>
      JSON.stringify([
        spotRate,
        lines.map((line) => [line.key, line.productId, line.costCny]),
      ]),
    [spotRate, lines],
  );
  useEffect(() => {
    const priced = lines.filter(
      (line) => line.productId && Number(line.costCny) > 0,
    );
    if (priced.length === 0) return;
    const ticket = ++previewTicket.current;
    const timer = setTimeout(async () => {
      try {
        const spot = Number(spotRate);
        const response = await pricingPreviewService.preview(
          priced.map((line) => ({
            productId: line.productId,
            costCny: Number(line.costCny),
          })),
          Number.isFinite(spot) && spot > 0 ? spot : undefined,
        );
        if (ticket !== previewTicket.current) return;
        const byKey = new Map(
          priced.map((line, index) => [line.key, response.data.results[index]]),
        );
        setLines((current) =>
          current.map((line) =>
            byKey.has(line.key)
              ? {
                  ...line,
                  suggested: byKey.get(line.key)?.unitPriceUsd ?? null,
                }
              : line,
          ),
        );
      } catch {
        // 预览失败时保留旧规则价；保存后以服务端计算为准
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- previewKey 已覆盖 lines/spotRate 的相关变化
  }, [previewKey]);

  const patchLine = (key: string, patch: Partial<OrderLine>) =>
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );

  const save = async (markSent: boolean) => {
    const rateInput = parseSpotRate(spotRate);
    if (rateInput === "invalid") return toast.error("现汇必须为正数");
    const problem = validateLines(lines);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      // 空文本 → null 清除可空字段；items 整体替换。
      const body = {
        ...(customerId ? { customerId } : {}),
        incoterm,
        spotRate: rateInput,
        paymentTerms: paymentTerms.trim() || null,
        portOfLoading: portOfLoading.trim() || null,
        validUntil: validUntil || null,
        note: note.trim() || null,
        items: toItemsPayload(lines),
      };
      const response = quote
        ? await quoteService.update(quote.id, body)
        : await quoteService.create(body);
      onSaved(response.data, { markSent });
    } catch (error) {
      toast.error(describeFailure("保存报价失败", error));
    } finally {
      setSaving(false);
    }
  };

  const total = orderTotal(lines);
  const subtotals = storeSubtotals(lines);
  const storeName = (id: string) =>
    stores.find((store) => store.id === id)?.name ?? id;

  return (
    <div className="space-y-5">
      {loadError ? (
        <p role="alert" className="text-sm text-destructive">
          {loadError}
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">报价条款</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="quote-customer">客户</Label>
            <select
              id="quote-customer"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={customerId}
              onChange={(event) => {
                const customer = customers.find(
                  (item) => item.id === event.target.value,
                );
                if (customer) chooseCustomer(customer);
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
            <Label htmlFor="quote-incoterm">贸易术语</Label>
            <select
              id="quote-incoterm"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={incoterm}
              onChange={(event) => setIncoterm(event.target.value)}
            >
              {INCOTERM_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-spot">现汇（留空用报价规则现汇）</Label>
            <Input
              id="quote-spot"
              inputMode="decimal"
              value={spotRate}
              onChange={(e) => setSpotRate(e.target.value)}
              placeholder="如 6.72"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-valid">报价有效期</Label>
            <Input
              id="quote-valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-port">装货港</Label>
            <Input
              id="quote-port"
              value={portOfLoading}
              onChange={(e) => setPortOfLoading(e.target.value)}
              placeholder="如 Shanghai"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quote-terms">付款条件</Label>
            <Input
              id="quote-terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Label htmlFor="quote-note">备注</Label>
            <Input
              id="quote-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
              disabled={!customerId}
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
          {lines.map((line, index) => (
            <div
              key={line.key}
              className="grid items-end gap-2 rounded-lg border p-3 md:grid-cols-[2fr_1.4fr_0.8fr_1fr_1fr_auto]"
              data-testid={`quote-line-${index}`}
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
                <Label className="text-xs">门店</Label>
                <select
                  aria-label={`第 ${index + 1} 行门店`}
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={line.storeId}
                  onChange={(event) =>
                    patchLine(line.key, { storeId: event.target.value })
                  }
                >
                  <option value="">
                    {customerId ? "选择门店" : "先选客户"}
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
                <Label className="flex items-center gap-1 text-xs">
                  参考成本 ¥{" "}
                  {line.costCny.trim() === "" ? (
                    <SemanticBadge tone="warning">缺成本</SemanticBadge>
                  ) : null}
                </Label>
                <Input
                  aria-label={`第 ${index + 1} 行参考成本`}
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
                  {formatMoney(
                    effectivePrice(line) === null ? 0 : lineTotal(line),
                    "USD",
                  )}
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
              报价合计 {formatMoney(total, "USD")}
            </p>
            {[...subtotals].map(([storeId, amount]) => (
              <p key={storeId} className="text-muted-foreground">
                {storeName(storeId)}：{formatMoney(amount, "USD")}
              </p>
            ))}
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => void save(false)}
            >
              {quote ? "保存修改" : "保存草稿"}
            </Button>
            <Button disabled={saving} onClick={() => void save(true)}>
              保存并标记已发送
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
