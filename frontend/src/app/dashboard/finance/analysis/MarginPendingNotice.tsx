/**
 * Input: 经营概览 overview（不可用合同及其具体原因、按原因合计、已核实汇总）
 * Output: 「毛利待核验」提示：每笔合同缺哪项输入、按原因的笔数、已核实出货的单独汇总
 * Pos: 经营分析页；替代原来笼统的「缺少汇率或已售成本」，只展示后端给出的原因，不在前端推断
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
import Link from "next/link";
import type { BusinessOverview, ReasonCount } from "@/services/reports.service";

type Overview = BusinessOverview["overview"];

/** 「缺汇率 2 笔、缺已售成本 2 笔」；无原因时返回空串。 */
export const formatReasonCounts = (reasons: ReasonCount[]) =>
  reasons.map((reason) => `${reason.label} ${reason.count} 笔`).join("、");

const money = (value: number) =>
  `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MarginPendingNotice({ overview }: { overview: Overview }) {
  const pending = overview.unavailableContracts.length;
  if (overview.marginReady && overview.shippedWithoutDate === 0) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
    >
      {!overview.marginReady && (
        <>
          <p>
            毛利待核验：{overview.contractCount} 笔发运中有 {pending}{" "}
            笔缺少资料，不能给出整体毛利。
          </p>
          <p className="mt-1" data-testid="margin-reason-summary">
            缺少的资料（一笔可同时缺多项）：
            {formatReasonCounts(overview.marginReasonSummary)}。
          </p>
          <p className="mt-1" data-testid="margin-verified">
            另外 {overview.verified.contractCount} 笔已核实：采购成本{" "}
            {money(overview.verified.totalPurchases)}，毛利{" "}
            {money(overview.verified.grossProfit)}
            （仅这几笔，不是整体数字）。
          </p>
          <details className="mt-2">
            <summary className="cursor-pointer underline">
              查看清单（{pending} 笔）
            </summary>
            <ul className="mt-2 space-y-1">
              {overview.unavailableContracts.map((contract) => (
                <li key={contract.id}>
                  <Link
                    className="underline"
                    href={`/dashboard/sales/${contract.id}?tab=finance`}
                  >
                    {contract.contractNo}：{contract.reasons.join("；")}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
      {overview.shippedWithoutDate > 0 && (
        <p className="mt-1" data-testid="shipped-without-date">
          另有 {overview.shippedWithoutDate}{" "}
          笔状态为已发运但没有发运日期，不在任何发运期间内，未计入以上数字。
        </p>
      )}
    </div>
  );
}
