/**
 * Input: 系统配置 API 的 companyName / companyAddress / companyPhone / companyTaxId / companyBankInfo（唯一的卖方信息，报价/PI、催票开票抬头读同一组键），
 *        以及 /system/seller-identity（旧「我方开票抬头信息」文本只作为别名补全尚为空的字段）
 * Output: 设置 > 公司信息：卖方公司名称、地址、电话、纳税人识别号和银行资料的编辑表单；来自旧抬头的值预填并提示，保存后写入公司信息
 * Pos: 系统设置（仅 ADMIN，随设置布局）；没有任何默认的真实公司/银行数据，未填写的行报价/PI 上留空
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/data-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { describeFailure } from "@/lib/error-reason";
import { configService, type SellerIdentity } from "@/services/config.service";

export const COMPANY_KEYS = [
  "companyName",
  "companyTaxId",
  "companyAddress",
  "companyPhone",
  "companyBankInfo",
] as const;
type CompanyKey = (typeof COMPANY_KEYS)[number];
type CompanyForm = Record<CompanyKey, string>;

const EMPTY: CompanyForm = {
  companyName: "",
  companyTaxId: "",
  companyAddress: "",
  companyPhone: "",
  companyBankInfo: "",
};

const IDENTITY_FIELD: Record<CompanyKey, keyof Omit<SellerIdentity, "legacyFilled" | "invoiceTitleText">> = {
  companyName: "name",
  companyTaxId: "taxId",
  companyAddress: "address",
  companyPhone: "phone",
  companyBankInfo: "bank",
};

/** 只发送改动过的键；清空 = 发送空串（后端把它存为空，打印端不印该行） */
export function changedCompanyValues(
  saved: CompanyForm,
  draft: CompanyForm,
): Partial<CompanyForm> {
  const changes: Partial<CompanyForm> = {};
  for (const key of COMPANY_KEYS) {
    if (draft[key].trim() !== saved[key].trim()) changes[key] = draft[key];
  }
  return changes;
}

export default function CompanySettingsPage() {
  const [saved, setSaved] = useState<CompanyForm>(EMPTY);
  const [draft, setDraft] = useState<CompanyForm>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [legacyFilled, setLegacyFilled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await configService.getSystemConfig();
      const next = { ...EMPTY };
      for (const key of COMPANY_KEYS) {
        const value = response.data?.[key];
        if (typeof value === "string") next[key] = value;
      }
      // 旧开票抬头里还没迁到新字段的内容：预填到草稿（不算已保存），保存后才写入公司信息
      const effective = { ...next };
      let filled: string[] = [];
      try {
        const identity = (await configService.getSellerIdentity()).data;
        for (const key of COMPANY_KEYS) {
          const value = identity?.[IDENTITY_FIELD[key]];
          if (!next[key] && typeof value === "string") effective[key] = value;
        }
        filled = identity?.legacyFilled ?? [];
      } catch {
        // 别名读取失败时只显示已保存的值
      }
      setSaved(next);
      setDraft(effective);
      setLegacyFilled(filled);
      setLoadError(null);
    } catch (reason) {
      setLoadError(reason ?? new Error("加载失败"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const changes = changedCompanyValues(saved, draft);
  const dirty = Object.keys(changes).length > 0;

  const save = async () => {
    if (!draft.companyName.trim() && draft.companyName !== saved.companyName) {
      // 清空公司名称是允许的，但提示一次，避免误清导致报价单抬头为空
      if (
        !window.confirm(
          "公司名称将被清空，报价单/PI 的卖方抬头会留空。确定吗？",
        )
      )
        return;
    }
    setError(null);
    setSaving(true);
    try {
      await configService.updateSystemConfig(changes);
      toast.success("公司信息已保存");
      await load();
    } catch (reason) {
      setError(describeFailure("保存失败", reason));
    } finally {
      setSaving(false);
    }
  };

  if (loadError)
    return (
      <ErrorState
        what="加载公司信息失败"
        error={loadError}
        onRetry={() => void load()}
      />
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title="公司信息"
        description="唯一的卖方信息：报价单/PI 的卖方块和采购催票的开票抬头都读取这里；未填写的行不会打印"
        showBack={false}
      />
      {legacyFilled.length > 0 ? (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          部分内容来自旧的「我方开票抬头信息」，已带入下方表单；点击「保存」后写入公司信息，之后旧文本不再使用。
        </p>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">卖方公司</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="company-name">公司名称</Label>
            <Input
              id="company-name"
              disabled={loading}
              maxLength={200}
              value={draft.companyName}
              onChange={(e) =>
                setDraft({ ...draft, companyName: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-tax-id">纳税人识别号</Label>
            <Input
              id="company-tax-id"
              disabled={loading}
              maxLength={50}
              value={draft.companyTaxId}
              onChange={(e) =>
                setDraft({ ...draft, companyTaxId: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-phone">公司电话</Label>
            <Input
              id="company-phone"
              disabled={loading}
              maxLength={50}
              value={draft.companyPhone}
              onChange={(e) =>
                setDraft({ ...draft, companyPhone: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="company-address">公司地址</Label>
            <Textarea
              id="company-address"
              disabled={loading}
              rows={3}
              maxLength={500}
              value={draft.companyAddress}
              onChange={(e) =>
                setDraft({ ...draft, companyAddress: e.target.value })
              }
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">收款银行（受限信息）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="company-bank">银行资料（每行一项）</Label>
          <Textarea
            id="company-bank"
            disabled={loading}
            rows={7}
            maxLength={1000}
            value={draft.companyBankInfo}
            placeholder={
              "开户银行：\n账户名称：\n银行账号：\nSWIFT：\n银行地址："
            }
            onChange={(e) =>
              setDraft({ ...draft, companyBankInfo: e.target.value })
            }
          />
          <p className="text-xs text-muted-foreground">
            仅管理员和财务可在系统中读取；审计日志只记录修改时间和操作人，不记录内容。打印报价单/PI
            时会按原样逐行印出。
          </p>
        </CardContent>
      </Card>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          onClick={() => void save()}
          disabled={!dirty || saving || loading}
        >
          {saving ? "保存中..." : "保存"}
        </Button>
        <Button
          variant="outline"
          onClick={() => setDraft(saved)}
          disabled={!dirty || saving}
        >
          还原
        </Button>
      </div>
    </div>
  );
}
