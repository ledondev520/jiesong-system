/**
 * Input: 装箱明细（PackingItem[]）、商品信息（Product[]）
 * Output: 3D货柜可视化组件（含悬浮提示 + 尺寸自动推算）
 * Pos: 货柜管理组件，展示3D装箱效果
 * 
 * 2026-01-26: 新增悬浮提示功能，鼠标移到箱子上显示商品名称和尺寸
 * 2026-03-29: 当 PackingItem/Product 未填写长宽高时，自动从体积（volume/boxes）反推尺寸
 *             推算的箱子以虚线边框区分，悬浮提示中注明"尺寸已预估"
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRef, useMemo, Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Text, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
import { PackingItem, Product } from '@/types';
import { 
  packBoxes, 
  Box, 
  PlacedBox, 
  CONTAINER_40HQ, 
  generateColor, 
  mmToM,
  inferBoxDimensions,
} from '@/lib/binPacking';

interface Container3DViewProps {
  packingItems: PackingItem[];
  products: Product[];
}

/**
 * 职责：渲染单个箱子（含悬浮提示）
 * 思路：isEstimated 箱子用橙色虚线边框区分，悬浮提示中注明尺寸来源
 */
function BoxMesh({ 
  box, 
  onClick,
  onHover,
  isHovered,
}: { 
  box: PlacedBox; 
  onClick?: () => void;
  onHover?: (hovered: boolean) => void;
  isHovered?: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  // 转换尺寸到米
  const size = useMemo(() => ({
    x: mmToM(box.length),
    y: mmToM(box.height),
    z: mmToM(box.width),
  }), [box]);
  
  // 转换位置到米（Three.js 坐标系）
  const position = useMemo(() => ({
    x: mmToM(box.posX + box.length / 2),
    y: mmToM(box.posZ + box.height / 2),
    z: mmToM(box.posY + box.width / 2),
  }), [box]);
  
  // 悬浮时轻微高亮；预估箱子边框用橙色区分
  const color = isHovered 
    ? new THREE.Color(box.color || '#4ECDC4').lerp(new THREE.Color('#ffffff'), 0.15)
    : box.color || '#4ECDC4';
  const edgeColor = box.isEstimated ? '#F59E0B' : '#333';
  
  return (
    <mesh
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      onClick={onClick}
      onPointerEnter={(e) => {
        e.stopPropagation();
        onHover?.(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerLeave={(e) => {
        e.stopPropagation();
        onHover?.(false);
        document.body.style.cursor = 'auto';
      }}
    >
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshStandardMaterial 
        color={color} 
        transparent 
        opacity={isHovered ? 0.9 : 0.85}
      />
      {/* 边框：预估箱子用橙色高亮边框 */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
        <lineBasicMaterial color={edgeColor} linewidth={1} />
      </lineSegments>
      
      {/* 悬浮提示 - 显示商品名称及尺寸来源 */}
      {isHovered && (
        <Html
          position={[0, size.y / 2 + 0.05, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="bg-popover/92 text-popover-foreground px-2 py-1 rounded text-xs whitespace-nowrap border border-border/60">
            <div>{box.name}</div>
            {box.isEstimated && (
              <div className="text-amber-500 mt-0.5">⚠ 尺寸已根据体积预估</div>
            )}
          </div>
        </Html>
      )}
    </mesh>
  );
}

/**
 * 职责：渲染货柜框架
 */
function ContainerFrame() {
  const size = useMemo(() => ({
    x: mmToM(CONTAINER_40HQ.length),
    y: mmToM(CONTAINER_40HQ.height),
    z: mmToM(CONTAINER_40HQ.width),
  }), []);
  
  const position = useMemo(() => ({
    x: size.x / 2,
    y: size.y / 2,
    z: size.z / 2,
  }), [size]);
  
  return (
    <group>
      {/* 货柜底面 */}
      <mesh 
        position={[position.x, 0.01, position.z]} 
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[size.x, size.z]} />
        <meshStandardMaterial color="#e0e0e0" side={THREE.DoubleSide} />
      </mesh>
      
      {/* 货柜线框 */}
      <lineSegments position={[position.x, position.y, position.z]}>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
        <lineBasicMaterial color="#666" linewidth={2} />
      </lineSegments>
      
      {/* 尺寸标注 */}
      <Text
        position={[position.x, -0.3, -0.5]}
        fontSize={0.3}
        color="#333"
        anchorX="center"
      >
        {`${CONTAINER_40HQ.length}mm`}
      </Text>
      <Text
        position={[-0.5, position.y, position.z]}
        fontSize={0.3}
        color="#333"
        rotation={[0, Math.PI / 2, 0]}
        anchorX="center"
      >
        {`${CONTAINER_40HQ.height}mm`}
      </Text>
      <Text
        position={[size.x + 0.5, -0.3, position.z]}
        fontSize={0.3}
        color="#333"
        rotation={[0, -Math.PI / 2, 0]}
        anchorX="center"
      >
        {`${CONTAINER_40HQ.width}mm`}
      </Text>
    </group>
  );
}

// 货柜中心点（Three.js 坐标系，单位米）——用作 OrbitControls target
// 货柜从原点延伸，中心约在 (length/2, height/2, width/2) 处
const CONTAINER_CENTER: [number, number, number] = [
  mmToM(CONTAINER_40HQ.length / 2),
  mmToM(CONTAINER_40HQ.height / 2),
  mmToM(CONTAINER_40HQ.width / 2),
];

/**
 * 职责：3D场景主组件（含悬浮状态管理）
 * 思路：OrbitControls target 指向货柜中心，避免锁死在货柜角点
 */
function Scene({ 
  placedBoxes, 
  onBoxClick,
  hoveredBoxId,
  onBoxHover,
}: { 
  placedBoxes: PlacedBox[];
  onBoxClick?: (box: PlacedBox) => void;
  hoveredBoxId: string | null;
  onBoxHover: (boxId: string | null) => void;
}) {
  // 初始相机位置：从货柜中心偏移，给出斜侧视角
  const camPos: [number, number, number] = [
    CONTAINER_CENTER[0] + 8,
    CONTAINER_CENTER[1] + 6,
    CONTAINER_CENTER[2] + 10,
  ];
  return (
    <>
      <PerspectiveCamera makeDefault position={camPos} fov={50} />
      <OrbitControls 
        target={CONTAINER_CENTER}
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={3}
        maxDistance={40}
      />
      
      {/* 光源 */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      
      {/* 货柜框架 */}
      <ContainerFrame />
      
      {/* 箱子 */}
      {placedBoxes.map((box, index) => {
        const boxKey = `${box.id}-${index}`;
        return (
          <BoxMesh 
            key={boxKey} 
            box={box}
            onClick={() => onBoxClick?.(box)}
            isHovered={hoveredBoxId === boxKey}
            onHover={(hovered) => onBoxHover(hovered ? boxKey : null)}
          />
        );
      })}
      
      {/* 地面网格 */}
      <gridHelper args={[20, 20, '#ccc', '#eee']} position={[6, 0, 1.2]} />
    </>
  );
}

/**
 * 职责：主导出组件（含悬浮提示功能）
 */
export default function Container3DView({ 
  packingItems, 
  products 
}: Container3DViewProps) {
  // 悬浮状态
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  
  // 将 PackingItem 转换为 Box 格式
  // 尺寸优先级：PackingItem 手填 > Product 档案 > 体积反推 > 固定默认500mm
  const boxes: Box[] = useMemo(() => {
    return packingItems.map(item => {
      const product = products.find(p => p.id === item.productId);

      // 1. 优先用 PackingItem 手填的精确尺寸
      const hasExactDims = item.length && item.width && item.height;
      if (hasExactDims) {
        return {
          id: item.id,
          name: product?.customsName || '未知商品',
          length: item.length!,
          width: item.width!,
          height: item.height!,
          weight: item.grossWeight,
          color: generateColor(item.productId),
          quantity: item.boxes || 1,
          isEstimated: false,
        };
      }

      // 2. 次优：使用商品档案中的尺寸
      const hasProductDims = product?.length && product?.width && product?.height;
      if (hasProductDims) {
        return {
          id: item.id,
          name: product!.customsName || '未知商品',
          length: product!.length!,
          width: product!.width!,
          height: product!.height!,
          weight: item.grossWeight,
          color: generateColor(item.productId),
          quantity: item.boxes || 1,
          isEstimated: false,
        };
      }

      // 3. 体积反推：用 item.volume / item.boxes 得到每箱体积（CBM），再推算三维
      //    备选：用 product.volume 作为每件体积，乘以装箱数量再除以箱数
      const itemVolume = item.volume || 0;
      const boxCount = item.boxes || 1;
      const productVolume = product?.volume || 0;
      const itemQty = item.quantity || 1;

      // 1.1 若明细有总体积 → 单箱体积 = 总体积 / 箱数
      // 1.2 若商品档案有单件体积 → 单箱体积 = 单件体积 * 件数 / 箱数
      const perBoxCbm = itemVolume > 0
        ? itemVolume / boxCount
        : productVolume > 0
          ? (productVolume * itemQty) / boxCount
          : 0;

      const inferred = inferBoxDimensions(perBoxCbm);

      return {
        id: item.id,
        name: product?.customsName || '未知商品',
        length: inferred.length,
        width: inferred.width,
        height: inferred.height,
        weight: item.grossWeight,
        color: generateColor(item.productId),
        quantity: boxCount,
        isEstimated: true,
      };
    });
  }, [packingItems, products]);
  
  // 执行装箱算法
  const packingResult = useMemo(() => {
    return packBoxes(boxes);
  }, [boxes]);

  // 统计尺寸预估的商品行数（用于提示）
  const estimatedCount = useMemo(() => {
    return boxes.filter(b => b.isEstimated).length;
  }, [boxes]);
  
  return (
    <div className="w-full h-[420px] md:h-[520px] bg-muted rounded-lg overflow-hidden relative">
      {/* 利用率信息 */}
      <div className="absolute top-4 left-4 z-10 bg-card/92 rounded-lg p-3 shadow border border-border/60">
        <div className="text-sm font-medium">装箱统计</div>
        <div className="text-xs text-muted-foreground mt-1">
          已装: {packingResult.placedBoxes.length} 箱
        </div>
        <div className="text-xs text-muted-foreground">
          未装: {packingResult.unplacedBoxes.length} 箱
        </div>
        <div className="text-xs font-medium mt-1">
          利用率: {packingResult.utilizationRate.toFixed(1)}%
        </div>
        {estimatedCount > 0 && (
          <div className="text-xs text-amber-500 mt-1 border-t border-border/40 pt-1">
            ⚠ {estimatedCount} 项尺寸已预估
          </div>
        )}
      </div>
      
      {/* 操作提示 */}
      <div className="absolute bottom-4 left-4 z-10 bg-card/92 rounded-lg p-2 text-xs text-muted-foreground border border-border/60">
        拖拽旋转 | 滚轮缩放 | 右键平移
      </div>
      
      {/* 3D Canvas */}
      <Canvas 
        shadows 
        gl={{ preserveDrawingBuffer: true }} // 允许截图
      >
        <Suspense fallback={null}>
          <Scene 
            placedBoxes={packingResult.placedBoxes}
            hoveredBoxId={hoveredBoxId}
            onBoxHover={setHoveredBoxId}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
