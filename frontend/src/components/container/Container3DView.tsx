/**
 * Input: 后端装柜计划 LoadingPlan（块状装柜结果）及可选柜序号
 * Output: 3D货柜可视化组件（每个块一个 InstancedMesh、悬浮提示、「估算」标注）
 * Pos: 货柜管理组件，只渲染后端计划，不再自行排柜
 *
 * 2026-01-26: 新增悬浮提示功能，鼠标移到箱子上显示商品名称和尺寸
 * 2026-03-29: 箱规由体积推算的行用橙色边框区分，悬浮提示中注明"尺寸已预估"
 * 2026-10-31: 排柜移到后端（containerPacking.js）；本组件改为接收 plan，一个块用一个 InstancedMesh，
 *             柜体尺寸取自 plan.container（不再硬编码）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useLayoutEffect, useMemo, useRef, Suspense, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Text,
  PerspectiveCamera,
  Html,
} from "@react-three/drei";
import * as THREE from "three";
import {
  mmToM,
  type LoadingPlan,
  type PlacedBlock,
  type PlanLine,
} from "@/lib/containerLoading";

interface Container3DViewProps {
  plan: LoadingPlan;
  /** 溢出柜序号，默认 0（本合同的柜） */
  containerIndex?: number;
}

const CARTON_SHRINK = 0.985; // 箱间留出视觉缝隙

/**
 * 职责：渲染一个块（nx×ny×nz 个相同纸箱）：InstancedMesh + 一个块外框
 * 思路：坐标映射 毫米(x,y,z) → Three(x, z, y)，即 z 向上；估算行外框用橙色
 */
