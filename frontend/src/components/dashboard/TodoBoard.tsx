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

/** 对方名称为空时的占位；只列后端确实会返回对方名称的卡片（其余卡片后端恒为 null，不能说成「未登记」）。 */
const PARTY_FALLBACK: Partial<Record<TodoKey, string>> = {
  quotesToSend: "未登记客户",
  quotesAwaitingCustomer: "未登记客户",
  paymentsDue: "未登记供应商",
  receiptsToInspect: "未登记供应商",
  missingInvoice: "未登记供应商",
};

const KEYS = Object.keys(LIST_META) as TodoKey[];

/** 每张卡片的统一口径说明（与 dashboardTodosService 的口径注释一致）；「可申报退税」另按 pending 单独写。 */
const SCOPE: Record<TodoKey, string> = {
  quotesToSend: "报价为草稿，尚未发送",
  quotesAwaitingCustomer: "报价已发送，等待客户回复",
  ordersToPurchase: "已确认订单中，仍有订单行未采购且库存未覆盖",
  paymentsDue: "已生效采购合同，应付金额大于 0",
  receiptsToInspect: "采购合同已发货，尚未收货",
  toLoad: "出口合同已确认，尚未装柜",
  toShip: "出口合同装柜中，尚未发运",
  missingInvoice: "货已出，未登记发票号也无已关联发票的采购合同",
  overdueReceivables: "发运超过 30 天仍有未收余额的出口合同",
  refundable: "本申报月退税工作台中材料核验通过的出口",
};

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
  // 页头数字取各卡片数量之和，不另起口径（退税工作台的「待处理出口」只在退税卡片上单独说明）。
  const total = keys.reduce((sum, key) => sum + todos.lists[key]!.count, 0);
  return (
    <div className="space-y-5">
      {keys.length > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="todo-total">
          共 {total} 项待办 · 为下方各卡片数量之和
        </p>
      )}
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
                  <div className="min-w-0">
                    <CardTitle className="text-base">{list.label}</CardTitle>
                    <p
                      className="mt-0.5 text-xs text-muted-foreground"
                      data-testid={`${key}-scope`}
                    >
                      {SCOPE[key]}
                      {list.historical && list.historical.count > 0 && (
                        <>
                          ；仅含 {list.historical.before} 起签约，不含{" "}
                          {list.historical.count} 条历史
                        </>
                      )}
                      {list.pending && (
                        <>
                          ；退税工作台本月共 {list.pending.count} 个
                          {list.pending.label}，其余需在退税工作台补齐材料，
                          <Link
                            href={meta.all}
                            className="text-primary hover:underline"
                          >
                            去退税工作台
                          </Link>
                        </>
                      )}
                    </p>
                  </div>
                  <Badge variant={list.count > 0 ? "default" : "outline"}>
                    {list.count}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {list.items.length === 0 ? (
                    !list.historical?.count && (
                      <p className="text-muted-foreground">全部处理完毕</p>
                    )
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
                              className="shrink-0 font-medium hover:underline"
                            >
                              {item.contractNo}
                            </Link>
                          ) : (
                            <span className="shrink-0 font-medium">
                              {item.contractNo}
                            </span>
                          )}
                          <span className="min-w-0 truncate text-muted-foreground">
                            {item.party ?? PARTY_FALLBACK[key] ?? ""}
                          </span>
                          {item.amount !== null && (
                            <span className="shrink-0 tabular-nums">
                              {/* 0 视为未录入金额（如无明细的出口订单），显示「—」而不是 $0；老板数字的 0 仍照常显示 */}
                              {item.amount
                                ? money(item.amount, meta.currency)
                                : "—"}
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
                  {list.historical && list.historical.count > 0 && (
                    <p className="text-xs text-muted-foreground">
                      另有 {list.historical.count} 条签约早于{" "}
                      {list.historical.before} 的历史记录未计入，
                      <Link
                        href={meta.all}
                        className="text-primary hover:underline"
                      >
                        查看完整列表
                      </Link>
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}
    </div>
  );
}
