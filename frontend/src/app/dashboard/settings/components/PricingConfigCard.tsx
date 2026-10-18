"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/store/auth.store";
import {
  pricingService,
  type PricingConfig,
  type PricingSnapshot,
} from "@/services/pricing.service";

type NumericKey = Exclude<keyof PricingConfig, "mode">;
const fields: {
  key: NumericKey;
  label: string;
  scale: number;
  step: number;
}[] = [
  { key: "exchangeAdjustment", label: "汇率调整值", scale: 1, step: 0.01 },
  {
    key: "refundableMarkup",
    label: "有退税加价比例 (%)",
    scale: 100,
    step: 0.1,
  },
  { key: "noRefundMarkup", label: "零退税加价上限 (%)", scale: 100, step: 0.1 },
  { key: "multiplier", label: "乘数", scale: 1, step: 0.01 },
];

function AdminPricingConfigCard() {
  const [snapshot, setSnapshot] = useState<PricingSnapshot | null>(null);
  const [mode, setMode] = useState<PricingConfig["mode"]>("tiered");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    pricingService
      .get()
      .then((response) => {
        if (!active) return;
        if (response.code !== 200 || !response.data)
          throw new Error("报价配置加载失败");
        setSnapshot(response.data);
        setMode(response.data.config.mode);
        setValues(
          Object.fromEntries(
            fields.map((field) => [
              field.key,
              String(response.data!.config[field.key] * field.scale),
            ]),
          ),
        );
      })
      .catch(() => {
        if (active) setError("报价配置加载失败，请刷新页面重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot || saving) return;
    setError("");
    setSaved(false);
    const next: PricingConfig = { ...snapshot.config, mode };
    for (const field of fields) {
      const raw = values[field.key]?.trim();
      const value = Number(raw) / field.scale;
      const rule = snapshot.schema.properties[field.key];
      if (
        !raw ||
        !Number.isFinite(value) ||
        value < rule.minimum! ||
        value > rule.maximum!
      ) {
        setError(
          `${field.label}须在 ${rule.minimum! * field.scale} 至 ${rule.maximum! * field.scale} 之间`,
        );
        return;
      }
      next[field.key] = value;
    }
    setSaving(true);
    try {
      const response = await pricingService.save(next, snapshot.revision);
      if (response.code !== 200 || !response.data)
        throw new Error("报价配置保存失败");
      setSnapshot(response.data);
      setSaved(true);
    } catch (failure) {
      const message = (
        failure as {
          response?: { data?: { message?: string } };
          message?: string;
        }
      ).response?.data?.message;
      setError(message || "报价配置保存失败，请重新加载后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>出口报价配置</CardTitle>
        <CardDescription>
          分档模式默认使用有退税 30%、零退税上限 10% 和汇率调整
          −0.2。乘数模式须主动选择，默认乘数 1.3。保存后用于后续报价计算。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p role="status">加载报价配置...</p>
        ) : (
          <form onSubmit={save} noValidate className="space-y-4">
            {snapshot && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="pricing-mode">报价模式</Label>
                  <Select
                    value={mode}
                    onValueChange={(value) => {
                      setMode(value as PricingConfig["mode"]);
                      setSaved(false);
                    }}
                    disabled={saving}
                  >
                    <SelectTrigger id="pricing-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tiered">分档加价（默认）</SelectItem>
                      <SelectItem value="multiplier">固定乘数</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {fields.map((field) => {
                    const rule = snapshot.schema.properties[field.key];
                    return (
                      <div key={field.key} className="space-y-2">
                        <Label htmlFor={`pricing-${field.key}`}>
                          {field.label}
                        </Label>
                        <Input
                          id={`pricing-${field.key}`}
                          type="number"
                          step={field.step}
                          min={rule.minimum! * field.scale}
                          max={rule.maximum! * field.scale}
                          value={values[field.key] ?? ""}
                          disabled={saving}
                          onChange={(event) => {
                            setValues((current) => ({
                              ...current,
                              [field.key]: event.target.value,
                            }));
                            setSaved(false);
                          }}
                        />
                        <p className="text-xs text-muted-foreground">
                          范围 {rule.minimum! * field.scale} 至{" "}
                          {rule.maximum! * field.scale}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-sm text-muted-foreground">
                  分档模式使用两项加价比例；固定乘数模式统一使用乘数。两种模式均先调整汇率，沿用报价凑整规则。
                </p>
                <Button type="submit" disabled={saving}>
                  {saving ? "保存报价配置中..." : "保存报价配置"}
                </Button>
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm text-muted-foreground">
                报价配置已保存
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}

export function PricingConfigCard() {
  const isAdmin = useAuthStore((state) => state.user?.role === "ADMIN");
  return isAdmin ? <AdminPricingConfigCard /> : null;
}
