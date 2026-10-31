/**
 * Input: 箱子尺寸列表、货柜尺寸、合同毛重/体积汇总
 * Output: 每个箱子在货柜中的3D位置；支持从体积自动推算尺寸（无体积则缺箱规，不伪造）；出柜条件（双80%）判定，规则与后端 shipmentReadinessService 一致
 * Pos: 工具库，实现3D装箱算法（底部优先堆叠）+ 尺寸推算 + 出柜指标判定
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

// 40HQ 默认柜型（毫米 / CBM / kg）。唯一权威是 config/containers.json（后端读取并作为发运门槛）；
// 生产前端因 turbopack.root 固定为 frontend/ 无法导入仓库根文件，故在此保留镜像，
// 由 binPacking.test.ts 与该配置逐项比对防止漂移。
export const CONTAINER_40HQ = {
  code: "40HQ",
  length: 12020,
  width: 2350,
  height: 2695,
  maxVolume: 68,
  maxWeight: 22000,
};

// 出柜条件阈值：毛重或体积任一利用率 ≥ 80% 即可出柜（config/containers.json readyThresholdPct）
export const SHIPPING_READY_THRESHOLD_PCT = 80;

/** 出柜条件判定结果 */
export interface ShippingReadiness {
  /** 毛重利用率（%，相对 40HQ 安全毛重，未取整、不封顶） */
  weightPct: number;
  /** 体积利用率（%，相对 40HQ 安全体积，未取整、不封顶） */
  volumePct: number;
  /** 商业利用率是否达标（任一指标 ≥ 80%） */
  utilizationReady: boolean;
  /** 是否超过 40HQ 任一安全上限 */
  overloaded: boolean;
  /** 超限指标 */
  overloadReasons: Array<"weight" | "volume">;
  /** 3D 排柜是否已放下全部箱件 */
  physicalFit: boolean;
  /** 未能放入货柜的箱数 */
  unplacedBoxCount: number;
  /** 未填写箱数的装箱明细行数（与后端 missing-box-count 一致） */
  missingBoxItemCount: number;
  /** 既无箱规也无体积、无法排柜的装箱明细行数（与后端 missing-dimensions 一致） */
  missingDimensionItemCount: number;
  /** 是否同时满足利用率、上限与物理可装载性 */
  ready: boolean;
  /** 达标途径：weight/volume/both/none */
  reachedBy: "weight" | "volume" | "both" | "none";
}

/**
 * 职责：判定货柜是否满足出柜条件（任一指标 ≥ 阈值，且不超限、全部装得下、箱数与箱规齐全）
 * 思路：用未取整的利用率比较（79.95% 不达标）；规则与后端 shipmentReadinessService 一致
 * @param grossWeightKg 合同总毛重（kg）
 * @param volumeCbm 合同总体积（CBM）
 * @param physical 排柜与资料完整性事实
 * @returns 双指标利用率与判定结果
 */
export function evaluateShippingReadiness(
  grossWeightKg: number,
  volumeCbm: number,
  physical: {
    unplacedBoxCount?: number;
    missingBoxItemCount?: number;
    missingDimensionItemCount?: number;
    /** 装箱明细总行数；传入 0 表示尚未录入（对应后端 missing-packing-items） */
    packingItemCount?: number;
  } = {},
): ShippingReadiness {
  const weightPct = ((grossWeightKg || 0) / CONTAINER_40HQ.maxWeight) * 100;
  const volumePct = ((volumeCbm || 0) / CONTAINER_40HQ.maxVolume) * 100;
  const weightOk = weightPct >= SHIPPING_READY_THRESHOLD_PCT;
  const volumeOk = volumePct >= SHIPPING_READY_THRESHOLD_PCT;
  const overloadReasons: Array<"weight" | "volume"> = [];
  if ((grossWeightKg || 0) > CONTAINER_40HQ.maxWeight)
    overloadReasons.push("weight");
  if ((volumeCbm || 0) > CONTAINER_40HQ.maxVolume)
    overloadReasons.push("volume");
  const utilizationReady = weightOk || volumeOk;
  const count = (value?: number) => Math.max(0, Math.trunc(value || 0));
  const unplacedBoxCount = count(physical.unplacedBoxCount);
  const missingBoxItemCount = count(physical.missingBoxItemCount);
  const missingDimensionItemCount = count(physical.missingDimensionItemCount);
  const physicalFit = unplacedBoxCount === 0 && missingDimensionItemCount === 0;
  return {
    weightPct,
    volumePct,
    utilizationReady,
    overloaded: overloadReasons.length > 0,
    overloadReasons,
    physicalFit,
    unplacedBoxCount,
    missingBoxItemCount,
    missingDimensionItemCount,
    ready:
      utilizationReady &&
      overloadReasons.length === 0 &&
      physicalFit &&
      missingBoxItemCount === 0 &&
      physical.packingItemCount !== 0,
    reachedBy:
      weightOk && volumeOk
        ? "both"
        : weightOk
          ? "weight"
          : volumeOk
            ? "volume"
            : "none",
  };
}

