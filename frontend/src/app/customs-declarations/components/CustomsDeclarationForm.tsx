/**
 * Input: 真实报关单、出口合同与商品目录
 * Output: 按数据库契约提交表头和商品明细，保留明细ID及来源关联
 * Pos: 报关单创建/编辑共享表单，目录加载失败可重试
 */
"use client";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CustomsDeclaration, Product } from "@/types";
import { CustomsDeclarationStatus } from "@/types";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { salesService } from "@/services/sales.service";
import { productService } from "@/services/product.service";
import { loadPaginatedCatalog } from "@/services/paginatedCatalog";
import type { CustomsDeclarationUpsertInput } from "@/services/customsDeclaration.service";
import { customsDeclarationStatusOptions } from "./CustomsDeclarationStatusBadge";
import { toast } from "sonner";

const numberText = z
  .string()
  .refine(
    (v) => v.trim() !== "" && Number.isFinite(Number(v)) && Number(v) >= 0,
    "请输入有效非负数字",
  );
const itemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1, "请选择商品"),
  customsName: z.string().trim().min(1, "请输入申报品名"),
  hsCode: z.string(),
  quantity: numberText.refine((v) => Number(v) > 0, "数量必须大于零"),
  unit: z.string(),
  unitPrice: z
    .string()
    .refine(
      (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
      "单价无效",
    ),
  totalPrice: z
    .string()
    .refine(
      (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) >= 0),
      "金额无效",
    ),
  packingItemId: z.string().nullable().optional(),
  taxRateId: z.string().nullable().optional(),
  itemNo: z.number().nullable().optional(),
  declarationElements: z.string(),
});
const schema = z.object({
  declarationNo: z.string().trim().min(1, "请输入报关单号"),
  salesContractId: z.string().min(1, "请选择出口合同"),
  status: z.string(),
  declaredAt: z.string(),
  exportDate: z.string(),
  customsBroker: z.string(),
  currency: z.string().trim().min(1, "请输入币种"),
  exchangeRate: z
    .string()
    .refine(
      (v) => v === "" || (Number.isFinite(Number(v)) && Number(v) > 0),
      "汇率必须大于零",
    ),
  totalAmount: numberText,
  totalQuantity: numberText,
  totalNetWeight: numberText,
  totalGrossWeight: numberText,
  note: z.string(),
  items: z.array(itemSchema).min(1, "至少填写一条商品明细"),
});
type Values = z.infer<typeof schema>;
const text = (v: unknown) => (v == null ? "" : String(v));
const emptyItem = {
  productId: "",
  customsName: "",
  hsCode: "",
  quantity: "1",
  unit: "",
  unitPrice: "",
  totalPrice: "",
  declarationElements: "",
};
export const declarationDefaults = (d?: CustomsDeclaration | null): Values => ({
  declarationNo: d?.declarationNo || "",
  salesContractId: d?.salesContractId || "",
  status: d?.status || "DRAFT",
  declaredAt: d?.declaredAt?.slice(0, 10) || "",
  exportDate: d?.exportDate?.slice(0, 10) || "",
  customsBroker: d?.customsBroker || "",
  currency: d?.currency || "USD",
  exchangeRate: text(d?.exchangeRate),
  totalAmount: text(d?.totalAmount ?? 0),
  totalQuantity: text(d?.totalQuantity ?? 0),
  totalNetWeight: text(d?.totalNetWeight ?? 0),
  totalGrossWeight: text(d?.totalGrossWeight ?? 0),
  note: d?.note || "",
  items: d?.items?.length
    ? d.items.map((i) => ({
        ...emptyItem,
        id: i.id,
        productId: i.productId || "",
        customsName: i.customsName || "",
        hsCode: i.hsCode || "",
        quantity: text(i.quantity),
        unit: i.unit || "",
        unitPrice: text(i.unitPrice),
        totalPrice: text(i.totalPrice),
        packingItemId: i.packingItemId,
        taxRateId: i.taxRateId,
        itemNo: i.itemNo,
        declarationElements: i.declarationElements || "",
      }))
    : [{ ...emptyItem }],
});
export const declarationPayload = (
  v: Values,
): CustomsDeclarationUpsertInput => ({
  ...v,
  status: v.status as CustomsDeclarationStatus,
  declaredAt: v.declaredAt || null,
  exportDate: v.exportDate || null,
  exchangeRate: v.exchangeRate === "" ? null : Number(v.exchangeRate),
  totalAmount: Number(v.totalAmount),
  totalQuantity: Number(v.totalQuantity),
  totalNetWeight: Number(v.totalNetWeight),
  totalGrossWeight: Number(v.totalGrossWeight),
  items: v.items.map((i, index) => ({
    ...i,
    itemNo: i.itemNo ?? index + 1,
    quantity: Number(i.quantity),
    unitPrice: i.unitPrice === "" ? null : Number(i.unitPrice),
    totalPrice: i.totalPrice === "" ? null : Number(i.totalPrice),
  })),
});
const headers = [
  ["declarationNo", "报关单号"],
  ["customsBroker", "报关行"],
  ["declaredAt", "申报日期", "date"],
  ["exportDate", "出口日期", "date"],
  ["currency", "成交币种"],
  ["exchangeRate", "汇率", "number"],
  ["totalAmount", "货值总额", "number"],
  ["totalQuantity", "申报总数量", "number"],
  ["totalGrossWeight", "毛重（kg）", "number"],
  ["totalNetWeight", "净重（kg）", "number"],
  ["note", "备注"],
] as const;
const itemInputs = [
  ["customsName", "申报品名"],
  ["hsCode", "HS 编码"],
  ["quantity", "数量"],
  ["unit", "单位"],
  ["unitPrice", "单价"],
  ["totalPrice", "金额"],
  ["declarationElements", "申报要素"],
] as const;
export function CustomsDeclarationForm({
  declaration,
  submitLabel,
  onSubmit,
}: {
  declaration?: CustomsDeclaration | null;
  submitLabel: string;
  onSubmit: (payload: CustomsDeclarationUpsertInput) => Promise<void>;
}) {
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: declarationDefaults(declaration),
  });
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });
  const [contracts, setContracts] = useState<
    { id: string; contractNo: string }[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    form.reset(declarationDefaults(declaration));
  }, [declaration, form]);
  useEffect(() => {
    let live = true;
    Promise.all([
      loadPaginatedCatalog((page) =>
        salesService.getAll({ page, pageSize: 100, lite: true }),
      ),
      loadPaginatedCatalog((page) =>
        productService.getAll({ page, pageSize: 100, lite: true }),
      ),
    ])
      .then(([sales, goods]) => {
        if (live) {
          setContracts(sales);
          setProducts(goods);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [reload]);
  const submit = async (v: Values) => {
    try {
      await onSubmit(declarationPayload(v));
    } catch {
      toast.error("保存失败，请检查数据后重试");
    }
  };
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>基础信息</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            {failed && (
              <div role="alert" className="md:col-span-2">
                合同或商品目录加载失败{" "}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setLoading(true);
                    setFailed(false);
                    setReload((v) => v + 1);
                  }}
                >
                  重试
                </Button>
              </div>
            )}
            <FormField
              control={form.control}
              name="salesContractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>出口合同</FormLabel>
                  <Select
                    disabled={loading}
                    value={field.value}
                    onValueChange={field.onChange}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue
                          placeholder={loading ? "加载中…" : "选择出口合同"}
                        />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contracts.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.contractNo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>状态</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {customsDeclarationStatusOptions
                        .filter((o) =>
                          [
                            "DRAFT",
                            "DECLARED",
                            "RELEASED",
                            "VOID",
                            declaration?.status,
                          ].includes(o.value),
                        )
                        .map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            {headers.map(([name, label, type]) => (
              <FormField
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{label}</FormLabel>
                    <FormControl>
                      {name === "note" ? (
                        <Textarea {...field} />
                      ) : (
                        <Input
                          type={type || "text"}
                          step={type === "number" ? "any" : undefined}
                          {...field}
                        />
                      )}
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>商品明细</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.map((row, index) => (
              <div
                key={row.id}
                className="grid gap-4 rounded-md border p-4 md:grid-cols-3"
              >
                <FormField
                  control={form.control}
                  name={`items.${index}.productId`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>商品档案</FormLabel>
                      <Select
                        disabled={loading}
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);
                          const p = products.find((p) => p.id === value);
                          if (p) {
                            form.setValue(
                              `items.${index}.customsName`,
                              p.customsName,
                            );
                            form.setValue(
                              `items.${index}.hsCode`,
                              p.hsCode || "",
                            );
                            form.setValue(`items.${index}.unit`, p.unit || "");
                          }
                        }}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
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
                  )}
                />
                {itemInputs.map(([key, label]) => (
                  <FormField
                    key={key}
                    control={form.control}
                    name={`items.${index}.${key}`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{label}</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={fields.length === 1}
                  onClick={() => remove(index)}
                >
                  删除第 {index + 1} 行
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => append({ ...emptyItem })}
            >
              添加商品明细
            </Button>
          </CardContent>
        </Card>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="submit"
            disabled={form.formState.isSubmitting || loading || failed}
          >
            {form.formState.isSubmitting ? "保存中…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
