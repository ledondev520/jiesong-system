/**
 * Input: 箱子尺寸列表、货柜尺寸
 * Output: 每个箱子在货柜中的3D位置
 * Pos: 工具库，实现3D装箱算法（底部优先堆叠）
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 40HQ 标准货柜内部尺寸（毫米）及厂家建议限制
export const CONTAINER_40HQ = {
  length: 12030,  // 长度 (mm) - 内径
  width: 2350,    // 宽度 (mm) - 内径
  height: 2690,   // 高度 (mm) - 内径
  maxVolume: 68,  // 厂家建议最大装载体积 (CBM)
  maxWeight: 22500, // 厂家建议最大毛重 (kg) = 22.5吨
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
  posZ: number;  // mm (高度方向，0 = 地面)
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

// 空间接口（用于跟踪可用空间）
interface Space {
  x: number;
  y: number;
  z: number;
  length: number;
  width: number;
  height: number;
}

/**
 * 职责：3D装箱算法（底部优先堆叠）
 * 思路：
 * 1. 使用可用空间列表跟踪剩余空间
 * 2. 每次放置箱子后，将剩余空间分割为新的可用空间
 * 3. 优先使用Z值最小（最接近地面）的空间
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
  const GAP = 10; // 箱子间隙 (mm)
  
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
  
  // 2. 初始化可用空间列表（整个货柜是一个大空间）
  const spaces: Space[] = [{
    x: 0,
    y: 0,
    z: 0,
    length: container.length,
    width: container.width,
    height: container.height,
  }];
  
  // 3. 逐个放置箱子
  for (const box of sortedBoxes) {
    let placed = false;
    
    // 尝试两种旋转方向
    const orientations = [
      { l: box.length, w: box.width, h: box.height, rotated: false },
      { l: box.width, w: box.length, h: box.height, rotated: true },
    ];
    
    // 按 Z 值排序空间（底部优先）
    spaces.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    
    for (let i = 0; i < spaces.length && !placed; i++) {
      const space = spaces[i];
      
      for (const orient of orientations) {
        // 检查箱子是否能放入这个空间
        if (orient.l <= space.length && 
            orient.w <= space.width && 
            orient.h <= space.height) {
          
          // 放置箱子
          placedBoxes.push({
            ...box,
            length: orient.l,
            width: orient.w,
            height: orient.h,
            posX: space.x,
            posY: space.y,
            posZ: space.z,
            rotated: orient.rotated,
          });
          
          // 移除使用的空间
          spaces.splice(i, 1);
          
          // 分割剩余空间（创建三个新空间：右侧、前方、上方）
          // 右侧空间（沿 X 轴）
          if (space.length - orient.l - GAP > 100) {
            spaces.push({
              x: space.x + orient.l + GAP,
              y: space.y,
              z: space.z,
              length: space.length - orient.l - GAP,
              width: space.width,
              height: space.height,
            });
          }
          
          // 前方空间（沿 Y 轴）
          if (space.width - orient.w - GAP > 100) {
            spaces.push({
              x: space.x,
              y: space.y + orient.w + GAP,
              z: space.z,
              length: orient.l,
              width: space.width - orient.w - GAP,
              height: space.height,
            });
          }
          
          // 上方空间（沿 Z 轴）- 仅当这个箱子下方有支撑时才能使用
          if (space.height - orient.h - GAP > 100) {
            spaces.push({
              x: space.x,
              y: space.y,
              z: space.z + orient.h + GAP,
              length: orient.l,
              width: orient.w,
              height: space.height - orient.h - GAP,
            });
          }
          
          placed = true;
          break;
        }
      }
    }
    
    if (!placed) {
      unplacedBoxes.push(box);
    }
  }
  
  // 4. 计算利用率
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
