"use client";

import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
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
import { useAuthStore } from "@/store/auth.store";
import { getSystemCategories } from "@/services/system.service";
import {
  pricingService,
  type PricingConfig,
  type PricingPreview,
} from "@/services/pricing.service";

type ScalarKey =
  "exchangeRate" | "exchangeAdjustment" | "defaultMarkup" | "roundUpTo";
const fields: { key: ScalarKey; label: string; scale: number; step: number }[] =
  [
    { key: "exchangeRate", label: "现汇 (¥/$)", scale: 1, step: 0.0001 },
    { key: "exchangeAdjustment", label: "汇率调整", scale: 1, step: 0.01 },
    { key: "defaultMarkup", label: "默认加价 (%)", scale: 100, step: 0.1 },
    { key: "roundUpTo", label: "取整步长 ($)", scale: 1, step: 1 },
  ];

const snapshotResponse = z.object({
  code: z.literal(200),
  data: z.object({
    config: z.object({
      exchangeRate: z.number().finite(),
      exchangeAdjustment: z.number().finite(),
      defaultMarkup: z.number().finite(),
      roundUpTo: z.number().finite(),
      categoryMarkups: z.array(
        z.object({
          categoryId: z.string(),
          categoryName: z.string(),
          markup: z.number().finite(),
        }),
      ),
    }),
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

function readSnapshot(response: unknown) {
  const result = snapshotResponse.safeParse(response);
  if (!result.success) throw new Error("报价配置响应无效，请重新加载后重试");
  return result.data.data;
}

type Snapshot = ReturnType<typeof readSnapshot>;
type Row = { categoryId: string; categoryName: string; percent: string };
type CategoryOption = { id: string; name: string };

// 把表单文本转成配置；任一项非法返回错误文案（范围以服务端校验为准，这里只挡明显非法输入）
function buildConfig(
  values: Record<string, string>,
  rows: Row[],
): { config: PricingConfig } | { error: string } {
  const next = {
    categoryMarkups: [] as PricingConfig["categoryMarkups"],
  } as PricingConfig;
  for (const field of fields) {
    const raw = values[field.key]?.trim();
    const value = Number(raw) / field.scale;
    if (!raw || !Number.isFinite(value))
      return { error: `${field.label}必须是数字` };
    next[field.key] = Number(value.toFixed(10));
  }
  for (const row of rows) {
    const markup = Number(row.percent) / 100;
    if (!row.categoryId || !row.percent.trim() || !Number.isFinite(markup)) {
      return { error: "分类加价需要选择分类并填写百分比" };
    }
    next.categoryMarkups.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      markup: Number(markup.toFixed(10)),
    });
  }
  return { config: next };
}

const fmt = (value: number | null | undefined) =>
  typeof value === "number" ? `$${value}` : "—";

function AdminPricingConfigCard() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<Row[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [preview, setPreview] = useState<{
    normal?: PricingPreview;
    tile?: PricingPreview;
  }>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = (next: Snapshot) => {
    setSnapshot(next);
    setValues(
      Object.fromEntries(
        fields.map((f) => [
          f.key,
          String(Number((next.config[f.key] * f.scale).toFixed(10))),
        ]),
      ),
    );
    setRows(
      next.config.categoryMarkups.map((c) => ({
        categoryId: c.categoryId,
        categoryName: c.categoryName,
        percent: String(Number((c.markup * 100).toFixed(10))),
      })),
    );
  };

  useEffect(() => {
    let active = true;
    pricingService
      .get()
      .then((response) => {
        if (active) load(readSnapshot(response));
      })
      .catch(() => {
        if (active) setError("报价配置加载失败，请刷新页面重试");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    // 分类下拉只是编辑辅助，加载失败不影响其余配置
    getSystemCategories({ page: 1, pageSize: 100 })
      .then((response) => {
        if (active) setCategories(response.data?.items ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const draft = useMemo(() => buildConfig(values, rows), [values, rows]);
  const sample = rows[0];

  // 预览调用服务端同一个 priceFor：普通商品 + 第一个分类（草稿未保存也可预览）
  useEffect(() => {
    if (!snapshot || !("config" in draft)) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      const first = draft.config.categoryMarkups[0];
      const normalDraft = { ...draft.config, categoryMarkups: [] };
      const tileDraft = {
        ...draft.config,
        categoryMarkups: first ? [first] : [],
      };
      Promise.all([
        pricingService.preview({ costCny: 100, config: normalDraft }),
        first
          ? pricingService.preview({
              costCny: 100,
              categoryId: first.categoryId,
              config: tileDraft,
            })
          : Promise.resolve(null),
      ])
        .then(([normal, tile]) => {
          if (active) setPreview({ normal: normal.data, tile: tile?.data });
        })
        .catch(() => {
          if (active) setPreview({});
        });
    }, 400);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [snapshot, draft]);

  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!snapshot || saving) return;
    setError("");
    setSaved(false);
    if (!("config" in draft)) {
      setError(draft.error);
      return;
    }
    setSaving(true);
    try {
      const response = await pricingService.save(
        draft.config,
        snapshot.revision,
      );
      load(readSnapshot(response));
      setSaved(true);
    } catch (failure) {
      const rejected = failure as {
        response?: { data?: { message?: string } };
        message?: string;
      } | null;
      const message = rejected?.response?.data?.message ?? rejected?.message;
      setError(
        typeof message === "string" && message.trim()
          ? message
          : "报价配置保存失败，请重新加载后重试",
      );
    } finally {
      setSaving(false);
    }
  };

  const edit = (update: () => void) => {
    update();
    setSaved(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>报价规则</CardTitle>
        <CardDescription>
          单价 = 采购成本(¥) × (1 + 加价) ÷ (现汇 +
          调整)，先向上取整到整美元；不足步长就停，否则取最近的步长倍数（步长 5 时个位 1、2 舍到 0，3–7 到 5，8、9 进到 10）。普通商品用默认加价，分类可单独设置（含其子分类）。已保存的订单和报价不会被重新计算。
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p role="status">加载报价配置...</p>
        ) : (
          <form onSubmit={save} noValidate className="space-y-4">
            {snapshot && (
              <>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {fields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`pricing-${field.key}`}>
                        {field.label}
                      </Label>
                      <Input
                        id={`pricing-${field.key}`}
                        type="number"
                        step={field.step}
                        value={values[field.key] ?? ""}
                        disabled={saving}
                        onChange={(event) =>
                          edit(() =>
                            setValues((c) => ({
                              ...c,
                              [field.key]: event.target.value,
                            })),
                          )
                        }
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>分类加价</Label>
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <select
                        aria-label={`分类 ${index + 1}`}
                        className="h-9 rounded-md border bg-background px-2 text-sm"
                        value={row.categoryId}
                        disabled={saving}
                        onChange={(event) =>
                          edit(() =>
                            setRows((c) =>
                              c.map((r, i) =>
                                i === index
                                  ? {
                                      ...r,
                                      categoryId: event.target.value,
                                      categoryName:
                                        categories.find(
                                          (o) => o.id === event.target.value,
                                        )?.name ?? r.categoryName,
                                    }
                                  : r,
                              ),
                            ),
                          )
                        }
                      >
                        {!categories.some((o) => o.id === row.categoryId) && (
                          <option value={row.categoryId}>
                            {row.categoryName || "选择分类"}
                          </option>
                        )}
                        {categories.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label={`分类加价 ${index + 1} (%)`}
                        type="number"
                        step={0.1}
                        className="w-28"
                        value={row.percent}
                        disabled={saving}
                        onChange={(event) =>
                          edit(() =>
                            setRows((c) =>
                              c.map((r, i) =>
                                i === index
                                  ? { ...r, percent: event.target.value }
                                  : r,
                              ),
                            ),
                          )
                        }
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          edit(() =>
                            setRows((c) => c.filter((_, i) => i !== index)),
                          )
                        }
                      >
                        删除
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={saving || categories.length === 0}
                    onClick={() =>
                      edit(() =>
                        setRows((c) => [
                          ...c,
                          {
                            categoryId: categories[0].id,
                            categoryName: categories[0].name,
                            percent: "10",
                          },
                        ]),
                      )
                    }
                  >
                    添加分类
                  </Button>
                </div>
                <div
                  className="rounded-md border bg-muted/30 p-3 text-sm"
                  aria-label="报价预览"
                >
                  <p>成本 ¥100（普通） → {fmt(preview.normal?.unitPriceUsd)}</p>
                  {sample && (
                    <p>
                      成本 ¥100（{sample.categoryName || "分类"}） →{" "}
                      {fmt(preview.tile?.unitPriceUsd)}
                    </p>
                  )}
                </div>
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
