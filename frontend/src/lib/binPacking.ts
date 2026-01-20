/**
 * Input: 箱子尺寸列表、货柜尺寸
 * Output: 每个箱子在货柜中的3D位置
 * Pos: 工具库，实现3D装箱算法（First Fit Decreasing Height）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 40HQ 标准货柜内部尺寸（毫米）
export const CONTAINER_40HQ = {
  length: 12030,  // 长度 (mm)
  width: 2350,    // 宽度 (mm)
  height: 2690,   // 高度 (mm)
  maxWeight: 26740, // 最大载重 (kg)
};

// 箱子接口
export interface Box {
  id: string;
  name: string;
  length: number;  // mm
  width: number;   // mm
  height: number;  // mm
  weight?: number; // kg
  color?: string;  // 用于可视化
  quantity: number; // 箱数
}

// 放置后的箱子（包含位置信息）
export interface PlacedBox extends Box {
  posX: number;  // mm
  posY: number;  // mm
  posZ: number;  // mm
  rotated?: boolean; // 是否旋转（长宽互换）
}

// 装箱结果
export interface PackingResult {
  placedBoxes: PlacedBox[];
  unplacedBoxes: Box[];
  usedVolume: number;  // mm³
  totalVolume: number; // mm³
  utilizationRate: number; // 利用率 %
}

/**
 * 职责：简化版3D装箱算法（层级堆叠）
 * 思路：
 * 1. 按高度降序排列箱子
 * 2. 在货柜底面逐层放置
 * 3. 每层尽可能填满后再开始下一层
 * 
 * @param boxes - 待装箱的箱子列表
 * @param container - 货柜尺寸，默认40HQ
 * @returns PackingResult - 装箱结果
 */
export function packBoxes(
  boxes: Box[],
  container = CONTAINER_40HQ
): PackingResult {
  const placedBoxes: PlacedBox[] = [];
  const unplacedBoxes: Box[] = [];
  
  // 0. 展开所有箱子（按数量展开）
  const expandedBoxes: Box[] = [];
  boxes.forEach(box => {
    for (let i = 0; i < box.quantity; i++) {
      expandedBoxes.push({
        ...box,
        id: `${box.id}-${i}`,
        quantity: 1,
      });
    }
  });
  
  // 1. 按体积降序排序（大箱子优先）
  const sortedBoxes = [...expandedBoxes].sort((a, b) => {
    const volA = a.length * a.width * a.height;
    const volB = b.length * b.width * b.height;
    return volB - volA;
  });
  
  // 2. 使用简单的层级堆叠算法
  let currentX = 0;
  let currentY = 0;
  let currentZ = 0;
  let layerHeight = 0;
  let rowWidth = 0;
  
  for (const box of sortedBoxes) {
    // 尝试放置（可能需要旋转）
    let placed = false;
    const orientations = [
      { l: box.length, w: box.width, h: box.height, rotated: false },
      { l: box.width, w: box.length, h: box.height, rotated: true },
    ];
    
    for (const orient of orientations) {
      // 检查当前位置是否能放下
      if (currentX + orient.l <= container.length &&
          currentY + orient.w <= container.width &&
          currentZ + orient.h <= container.height) {
        
        placedBoxes.push({
          ...box,
          length: orient.l,
          width: orient.w,
          height: orient.h,
          posX: currentX,
          posY: currentY,
          posZ: currentZ,
          rotated: orient.rotated,
        });
        
        // 更新位置
        currentX += orient.l + 10; // 10mm 间隙
        layerHeight = Math.max(layerHeight, orient.h);
        rowWidth = Math.max(rowWidth, orient.w);
        placed = true;
        break;
      }
      
      // 尝试新行
      if (currentX > 0 && currentY + rowWidth + orient.w <= container.width) {
        currentX = 0;
        currentY += rowWidth + 10;
        rowWidth = 0;
        
        if (orient.l <= container.length &&
            currentY + orient.w <= container.width &&
            currentZ + orient.h <= container.height) {
          
          placedBoxes.push({
            ...box,
            length: orient.l,
            width: orient.w,
            height: orient.h,
            posX: currentX,
            posY: currentY,
            posZ: currentZ,
            rotated: orient.rotated,
          });
          
          currentX += orient.l + 10;
          layerHeight = Math.max(layerHeight, orient.h);
          rowWidth = Math.max(rowWidth, orient.w);
          placed = true;
          break;
        }
      }
      
      // 尝试新层
      if (currentZ + layerHeight + orient.h <= container.height) {
        currentX = 0;
        currentY = 0;
        currentZ += layerHeight + 10;
        layerHeight = 0;
        rowWidth = 0;
        
        if (orient.l <= container.length &&
            orient.w <= container.width) {
          
          placedBoxes.push({
            ...box,
            length: orient.l,
            width: orient.w,
            height: orient.h,
            posX: currentX,
            posY: currentY,
            posZ: currentZ,
            rotated: orient.rotated,
          });
          
          currentX += orient.l + 10;
          layerHeight = orient.h;
          rowWidth = orient.w;
          placed = true;
          break;
        }
      }
    }
    
    if (!placed) {
      unplacedBoxes.push(box);
    }
  }
  
  // 3. 计算利用率
  const usedVolume = placedBoxes.reduce(
    (sum, box) => sum + box.length * box.width * box.height,
    0
  );
  const totalVolume = container.length * container.width * container.height;
  const utilizationRate = (usedVolume / totalVolume) * 100;
  
  return {
    placedBoxes,
    unplacedBoxes,
    usedVolume,
    totalVolume,
    utilizationRate,
  };
}

/**
 * 职责：生成随机颜色（用于不同商品区分）
 * @param seed - 种子字符串
 * @returns 颜色十六进制值
 */
export function generateColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
    '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
    '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF4500',
  ];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * 职责：将毫米转换为米（用于Three.js渲染）
 */
export function mmToM(mm: number): number {
  return mm / 1000;
}
