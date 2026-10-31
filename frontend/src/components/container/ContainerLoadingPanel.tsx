/**
 * Input: 出口合同的装柜计划（后端 loading-plan）、合同ID/号
 * Output: 货柜页签：摘要 + 柜型模拟 + 桌面 3D（懒加载）/手机 2D 回退 + 打印、PNG、PDF 导出
 * Pos: 订单详情“货柜”页签的自包含面板；只渲染后端计划，不排柜
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { Suspense, lazy, useRef, useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMobile } from "@/lib/hooks/useMobile";
import { salesService } from "@/services/sales.service";
import type { ContainerTypeCode, LoadingPlan } from "@/lib/containerLoading";
import ContainerPlan2D from "./ContainerPlan2D";
import ContainerPrintView from "./ContainerPrintView";
import ContainerSummary from "./ContainerSummary";
import { exportPagePng, exportPagesPdf } from "./containerExport";

// three.js 只在桌面端按需加载。
const Container3DView = lazy(() => import("./Container3DView"));

interface ContainerLoadingPanelProps {
  plan: LoadingPlan;
  salesContractId: string;
  contractNo: string;
}

// 只打印 #container-print-root；其余页面内容在打印时隐藏。
const PRINT_CSS = `@media print {
  body * { visibility: hidden !important; }
  #container-print-root, #container-print-root * { visibility: visible !important; }
  #container-print-root { position: absolute !important; left: 0 !important; top: 0 !important; width: 100% !important; }
}`;

export default function ContainerLoadingPanel({ plan, salesContractId, contractNo }: ContainerLoadingPanelProps) {
  const isMobile = useMobile();
  const [simPlan, setSimPlan] = useState<LoadingPlan | null>(null);
  const [containerIndex, setContainerIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const printRoot = useRef<HTMLDivElement>(null);
  const active = simPlan ?? plan;
  const simulating = active.containerType !== plan.containerType;
  const index = Math.min(containerIndex, Math.max(0, active.containers.length - 1));

  // 柜型切换只是模拟：重新向后端取该柜型的计划，确认发运仍按默认柜型校验。
  const changeType = async (code: ContainerTypeCode) => {
    setContainerIndex(0);
    if (code === plan.containerType) {
      setSimPlan(null);
      return;
    }
    try {
      const res = await salesService.getLoadingPlan(salesContractId, code);
      setSimPlan(res.data);
    } catch {
      toast.error("柜型模拟失败");
    }
  };

  const pages = () => Array.from(printRoot.current?.querySelectorAll<HTMLElement>('[data-testid="container-print-page"]') ?? []);
  const runExport = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch {
      toast.error("导出失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="container-loading-panel">
      <ContainerSummary plan={active} />

      <div className="flex flex-wrap items-center gap-2">
        <Select value={active.containerType} onValueChange={(value) => void changeType(value as ContainerTypeCode)}>
          <SelectTrigger className="w-40" aria-label="柜型">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {active.availableTypes.map((type) => (
              <SelectItem key={type.code} value={type.code}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {simulating && (
          <span className="text-xs text-amber-700 dark:text-amber-400">柜型切换仅用于模拟，确认发运按 {plan.containerType} 校验</span>
        )}
        {active.containers.length > 1 &&
          active.containers.map((container) => (
            <Button
              key={container.index}
              size="sm"
              variant={container.index === index ? "default" : "outline"}
              onClick={() => setContainerIndex(container.index)}
            >
              第 {container.index + 1} 柜
            </Button>
          ))}
        {active.containers.length > 0 && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="mr-1 h-4 w-4" />
              打印
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => runExport(async () => exportPagePng(pages()[index], `${contractNo}-装柜图-柜${index + 1}.png`))}
            >
              <Download className="mr-1 h-4 w-4" />
              保存图片
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => runExport(async () => exportPagesPdf(pages(), `${contractNo}-装柜图.pdf`))}
            >
              <FileText className="mr-1 h-4 w-4" />
              导出 PDF
            </Button>
          </div>
        )}
      </div>

      <div data-testid="container-view">
        {active.containers.length === 0 ? (
          <div className="flex h-[200px] items-center justify-center text-muted-foreground">
            请先添加装箱商品并填写箱数、箱规以查看装柜效果
          </div>
        ) : isMobile ? (
          <ContainerPlan2D plan={active} containerIndex={index} />
        ) : (
          <Suspense fallback={<div className="flex h-[500px] items-center justify-center">加载3D场景...</div>}>
            <Container3DView plan={active} containerIndex={index} />
          </Suspense>
        )}
      </div>

      {/* 打印/导出版面：屏幕外渲染（固定宽度便于截图），打印时只显示这一块。 */}
      <style>{PRINT_CSS}</style>
      <div
        id="container-print-root"
        ref={printRoot}
        aria-hidden
        className="pointer-events-none absolute -left-[10000px] top-0 w-[1100px] print:static print:w-full"
      >
        {active.containers.map((container) => (
          <ContainerPrintView key={container.index} plan={active} containerIndex={container.index} contractNo={contractNo} />
        ))}
      </div>
    </div>
  );
}
