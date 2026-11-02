/**
 * Input: 无
 * Output: 「一条业务链，八个环节」：编号步骤条（≥1024px 一排，640–1023px 4×2，更窄纵向列表）
 * Pos: 落地页；每步只写系统里已有的环节，不写数字
 */
import {
  BadgePercent,
  ClipboardList,
  Container,
  FileStack,
  FileText,
  PackageCheck,
  Receipt,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

const STEPS: ReadonlyArray<{ title: string; line: string; icon: LucideIcon }> =
  [
    { title: "报价", line: "向客户发出报价", icon: FileText },
    { title: "出口订单", line: "确认订单与条款", icon: ClipboardList },
    { title: "采购", line: "按订单生成采购单", icon: ShoppingCart },
    { title: "收货入库", line: "分批到货与验货", icon: PackageCheck },
    { title: "装柜发运", line: "装箱、装柜与发运", icon: Container },
    { title: "单证报关", line: "出货单证与报关", icon: FileStack },
    { title: "发票与财务", line: "进项发票与收付款", icon: Receipt },
    { title: "出口退税", line: "按申报月份整理资料", icon: BadgePercent },
  ];

export function FlowStrip() {
  return (
    <section className="bg-background" aria-labelledby="flow-heading">
      <div className="mx-auto max-w-[1200px] px-4 py-16 md:px-6 md:py-24">
        <h2
          id="flow-heading"
          className="font-brand text-[28px] font-semibold leading-9 tracking-tight"
        >
          一条业务链，八个环节
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-4 lg:grid-cols-8">
          {STEPS.map(({ title, line, icon: Icon }, index) => (
            <li key={title} className="flex gap-3 sm:flex-col">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="font-brand text-xs font-semibold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <p className="font-semibold">{title}</p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {line}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
