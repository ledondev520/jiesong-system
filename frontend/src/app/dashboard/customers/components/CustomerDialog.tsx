/**
 * Input: 可选的已有客户、保存回调
 * Output: 新增/编辑客户对话框（USD 固定，贸易术语从后端允许列表选择）
 * Pos: 客户与门店 > 客户表单；清空可空字段发送 null，未填写的必填项在本地拦截后才请求
 */
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  INCOTERM_OPTIONS,
  customerService,
  type CustomerInput,
} from "@/services/customer.service";
import { describeFailure } from "@/lib/error-reason";
import type { Customer } from "@/types";

const TEXT_FIELDS = [
  ["legalName", "买方公司全称（单据抬头）"],
  ["address", "地址"],
  ["contactName", "联系人"],
  ["contactPhone", "联系电话"],
  ["contactEmail", "联系邮箱"],
  ["defaultPaymentTerms", "默认付款条件"],
  ["defaultPortOfLoading", "默认装货港（文字）"],
] as const;

type FormState = Record<
  (typeof TEXT_FIELDS)[number][0] | "name" | "country" | "note",
  string
> & {
  defaultIncoterm: string;
};

const toForm = (customer?: Customer | null): FormState => ({
  name: customer?.name ?? "",
  country: customer?.country ?? "",
  note: customer?.note ?? "",
  defaultIncoterm: customer?.defaultIncoterm ?? "FOB",
  legalName: customer?.legalName ?? "",
  address: customer?.address ?? "",
  contactName: customer?.contactName ?? "",
  contactPhone: customer?.contactPhone ?? "",
  contactEmail: customer?.contactEmail ?? "",
  defaultPaymentTerms: customer?.defaultPaymentTerms ?? "",
  defaultPortOfLoading: customer?.defaultPortOfLoading ?? "",
});

/** 编辑时：清空的可空字段发 null；新增时空值不发送 */
export function buildCustomerPayload(
  form: FormState,
  existing?: Customer | null,
): CustomerInput {
  const payload: Record<string, string | null> = {
    name: form.name.trim(),
    defaultIncoterm: form.defaultIncoterm,
  };
  for (const key of [
    "country",
    "note",
    ...TEXT_FIELDS.map(([name]) => name),
  ] as const) {
    const value = form[key].trim();
    if (value) payload[key] = key === "country" ? value.toUpperCase() : value;
    else if (existing?.[key]) payload[key] = null;
  }
  return payload as CustomerInput;
}

interface CustomerDialogProps {
  customer?: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

export function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: CustomerDialogProps) {
  const [form, setForm] = useState<FormState>(() => toForm(customer));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof FormState, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const submit = async () => {
    if (!form.name.trim()) return setError("客户名称不能为空");
    if (form.country.trim() && !/^[A-Za-z]{2}$/.test(form.country.trim()))
      return setError("国家须为两位字母代码，如 US");
    if (
      form.contactEmail.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())
    )
      return setError("联系邮箱格式不正确");
    setError(null);
    setSubmitting(true);
    try {
      const payload = buildCustomerPayload(form, customer);
      const response = customer
        ? await customerService.update(customer.id, payload)
        : await customerService.create(payload);
      toast.success(customer ? "客户已更新" : "客户已创建");
      onSaved(response.data);
    } catch (reason) {
      setError(describeFailure("保存失败", reason));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{customer ? "编辑客户" : "新增客户"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-name">客户名称 *</Label>
            <Input
              id="customer-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          {TEXT_FIELDS.map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={`customer-${key}`}>{label}</Label>
              <Input
                id={`customer-${key}`}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <div className="space-y-2">
            <Label htmlFor="customer-country">国家（两位代码）</Label>
            <Input
              id="customer-country"
              maxLength={2}
              value={form.country}
              onChange={(e) => set("country", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customer-incoterm">默认贸易术语</Label>
            <select
              id="customer-incoterm"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.defaultIncoterm}
              onChange={(e) => set("defaultIncoterm", e.target.value)}
            >
              {INCOTERM_OPTIONS.map((term) => (
                <option key={term} value={term}>
                  {term}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>币种</Label>
            <Input value="USD" disabled aria-label="币种" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="customer-note">备注</Label>
            <Textarea
              id="customer-note"
              value={form.note}
              onChange={(e) => set("note", e.target.value)}
            />
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
