/**
 * Input: an optional saved DRAFT quote, product/store lists, the signed-in role
 * Output: header + line editor; saves via POST/PUT /quotes. The server prices every line (priceFor); the editor only sends
 *         cost, quantity, store and an optional manual price. 保存并标记已发送 saves first, then transitions.
 * Pos: quote create page and DRAFT detail. Self-contained row editor — swap for the J18 order grid once work/J18 is rebased in.
 * PROVISIONAL (owner questions open): the order keeps the quote's spot rate on conversion; manual prices are not gated
 *   against the rule price; the PI prints only the company name (no bank details).
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { productService } from "@/services/product.service";
import { storeService } from "@/services/store.service";
import { quoteService, type Quote } from "@/services/quote.service";
import { linesFromItems, parseSpotRate, toItemsPayload, validateLines, formatUsd, type QuoteLineDraft } from "@/lib/quote";
import type { Product, Store } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SemanticBadge } from "@/components/ui/semantic-badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StoreSelect } from "@/app/dashboard/sales/create/components/StoreSelect";

let lineSeq = 0;
const blankLine = (): QuoteLineDraft => ({ key: `new-${++lineSeq}`, productId: "", storeId: "", quantity: "", costCny: "", manualPrice: "" });

interface Props {
  quote?: Quote;
  onSaved: (quote: Quote, options: { markSent: boolean }) => void;
}

export function QuoteEditor({ quote, onSaved }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [lines, setLines] = useState<QuoteLineDraft[]>(() => (quote?.items?.length ? linesFromItems(quote.items) : [blankLine()]));
  const [spotRate, setSpotRate] = useState(quote?.spotRate ? String(quote.spotRate) : "");
  const [paymentTerms, setPaymentTerms] = useState(quote?.paymentTerms ?? "");
  const [portOfLoading, setPortOfLoading] = useState(quote?.portOfLoading ?? "");
  const [validUntil, setValidUntil] = useState(quote?.validUntil?.slice(0, 10) ?? "");
  const [note, setNote] = useState(quote?.note ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let current = true;
    Promise.all([productService.getAll({ pageSize: 100, lite: true }), storeService.getAll({ pageSize: 100, lite: true })])
      .then(([productsRes, storesRes]) => {
        if (!current) return;
        setProducts(productsRes?.data?.items ?? []);
        setStores(storesRes?.data?.items ?? []);
      })
      .catch(() => current && toast.error("加载商品和门店失败"));
    return () => { current = false; };
  }, []);

  const patchLine = (key: string, patch: Partial<QuoteLineDraft>) =>
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const save = async (markSent: boolean) => {
    const rateInput = parseSpotRate(spotRate);
    if (rateInput === "invalid") return toast.error("现汇必须为正数");
    const problem = validateLines(lines);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      // 空文本 → null 清除可空字段；items 整体替换。
      const body = {
        spotRate: rateInput,
        paymentTerms: paymentTerms.trim() || null,
        portOfLoading: portOfLoading.trim() || null,
        validUntil: validUntil || null,
        note: note.trim() || null,
        items: toItemsPayload(lines),
      };
      const response = quote ? await quoteService.update(quote.id, body) : await quoteService.create(body);
      onSaved(response.data, { markSent });
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : "保存报价失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="surface-panel">
        <CardHeader><CardTitle className="text-base">报价信息</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="quote-spot">现汇（留空用系统配置）</Label>
            <Input id="quote-spot" inputMode="decimal" value={spotRate} onChange={(e) => setSpotRate(e.target.value)} placeholder="如 6.72" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-valid">报价有效期</Label>
            <Input id="quote-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-port">装货港（FOB）</Label>
            <Input id="quote-port" value={portOfLoading} onChange={(e) => setPortOfLoading(e.target.value)} placeholder="如 Shanghai" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="quote-terms">付款条件</Label>
            <Input id="quote-terms" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
          </div>
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-4">
            <Label htmlFor="quote-note">备注</Label>
            <Input id="quote-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="surface-panel">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">商品 × 门店</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((rows) => [...rows, blankLine()])}>
            <Plus className="mr-1 h-4 w-4" />添加一行
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">商品</TableHead>
                <TableHead className="min-w-[180px]">门店</TableHead>
                <TableHead className="w-24">数量</TableHead>
                <TableHead className="w-32">参考成本 ¥/单位</TableHead>
                <TableHead className="w-32">手动单价 USD</TableHead>
                <TableHead className="min-w-[130px] text-right">规则价 / 单价</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, index) => (
                <TableRow key={line.key} data-testid={`quote-line-${index}`}>
                  <TableCell>
                    <Select value={line.productId} onValueChange={(value) => {
                      const product = products.find((p) => p.id === value);
                      patchLine(line.key, { productId: value, unit: product?.unit });
                    }}>
                      <SelectTrigger aria-label={`第${index + 1}行商品`}><SelectValue placeholder="选择商品" /></SelectTrigger>
                      <SelectContent className="max-h-[280px]">
                        {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.customsName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <StoreSelect
                      stores={stores}
                      value={line.storeId}
                      onChange={(value) => patchLine(line.key, { storeId: value })}
                      onCreated={(store) => setStores((current) => [...current.filter((s) => s.id !== store.id), store])}
                    />
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`第${index + 1}行数量`} inputMode="decimal" value={line.quantity} onChange={(e) => patchLine(line.key, { quantity: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`第${index + 1}行成本`} inputMode="decimal" value={line.costCny} onChange={(e) => patchLine(line.key, { costCny: e.target.value })} />
                  </TableCell>
                  <TableCell>
                    <Input aria-label={`第${index + 1}行手动单价`} inputMode="decimal" value={line.manualPrice} onChange={(e) => patchLine(line.key, { manualPrice: e.target.value })} placeholder="留空按规则" />
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {line.serverUnitPrice === undefined ? (
                      <span className="text-muted-foreground">保存后显示</span>
                    ) : (
                      <div className="space-y-1">
                        <div>{line.formulaPrice === null || line.formulaPrice === undefined ? <SemanticBadge tone="warning">缺成本</SemanticBadge> : formatUsd(line.formulaPrice)}</div>
                        <div className="font-medium">{formatUsd(line.serverUnitPrice)} {line.manualPrice && <SemanticBadge tone="info">手动价</SemanticBadge>}</div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" aria-label={`删除第${index + 1}行`} disabled={lines.length === 1}
                      onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="outline" disabled={saving} onClick={() => save(false)}>{quote ? "保存修改" : "保存草稿"}</Button>
        <Button disabled={saving} onClick={() => save(true)}>保存并标记已发送</Button>
      </div>
    </div>
  );
}
