/**
 * Input: 后端按角色裁剪的待办（列表键、总数、前 5 条）与 BOSS 三个数字
 * Output: 待办卡片网格；每张卡片给出总数、条目与「查看全部」入口
 * Pos: 首页展示层；不判断角色，后端返回什么就展示什么
 */

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AmountText } from "@/components/ui/amount-text";
import type {
  BossFigures,
  DashboardTodos,
  TodoKey,
} from "@/services/dashboardTodos.service";

type Currency = "CNY" | "USD";

/** 展示顺序、「查看全部」去向、条目详情地址（无详情的列表回到列表页）。 */
const LIST_META: Record<
  TodoKey,
  { all: string; currency: Currency; detail?: (id: string) => string }
> = {
  quotesToSend: {
    all: "/dashboard/quotes?status=DRAFT",
    currency: "USD",
    detail: (id) => `/dashboard/quotes/${id}`,
  },
  quotesAwaitingCustomer: {
    all: "/dashboard/quotes?status=SENT",
    currency: "USD",
    detail: (id) => `/dashboard/quotes/${id}`,
  },
  ordersToPurchase: {
    all: "/dashboard/sales",
    currency: "USD",
    detail: (id) => `/dashboard/sales/${id}`,
  },
  paymentsDue: {
    all: "/dashboard/payments?tab=payable",
    currency: "CNY",
    detail: (id) => `/dashboard/purchase/${id}`,
  },
  receiptsToInspect: {
    all: "/dashboard/purchase",
    currency: "CNY",
    detail: (id) => `/dashboard/purchase/${id}`,
  },
  toLoad: {
    all: "/dashboard/sales",
    currency: "USD",
    detail: (id) => `/dashboard/sales/${id}`,
  },
  toShip: {
    all: "/dashboard/sales",
    currency: "USD",
    detail: (id) => `/dashboard/sales/${id}`,
  },
  missingInvoice: {
    all: "/dashboard/purchase",
    currency: "CNY",
    detail: (id) => `/dashboard/purchase/${id}`,
  },
  overdueReceivables: {
    all: "/dashboard/payments?tab=receivable",
    currency: "USD",
    detail: (id) => `/dashboard/sales/${id}`,
  },
  refundable: { all: "/dashboard/tax-refunds", currency: "CNY" },
};

const KEYS = Object.keys(LIST_META) as TodoKey[];

const money = (value: number | null, currency: Currency = "CNY") =>
  value === null
    ? "—"
    : `${currency === "USD" ? "$" : "¥"}${Math.round(value).toLocaleString()}`;

const FIGURES: Array<[keyof BossFigures["definitions"], string, Currency]> = [
  ["receivable", "应收", "USD"],
  ["payable", "应付", "CNY"],
  ["monthGrossProfit", "本月毛利", "CNY"],
];

export function TodoBoard({ todos }: { todos: DashboardTodos }) {
  const keys = KEYS.filter((key) => todos.lists[key]);
  return (
    <div className="space-y-5">
      {todos.figures && (
        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          aria-label="关键数字"
        >
          {FIGURES.map(([key, label, currency]) => (
            <Card key={key} className="border-border/70 py-0 md:py-6">
              <CardContent
                className="p-3 md:p-4"
                title={todos.figures?.definitions[key]}
              >
                <p className="text-xs text-muted-foreground">{label}</p>
                <AmountText size="xl">
                  {money(todos.figures![key], currency)}
                </AmountText>
                <p className="mt-1 text-xs text-muted-foreground">
                  {todos.figures?.definitions[key]}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>
      )}
      {keys.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无待办。</p>
      ) : (
        <section
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label="待办"
        >
          {keys.map((key) => {
            const list = todos.lists[key]!;
            const meta = LIST_META[key];
            return (
              <Card key={key} className="border-border/70">
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{list.label}</CardTitle>
                  <Badge variant={list.count > 0 ? "default" : "outline"}>
                    {list.count}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {list.items.length === 0 ? (
                    <p className="text-muted-foreground">全部处理完毕</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {list.items.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center justify-between gap-2"
                        >
                          {meta.detail ? (
                            <Link
                              href={meta.detail(item.id)}
                              className="truncate font-medium hover:underline"
                            >
                              {item.contractNo}
                            </Link>
                          ) : (
                            <span className="truncate font-medium">
                              {item.contractNo}
                            </span>
                          )}
                          <span className="shrink-0 truncate text-muted-foreground">
                            {item.party ?? ""}
                          </span>
                          {item.amount !== null && (
                            <span className="shrink-0 tabular-nums">
                              {money(item.amount, meta.currency)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  <Link
                    href={meta.all}
                    className="inline-block text-primary hover:underline"
                  >
                    查看全部
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
