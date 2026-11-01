/**
 * Input: 种子、箱规种数、每行最大箱数
 * Output: makeBenchContract —— 确定性（mulberry32）的互不相同箱规装箱明细，走与线上相同的 buildLoadingPlan 入口
 * Pos: 排柜性能基准的共享生成器（CONTAINER-PERF）；仅测试与 scripts/bench-container-packing.js 使用
 */

const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** 通用货：箱长 300–650、宽 200–450、高 150–400 mm，单箱 4–18 kg，每行 1..maxQty 箱；每行箱规互不相同。 */
const makeBenchContract = (sizes, { seed = 20261101, maxQty = 4 } = {}) => {
  const rand = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const seen = new Set();
  const packingItems = [];
  while (packingItems.length < sizes) {
    const length = int(300, 650);
    const width = int(200, 450);
    const height = int(150, 400);
    const key = `${length}x${width}x${height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const boxes = int(1, maxQty);
    const kg = int(4, 18);
    packingItems.push({
      id: `B${String(packingItems.length).padStart(4, '0')}`,
      productId: `P${packingItems.length}`,
      boxes, quantity: boxes * 10, length, width, height,
      grossWeight: boxes * kg,
      volume: (boxes * length * width * height) / 1e9,
      product: { name: `bench-${key}` },
    });
  }
  return { packingItems };
};

/**
 * 直接生成归一化装柜行（跳过 toCartonLines）：n 行、每行 per 箱、箱规互不相同。
 * fitCbm>0 时按总体积≈fitCbm 缩放（单柜量级）；否则为随机大箱（多柜订单）。
 */
const makeOrderLines = (n, per, { seed = 42, fitCbm = 0 } = {}) => {
  const rand = mulberry32(seed);
  const int = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const scale = fitCbm > 0 ? Math.cbrt((fitCbm * 1e9) / (n * per)) : 0;
  return Array.from({ length: n }, (_, i) => {
    const furniture = rand() < 0.5;
    const cartonMm = scale
      ? {
        length: Math.max(1, Math.round(scale * (0.8 + 0.7 * rand()))),
        width: Math.max(1, Math.round(scale * (0.6 + 0.6 * rand()))),
        height: Math.max(1, Math.round(scale * (0.5 + 0.6 * rand()))),
      }
      : { length: int(300, 1200), width: int(250, 800), height: int(200, 700) };
    return {
      lineId: `L${String(i).padStart(5, '0')}`, productId: `P${i}`, name: `SKU${i}`, color: '#000', cartons: per,
      kgPerCarton: int(3, 25), cartonMm, dimsSource: 'line', profile: furniture ? 'furniture' : 'default',
      heavy: false, upright: true, maxStackKg: furniture ? 80 : 60,
    };
  });
};

module.exports = { makeBenchContract, makeOrderLines };
