/**
 * Input: 装箱明细（PackingItem[]）
 * Output: 3D货柜可视化组件
 * Pos: 货柜管理组件，展示3D装箱效果
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, PerspectiveCamera, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { PackingItem, Product } from '@/types';
import { 
  packBoxes, 
  Box, 
  PlacedBox, 
  CONTAINER_40HQ, 
  generateColor, 
  mmToM 
} from '@/lib/binPacking';

interface Container3DViewProps {
  packingItems: PackingItem[];
  products: Product[];
}

/**
 * 职责：渲染单个箱子
 */
function BoxMesh({ 
  box, 
  onClick 
}: { 
  box: PlacedBox; 
  onClick?: () => void;
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
  
  return (
    <mesh
      ref={meshRef}
      position={[position.x, position.y, position.z]}
      onClick={onClick}
    >
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshStandardMaterial 
        color={box.color || '#4ECDC4'} 
        transparent 
        opacity={0.85}
      />
      {/* 边框 */}
      <lineSegments>
        <edgesGeometry args={[new THREE.BoxGeometry(size.x, size.y, size.z)]} />
        <lineBasicMaterial color="#333" linewidth={1} />
      </lineSegments>
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

/**
 * 职责：3D场景主组件
 */
function Scene({ 
  placedBoxes, 
  onBoxClick 
}: { 
  placedBoxes: PlacedBox[];
  onBoxClick?: (box: PlacedBox) => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[15, 8, 10]} fov={50} />
      <OrbitControls 
        enablePan={true}
        enableZoom={true}
        enableRotate={true}
        minDistance={5}
        maxDistance={30}
      />
      
      {/* 光源 */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
      <directionalLight position={[-10, 10, -5]} intensity={0.5} />
      
      {/* 货柜框架 */}
      <ContainerFrame />
      
      {/* 箱子 */}
      {placedBoxes.map((box, index) => (
        <BoxMesh 
          key={`${box.id}-${index}`} 
          box={box}
          onClick={() => onBoxClick?.(box)}
        />
      ))}
      
      {/* 地面网格 */}
      <gridHelper args={[20, 20, '#ccc', '#eee']} position={[6, 0, 1.2]} />
    </>
  );
}

/**
 * 职责：主导出组件
 */
export default function Container3DView({ 
  packingItems, 
  products 
}: Container3DViewProps) {
  // 将 PackingItem 转换为 Box 格式
  // 优先使用 PackingItem 中的尺寸，否则使用 Product 的尺寸，最后使用默认值
  const boxes: Box[] = useMemo(() => {
    return packingItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        id: item.id,
        name: product?.customsName || '未知商品',
        // 尺寸优先级：PackingItem > Product > 默认 500mm
        length: item.length || product?.length || 500,
        width: item.width || product?.width || 500,
        height: item.height || product?.height || 500,
        weight: item.grossWeight,
        color: generateColor(item.productId),
        quantity: item.boxes || 1,
      };
    });
  }, [packingItems, products]);
  
  // 执行装箱算法
  const packingResult = useMemo(() => {
    return packBoxes(boxes);
  }, [boxes]);
  
  const handleBoxClick = (box: PlacedBox) => {
    // 点击箱子时的交互（可以扩展为显示详情弹窗等）
  };
  
  return (
    <div className="w-full h-[500px] bg-gray-100 rounded-lg overflow-hidden relative">
      {/* 利用率信息 */}
      <div className="absolute top-4 left-4 z-10 bg-white/90 rounded-lg p-3 shadow">
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
      </div>
      
      {/* 操作提示 */}
      <div className="absolute bottom-4 left-4 z-10 bg-white/90 rounded-lg p-2 text-xs text-muted-foreground">
        拖拽旋转 | 滚轮缩放 | 右键平移
      </div>
      
      {/* 3D Canvas */}
      <Canvas shadows>
        <Suspense fallback={null}>
          <Scene 
            placedBoxes={packingResult.placedBoxes}
            onBoxClick={handleBoxClick}
          />
        </Suspense>
      </Canvas>
    </div>
  );
}