function BlockMesh({
  block,
  line,
  hovered,
  onHover,
}: {
  block: PlacedBlock;
  line: PlanLine | undefined;
  hovered: boolean;
  onHover: (hovered: boolean) => void;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { cartonMm: c } = block;
  const estimated = line?.dimsSource === "estimated";

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || typeof mesh.setMatrixAt !== "function") return;
    const dummy = new THREE.Object3D();
    let index = 0;
    for (let k = 0; k < block.nz; k += 1) {
      for (let j = 0; j < block.ny; j += 1) {
        for (let i = 0; i < block.nx; i += 1) {
          dummy.position.set(
            mmToM(block.x + (i + 0.5) * c.length),
            mmToM(block.z + (k + 0.5) * c.height),
            mmToM(block.y + (j + 0.5) * c.width),
          );
          dummy.updateMatrix();
          mesh.setMatrixAt(index, dummy.matrix);
          index += 1;
        }
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [block, c.length, c.width, c.height]);

  const outline = useMemo(() => {
    const geometry = new THREE.BoxGeometry(
      mmToM(block.nx * c.length),
      mmToM(block.nz * c.height),
      mmToM(block.ny * c.width),
    );
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, [block.nx, block.ny, block.nz, c.length, c.width, c.height]);

  const center: [number, number, number] = [
    mmToM(block.x + (block.nx * c.length) / 2),
    mmToM(block.z + (block.nz * c.height) / 2),
    mmToM(block.y + (block.ny * c.width) / 2),
  ];
  const color = hovered
    ? new THREE.Color(line?.color || "#4ECDC4").lerp(
        new THREE.Color("#ffffff"),
        0.15,
      )
    : line?.color || "#4ECDC4";

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, block.cartons]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onHover(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          onHover(false);
          document.body.style.cursor = "auto";
        }}
      >
        <boxGeometry
          args={[
            mmToM(c.length) * CARTON_SHRINK,
            mmToM(c.height) * CARTON_SHRINK,
            mmToM(c.width) * CARTON_SHRINK,
          ]}
        />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered ? 0.9 : 0.85}
        />
      </instancedMesh>
      <lineSegments position={center} geometry={outline}>
        <lineBasicMaterial color={estimated ? "#F59E0B" : "#333"} />
      </lineSegments>
      {hovered && (
        <Html
          position={[
            center[0],
            center[1] + mmToM((block.nz * c.height) / 2) + 0.05,
            center[2],
          ]}
          center
          style={{ pointerEvents: "none" }}
        >
          <div className="bg-popover/92 text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap border border-border/60">
            <div>{line?.name ?? block.lineId}</div>
            <div className="text-muted-foreground">
              {block.cartons} 箱 · {c.length}×{c.width}×{c.height} mm
            </div>
            {estimated && (
              <div className="text-amber-500 mt-0.5">⚠ 尺寸已根据体积预估</div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

/** 职责：渲染货柜框架与尺寸标注（尺寸来自计划，不硬编码）。 */
function ContainerFrame({ plan }: { plan: LoadingPlan }) {
  const { length, width, height } = plan.container.innerMm;
  const size = useMemo(
    () => ({ x: mmToM(length), y: mmToM(height), z: mmToM(width) }),
    [length, width, height],
  );
  const frameEdges = useMemo(() => {
    const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const edges = new THREE.EdgesGeometry(geometry);
    geometry.dispose();
    return edges;
  }, [size]);
  const position = { x: size.x / 2, y: size.y / 2, z: size.z / 2 };

  return (
    <group>
      <mesh
        position={[position.x, 0.01, position.z]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial color="#e0e0e0" side={THREE.DoubleSide} />
      </mesh>
      <lineSegments
        position={[position.x, position.y, position.z]}
        geometry={frameEdges}
      >
        <lineBasicMaterial color="#666" />
      </lineSegments>
      <Text
        position={[position.x, -0.3, -0.5]}
        fontSize={0.3}
        color="#333"
        anchorX="center"
      >
        {`${length}mm`}
      </Text>
      <Text
        position={[-0.5, position.y, position.z]}
        fontSize={0.3}
        color="#333"
        rotation={[0, Math.PI / 2, 0]}
        anchorX="center"
      >
        {`${height}mm`}
      </Text>
      <Text
        position={[size.x + 0.5, -0.3, position.z]}
        fontSize={0.3}
        color="#333"
        rotation={[0, -Math.PI / 2, 0]}
        anchorX="center"
      >
        {`${width}mm`}
      </Text>
    </group>
  );
}

/** 职责：3D 场景；OrbitControls 指向货柜中心，避免锁死在货柜角点。 */
function Scene({
  plan,
  blocks,
  hoveredStep,
  onHover,
}: {
  plan: LoadingPlan;
  blocks: PlacedBlock[];
  hoveredStep: number | null;
  onHover: (step: number | null) => void;
}) {
  const { length, width, height } = plan.container.innerMm;
  const center: [number, number, number] = [
    mmToM(length / 2),
    mmToM(height / 2),
    mmToM(width / 2),
  ];
  const camPos: [number, number, number] = [
    center[0] + 8,
    center[1] + 6,
    center[2] + 10,
  ];
  const lineById = useMemo(
    () => new Map(plan.lines.map((line) => [line.lineId, line])),
    [plan.lines],
  );

  return (
    <>
      <PerspectiveCamera makeDefault position={camPos} fov={50} />
      <OrbitControls
        target={center}
        enablePan
        enableZoom
        enableRotate
        minDistance={3}
        maxDistance={40}
      />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      <ContainerFrame plan={plan} />
      {blocks.map((block) => (
        <BlockMesh
          key={block.step}
          block={block}
          line={lineById.get(block.lineId)}
          hovered={hoveredStep === block.step}
          onHover={(hovered) => onHover(hovered ? block.step : null)}
        />
      ))}
      <gridHelper
        args={[20, 20, "#ccc", "#eee"]}
        position={[mmToM(length / 2), 0, mmToM(width / 2)]}
      />
    </>
  );
}

/** 职责：主导出组件；统计面板显示本柜装箱数、利用率、未装与估算提示。 */
export default function Container3DView({
  plan,
  containerIndex = 0,
}: Container3DViewProps) {
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const container = plan.containers[containerIndex];
  const blocks = useMemo(() => container?.blocks ?? [], [container]);
  const unplacedCartons =
    plan.unplaced.reduce((sum, entry) => sum + entry.cartons, 0) +
    plan.containers
      .filter((entry) => entry.index !== containerIndex)
      .reduce((sum, entry) => sum + entry.cartons, 0);
  const estimatedCount = plan.lines.filter(
    (line) => line.dimsSource === "estimated",
  ).length;

  return (
    <div className="w-full h-[420px] md:h-[520px] bg-muted rounded-lg overflow-hidden relative">
      <div className="absolute top-4 left-4 z-10 bg-card/92 rounded-lg p-3 shadow border border-border/60">
        <div className="text-sm font-medium">装箱统计</div>
        <div className="text-xs text-muted-foreground mt-1">
          已装: {container?.cartons ?? 0} 箱
        </div>
        <div className="text-xs text-muted-foreground">
          未装: {unplacedCartons} 箱
        </div>
        <div className="text-xs font-medium mt-1">
          体积: {(container?.volumePct ?? 0).toFixed(1)}% · 毛重:{" "}
          {(container?.weightPct ?? 0).toFixed(1)}%
        </div>
        {plan.containers.length > 1 && (
          <div className="text-xs text-muted-foreground">
            第 {containerIndex + 1} / {plan.containers.length} 柜
          </div>
        )}
        {estimatedCount > 0 && (
          <div className="text-xs text-amber-500 mt-1 border-t border-border/40 pt-1">
            ⚠ {estimatedCount} 项尺寸已预估
          </div>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-10 bg-card/92 rounded-lg p-2 text-xs text-muted-foreground border border-border/60">
        拖拽旋转 | 滚轮缩放 | 右键平移
      </div>

      <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
        <Suspense fallback={null}>
          <Scene
            plan={plan}
            blocks={blocks}
            hoveredStep={hoveredStep}
            onHover={setHoveredStep}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
