/**
 * Input: 采购表单、商品目录、价格历史
 * Output: 步骤 1：AI 智能录入与采购明细
 * Pos: 采购合同创建入口（CreatePurchasePageContent 拆分）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useRouter } from "next/navigation";
import { type UseFormReturn, type UseFieldArrayReturn } from "react-hook-form";
import { Product } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Wand2, Plus, Trash, Package, ArrowRight } from "lucide-react";
import type {
  PriceHistoryWithSuppliers,
  SupplierPriceSummary,
} from "@/services/priceComparison";
import { PriceGuard } from "@/components/purchase/PriceGuard";
import { SupplierPriceComparePopover } from "@/components/purchase/SupplierPriceComparison";
import { PriceSummary, type PurchaseFormValues } from "./purchaseFormParts";

export function PurchaseItemsStep({
  form,
  router,
  fields,
  append,
  remove,
  products,
  parseText,
  setParseText,
  isParsing,
  handleParse,
  setShowBatchSelector,
  priceHistoryMap,
  supplierRows,
  pickSupplier,
  watchItems,
  watchSupplierId,
  watchTaxRate,
  totalAmount,
  goToStep2,
}: {
  form: UseFormReturn<PurchaseFormValues>;
  router: ReturnType<typeof useRouter>;
  fields: UseFieldArrayReturn<PurchaseFormValues, "items">["fields"];
  append: UseFieldArrayReturn<PurchaseFormValues, "items">["append"];
  remove: UseFieldArrayReturn<PurchaseFormValues, "items">["remove"];
  products: Product[];
  parseText: string;
  setParseText: (value: string) => void;
  isParsing: boolean;
  handleParse: () => unknown;
  setShowBatchSelector: (open: boolean) => void;
  priceHistoryMap: Record<string, PriceHistoryWithSuppliers>;
  supplierRows: (
    item: { productId?: string } | undefined,
  ) => SupplierPriceSummary[];
  pickSupplier: (index: number, row: SupplierPriceSummary) => void;
  watchItems: PurchaseFormValues["items"];
  watchSupplierId: PurchaseFormValues["supplierId"];
  watchTaxRate: number;
  totalAmount: number;
  goToStep2: () => unknown;
}) {
  return (
    <>
      {/* AI 智能录入 */}
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Wand2 className="h-4 w-4 text-primary" />
            AI 智能录入
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="purchase-ai-quote-input">采购报价原文</Label>
            <Textarea
              id="purchase-ai-quote-input"
              name="quoteText"
              placeholder="粘贴供应商报价信息 (如：'订购100平方米瓷砖，单价45元，供应商佛山陶瓷...')"
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              className="min-h-[100px] rounded-md"
            />
          </div>
          <Button
            type="button"
            onClick={handleParse}
            disabled={isParsing || !parseText}
            variant="default"
            className="h-9 rounded-md text-xs shadow-sm"
          >
            {isParsing ? "解析中..." : "解析报价"}
          </Button>
        </CardContent>
      </Card>

      {/* 采购明细 */}
      <Card className="overflow-hidden rounded-xl border-border/40 shadow-[0_1px_3px_rgba(0,0,0,0.05)] md:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Package className="h-4 w-4" />
              采购明细
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              先选择商品，系统会推荐供应商
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-md text-xs"
              onClick={() => setShowBatchSelector(true)}
            >
              <Plus className="mr-1 h-3.5 w-3.5" />
              批量添加
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 价格汇总 */}
          <PriceSummary subtotal={totalAmount} taxRate={watchTaxRate} />

          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 rounded-lg border border-border/40 bg-card p-4 md:grid-cols-12 md:items-end"
            >
              <div className="md:col-span-4">
                <FormField
                  control={form.control}
                  name={`items.${index}.productId`}
                  render={({ field }) => {
                    return (
                      <FormItem>
                        <FormLabel className="text-xs">
                          商品 <span className="text-destructive">*</span>
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="h-9 rounded-md text-xs">
                              <SelectValue placeholder="选择商品" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.customsName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    );
                  }}
                />
              </div>
              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.quantity`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        数量 <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-9 rounded-md text-xs"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.unit`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">单位</FormLabel>
                      <FormControl>
                        <Input
                          className="h-9 rounded-md text-xs"
                          {...field}
                          placeholder="件/箱/平米"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-2">
                <FormField
                  control={form.control}
                  name={`items.${index}.unitPrice`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">
                        单价 (¥) <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-9 rounded-md text-xs"
                          {...field}
                          onChange={(e) =>
                            field.onChange(parseFloat(e.target.value) || 0)
                          }
                        />
                      </FormControl>
                      <FormMessage />
                      {/* 智能比价红绿灯：与历史成交价对比 */}
                      {watchItems[index]?.productId && (
                        <PriceGuard
                          productId={watchItems[index].productId}
                          currentPrice={watchItems[index]?.unitPrice || 0}
                          supplierId={form.watch("supplierId")}
                        />
                      )}
                      {/* 供应商比价：「用此供应商」同时填入供应商与不含税单价 */}
                      {watchItems[index]?.productId && (
                        <SupplierPriceComparePopover
                          rows={supplierRows(watchItems[index])}
                          currentSupplierId={watchSupplierId}
                          onPick={(row) => pickSupplier(index, row)}
                        />
                      )}
                    </FormItem>
                  )}
                />
              </div>
              <div className="md:col-span-1 text-right">
                <p className="text-[11px] text-muted-foreground">小计</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-emerald-600">
                  ¥
                  {(
                    (watchItems[index]?.quantity || 0) *
                    (watchItems[index]?.unitPrice || 0)
                  ).toLocaleString()}
                </p>
              </div>
              <div className="md:col-span-1 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-md"
                  onClick={() => remove(index)}
                  disabled={fields.length <= 1}
                >
                  <Trash className="h-4 w-4 text-destructive" />
                </Button>
              </div>

              {/* 价格历史对比与预警备注 */}
              {(() => {
                const item = watchItems[index];
                const history = item?.productId
                  ? priceHistoryMap[item.productId]
                  : null;
                const showHistory = history && history.count > 0;
                const isHighPrice =
                  showHistory &&
                  history.averagePrice !== null &&
                  item.unitPrice > history.averagePrice * 1.1;
                if (!showHistory) return null;
                return (
                  <div className="md:col-span-12">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        历史采购（不含税）：均价 ¥{history.averagePrice} / 最低
                        ¥{history.minPrice} / 最高 ¥{history.maxPrice}
                        （共 {history.count} 笔）
                      </span>
                    </div>
                    {isHighPrice && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs font-medium text-destructive">
                          当前价格高于历史均价{" "}
                          {(
                            ((item.unitPrice - history.averagePrice!) /
                              history.averagePrice!) *
                            100
                          ).toFixed(1)}
                          %，请说明原因
                        </p>
                        <FormField
                          control={form.control}
                          name={`items.${index}.priceNote`}
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="请填写价格偏高原因（必填）"
                                  className="h-8 rounded-md border-destructive text-xs focus-visible:ring-destructive"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-md text-xs"
            onClick={() =>
              append({
                productId: "",
                quantity: 0,
                unitPrice: 0,
                unit: "",
                note: "",
                priceNote: "",
              })
            }
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> 添加商品
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3 md:col-span-2">
        <Button
          type="button"
          variant="outline"
          className="h-10 rounded-md text-sm"
          onClick={() => router.back()}
        >
          取消
        </Button>
        <Button
          type="button"
          className="h-10 rounded-md text-sm"
          onClick={goToStep2}
        >
          下一步：合同信息
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </>
  );
}
