/**
 * Input: 装柜计划、柜序号、合同号
 * Output: 单柜打印页：表头汇总、俯视/侧视图、商品图例（箱数/重量/箱规/「估算」）、分层清单与装货顺序表
 * Pos: 浏览器打印、PNG 与 PDF 导出共用的版面（PDF/PNG 由页面截图生成，避开 jsPDF 中文字体限制）；
 *      表格标题用 <h3> 而非 <caption>：截图克隆会把 table 的计算高度（不含 caption）套回含 caption 的盒子，
 *      使行被拉高、整页比量得的高度长约一个标题高，末尾几行被截掉；data-pdf-block 标记分页时不拆开标题与表
 */

import ContainerPlan2D from "./ContainerPlan2D";
import type { LoadingPlan } from "@/lib/containerLoading";

interface ContainerPrintViewProps {
  plan: LoadingPlan;
  containerIndex: number;
  contractNo: string;
}

const kg = (value: number) => `${Math.round(value * 10) / 10} kg`;

export default function ContainerPrintView({
  plan,
  containerIndex,
  contractNo,
}: ContainerPrintViewProps) {
  const container = plan.containers[containerIndex];
  if (!container) return null;
  const lineById = new Map(plan.lines.map((line) => [line.lineId, line]));

  // 商品图例：本柜内各行的箱数与重量。
  const legend = new Map<string, { cartons: number; kg: number }>();
  // 分层：按块底面高度归并。
  const layers = new Map<number, { cartons: number; kg: number }>();
  for (const block of container.blocks) {
    const entry = legend.get(block.lineId) ?? { cartons: 0, kg: 0 };
    legend.set(block.lineId, {
      cartons: entry.cartons + block.cartons,
      kg: entry.kg + block.kg,
    });
    const layer = layers.get(block.z) ?? { cartons: 0, kg: 0 };
    layers.set(block.z, {
      cartons: layer.cartons + block.cartons,
      kg: layer.kg + block.kg,
    });
  }
  const layerRows = [...layers].sort((a, b) => a[0] - b[0]);

  return (
    <section
      data-testid="container-print-page"
      className="break-after-page space-y-4 bg-white p-6 text-sm text-black"
    >
      <header className="space-y-1 border-b pb-3">
        <h2 className="text-lg font-semibold">
          {contractNo} · 装柜图 · 第 {containerIndex + 1} /{" "}
          {plan.containers.length} 柜
        </h2>
        <p className="tabular-nums">
          {plan.container.label} · {container.cartons} 箱 ·{" "}
          {kg(container.grossKg)} · {container.cargoCbm.toFixed(2)} CBM · 体积{" "}
          {container.volumePct.toFixed(1)}% · 毛重{" "}
          {container.weightPct.toFixed(1)}%
        </p>
      </header>

      <ContainerPlan2D plan={plan} containerIndex={containerIndex} />

      <div data-pdf-block>
        <h3 className="mb-1 font-medium">商品</h3>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">商品</th>
              <th>箱数</th>
              <th>重量</th>
              <th>箱规 (mm)</th>
            </tr>
          </thead>
          <tbody>
            {[...legend].map(([lineId, totals]) => {
              const line = lineById.get(lineId);
              return (
                <tr key={lineId} className="border-b break-inside-avoid">
                  <td className="py-1">
                    <span
                      className="mr-2 inline-block h-3 w-3 align-middle"
                      style={{ backgroundColor: line?.color }}
                      aria-hidden
                    />
                    {line?.name ?? lineId}
                  </td>
                  <td className="tabular-nums">{totals.cartons}</td>
                  <td className="tabular-nums">{kg(totals.kg)}</td>
                  <td className="tabular-nums">
                    {line?.cartonMm
                      ? `${line.cartonMm.length}×${line.cartonMm.width}×${line.cartonMm.height}`
                      : "—"}
                    {line?.dimsSource === "estimated" && (
                      <span className="ml-1 text-amber-600">估算</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div data-pdf-block>
        <h3 className="mb-1 font-medium">分层（自下而上）</h3>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">层</th>
              <th>底面高度</th>
              <th>箱数</th>
              <th>重量</th>
            </tr>
          </thead>
          <tbody>
            {layerRows.map(([z, totals], index) => (
              <tr key={z} className="border-b">
                <td className="py-1">第 {index + 1} 层</td>
                <td className="tabular-nums">{z} mm</td>
                <td className="tabular-nums">{totals.cartons}</td>
                <td className="tabular-nums">{kg(totals.kg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-pdf-block>
        <h3 className="mb-1 font-medium">装货顺序</h3>
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b">
              <th className="py-1">步骤</th>
              <th>商品</th>
              <th>排列 (长×宽×高)</th>
              <th>箱数</th>
              <th>重量</th>
              <th>距后墙</th>
            </tr>
          </thead>
          <tbody>
            {container.blocks.map((block) => (
              <tr key={block.step} className="border-b break-inside-avoid">
                <td className="py-1 tabular-nums">{block.step}</td>
                <td>{lineById.get(block.lineId)?.name ?? block.lineId}</td>
                <td className="tabular-nums">
                  {block.nx}×{block.ny}×{block.nz}
                </td>
                <td className="tabular-nums">{block.cartons}</td>
                <td className="tabular-nums">{kg(block.kg)}</td>
                <td className="tabular-nums">
                  {(block.x / 1000).toFixed(2)} m
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
