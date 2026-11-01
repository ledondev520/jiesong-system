/**
 * Input: 后端装柜计划 LoadingPlan 与柜序号
 * Output: 静态 2D 装柜图（俯视 x/y + 侧视 x/z 两张 SVG，门在右侧、块上标装货步骤）
 * Pos: 手机端 3D 回退与打印/导出共用的装柜图，不依赖 three.js
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import type { LoadingPlan, PlacedBlock } from "@/lib/containerLoading";

interface ContainerPlan2DProps {
  plan: LoadingPlan;
  containerIndex?: number;
}

type View = "top" | "side";

/** 职责：绘制一张视图；top=俯视（x→右，y→下），side=侧视（x→右，z→上）。 */
function PlanSvg({
  plan,
  blocks,
  view,
}: {
  plan: LoadingPlan;
  blocks: PlacedBlock[];
  view: View;
}) {
  const { length, width, height } = plan.container.innerMm;
  const depth = view === "top" ? width : height;
  const colorOf = new Map(plan.lines.map((line) => [line.lineId, line]));
  // 俯视：低层先画，高层盖在上面；侧视：远（y 大）先画，近处盖在上面。
  const ordered = [...blocks].sort((a, b) =>
    view === "top"
      ? a.z - b.z || a.step - b.step
      : b.y - a.y || a.step - b.step,
  );
  const fontSize = length / 60;

  return (
    <svg
      viewBox={`-${length * 0.03} -${depth * 0.04} ${length * 1.06} ${depth * 1.12}`}
      role="img"
      aria-label={view === "top" ? "装柜俯视图" : "装柜侧视图"}
      className="h-auto w-full"
    >
      <rect
        x={0}
        y={0}
        width={length}
        height={depth}
        fill="#f8fafc"
        stroke="#334155"
        strokeWidth={length / 400}
      />
      {ordered.map((block) => {
        const line = colorOf.get(block.lineId);
        const { cartonMm: c } = block;
        const w = block.nx * c.length;
        const h = view === "top" ? block.ny * c.width : block.nz * c.height;
        const y = view === "top" ? block.y : height - block.z - h;
        return (
          <g key={block.step}>
            <rect
              x={block.x}
              y={y}
              width={w}
              height={h}
              fill={line?.color ?? "#94a3b8"}
              fillOpacity={0.85}
              stroke={line?.dimsSource === "estimated" ? "#F59E0B" : "#334155"}
              strokeWidth={length / 600}
              strokeDasharray={
                line?.dimsSource === "estimated" ? `${length / 150}` : undefined
              }
            />
            {w > length * 0.04 && h > depth * 0.1 && (
              <text
                x={block.x + w / 2}
                y={y + h / 2}
                fontSize={fontSize}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#0f172a"
              >
                {block.step}
              </text>
            )}
          </g>
        );
      })}
      <text x={0} y={-depth * 0.015} fontSize={fontSize} fill="#475569">
        后墙
      </text>
      <text
        x={length}
        y={-depth * 0.015}
        fontSize={fontSize}
        fill="#475569"
        textAnchor="end"
      >
        柜门 →
      </text>
    </svg>
  );
}

/** 职责：同时给出俯视与侧视；无装柜块时给出空态文案。 */
export default function ContainerPlan2D({
  plan,
  containerIndex = 0,
}: ContainerPlan2DProps) {
  const container = plan.containers[containerIndex];
  if (!container) {
    return (
      <div className="py-10 text-center text-muted-foreground">
        暂无装柜结果
      </div>
    );
  }
  return (
    <div className="space-y-3" data-testid="container-plan-2d">
      <div>
        <p className="mb-1 text-xs text-muted-foreground">
          俯视图（数字为装货顺序）
        </p>
        <PlanSvg plan={plan} blocks={container.blocks} view="top" />
      </div>
      <div>
        <p className="mb-1 text-xs text-muted-foreground">侧视图</p>
        <PlanSvg plan={plan} blocks={container.blocks} view="side" />
      </div>
    </div>
  );
}