// 箱子接口
export interface Box {
  id: string;
  name: string;
  length: number; // mm
  width: number; // mm
  height: number; // mm
  weight?: number; // kg
  color?: string; // 用于可视化
  quantity: number; // 箱数
  isEstimated?: boolean; // 尺寸是否由体积推算（非用户填写）
}

export interface PackingBoxProductSource {
  id: string;
  customsName?: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  volume?: number | null;
}

export interface PackingBoxItemSource {
  id: string;
  productId: string;
  boxes?: number | null;
  quantity?: number | null;
  volume?: number | null;
  grossWeight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  product?: PackingBoxProductSource | null;
}

/** 职责：未填写箱数（≤0 或空）的装箱明细行数，对应后端 missing-box-count。 */
export function countItemsMissingBoxes(
  packingItems: PackingBoxItemSource[],
): number {
  return packingItems.filter((item) => !(Number(item.boxes) > 0)).length;
}

/**
 * 职责：把装箱明细统一转换成 3D 排柜箱型。
 * 规则：明细尺寸 > 商品档案尺寸 > 按单箱体积推算（标记「估算」）；
 * 既无尺寸也无体积的行无法排柜，不再伪造箱型（见 countItemsMissingDimensions）。
 */
export function buildPackingBoxes(
  packingItems: PackingBoxItemSource[],
  products: PackingBoxProductSource[] = [],
): Box[] {
  return packingItems.flatMap((item): Box[] => {
    const product =
      item.product || products.find((entry) => entry.id === item.productId);
    const quantity = Math.max(0, Math.trunc(Number(item.boxes) || 0));
    const itemHasDimensions = Boolean(item.length && item.width && item.height);
    const productHasDimensions = Boolean(
      product?.length && product?.width && product?.height,
    );

    if (itemHasDimensions || productHasDimensions) {
      return [
        {
          id: item.id,
          name: product?.customsName || "未知商品",
          length: Number(itemHasDimensions ? item.length : product?.length),
          width: Number(itemHasDimensions ? item.width : product?.width),
          height: Number(itemHasDimensions ? item.height : product?.height),
          weight: Number(item.grossWeight) || 0,
          color: generateColor(item.productId),
          quantity,
          isEstimated: false,
        },
      ];
    }

    const inferred = inferBoxDimensions(perBoxCbm(item, product, quantity));
    if (!inferred) return [];
    return [
      {
        id: item.id,
        name: product?.customsName || "未知商品",
        length: inferred.length,
        width: inferred.width,
        height: inferred.height,
        weight: Number(item.grossWeight) || 0,
        color: generateColor(item.productId),
        quantity,
        isEstimated: true,
      },
    ];
  });
}

/** 单箱体积（CBM）：明细总体积÷箱数，否则商品体积×数量÷箱数；无法得出返回 0。 */
function perBoxCbm(
  item: PackingBoxItemSource,
  product: PackingBoxProductSource | null | undefined,
  quantity: number,
): number {
  if (quantity <= 0) return 0;
  const itemVolume = Number(item.volume) || 0;
  const productVolume = Number(product?.volume) || 0;
  if (itemVolume > 0) return itemVolume / quantity;
  return productVolume > 0
    ? (productVolume * (Number(item.quantity) || 0)) / quantity
    : 0;
}

/** 职责：既无箱规也无体积的装箱明细行数（箱数已填），对应后端 missing-dimensions。 */
export function countItemsMissingDimensions(
  packingItems: PackingBoxItemSource[],
  products: PackingBoxProductSource[] = [],
): number {
  return packingItems.filter((item) => {
    const quantity = Math.max(0, Math.trunc(Number(item.boxes) || 0));
    if (quantity === 0) return false;
    const product =
      item.product || products.find((entry) => entry.id === item.productId);
    const hasDimensions =
      Boolean(item.length && item.width && item.height) ||
      Boolean(product?.length && product?.width && product?.height);
    return !hasDimensions && perBoxCbm(item, product, quantity) <= 0;
  }).length;
}

// 放置后的箱子（包含位置信息）
export interface PlacedBox extends Box {
  posX: number; // mm
  posY: number; // mm
  posZ: number; // mm (高度方向，0 = 地面)
  rotated?: boolean; // 是否旋转（长宽互换）
}

// 装箱结果
export interface PackingResult {
  placedBoxes: PlacedBox[];
  unplacedBoxes: Box[];
  usedVolume: number; // mm³
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
  container = CONTAINER_40HQ,
): PackingResult {
  const placedBoxes: PlacedBox[] = [];
  const unplacedBoxes: Box[] = [];
  const GAP = 10; // 箱子间隙 (mm)

  // 0. 展开所有箱子（按数量展开）
  const expandedBoxes: Box[] = [];
  boxes.forEach((box) => {
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
  const spaces: Space[] = [
    {
      x: 0,
      y: 0,
      z: 0,
      length: container.length,
      width: container.width,
      height: container.height,
    },
  ];

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
        if (
          orient.l <= space.length &&
          orient.w <= space.width &&
          orient.h <= space.height
        ) {
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
    0,
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
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FFEAA7",
    "#DDA0DD",
    "#98D8C8",
    "#F7DC6F",
    "#BB8FCE",
    "#85C1E9",
    "#F8B500",
    "#00CED1",
    "#FF69B4",
    "#32CD32",
    "#FF4500",
  ];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * 职责：将毫米转换为米（用于Three.js渲染）
 */
export function mmToM(mm: number): number {
  return mm / 1000;
}

/**
 * 职责：根据单箱体积（CBM）推算长宽高尺寸
 * 思路：
 * 1. 将 CBM 转换为 mm³（1 CBM = 10^9 mm³）
 * 2. 使用标准纸箱比例 1.2:1:0.8（长:宽:高）推算三边
 *    L*W*H = V → 1.2x * x * 0.8x = V → 0.96x³ = V
 * 3. 对边长做上下限夹紧，防止数据异常
 *
 * @param volumeCbm - 单箱体积（CBM，立方米）
 * @returns 推算的长宽高（mm）及 isEstimated 标记；体积无效返回 null
 */
export function inferBoxDimensions(volumeCbm: number): {
  length: number;
  width: number;
  height: number;
  isEstimated: true;
} | null {
  // 0. 体积无效时无法推算：返回 null，不伪造箱型（调用方按「缺少箱规」处理）
  if (!volumeCbm || volumeCbm <= 0) return null;

  // 1. CBM → mm³
  const volumeMm3 = volumeCbm * 1e9;

  // 2. 标准纸箱比例 1.2:1:0.8，L*W*H = 0.96 * x³
  const x = Math.cbrt(volumeMm3 / 0.96);

  // 3. 夹紧到货柜单边合理范围 [100mm, 各轴最大值]
  const clamp = (v: number, min: number, max: number) =>
    Math.round(Math.max(min, Math.min(v, max)));

  return {
    length: clamp(x * 1.2, 100, CONTAINER_40HQ.length),
    width: clamp(x * 1.0, 100, CONTAINER_40HQ.width),
    height: clamp(x * 0.8, 100, CONTAINER_40HQ.height),
    isEstimated: true,
  };
}
