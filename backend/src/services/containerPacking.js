/**
 * Input: 装箱明细（PackingItem + product）、柜型规格与装柜画像（containerSpecs / config/containers.json）
 * Output: toCartonLines（按行归一化箱型）、packContainers（多柜块状极值点装柜计划）
 * Pos: 排柜唯一实现；纯同步、无 I/O、无随机，同输入必得同输出。shipmentReadinessService 在其上做出货检查
 *
 * 规则：箱规来源 line > 估算 > 商品（仅一件一箱）；重货在底、重货只能压在地面或重货上；
 * 竖放箱仅允许水平旋转；每箱最大承压 maxStackKg（含向下传递）；累计毛重不超过安全上限；必须能过柜门。
 * 坐标为毫米，原点=后墙左侧地面，x 朝柜门。
 */

const { loadContainerConfig } = require('./containerSpecs');

const EPS = 1e-9;
const MAX_CONTAINERS = 20;
const MAX_BLOCKS_PER_CONTAINER = 600;
// 计算预算（候选块内层迭代 × 已放块数）：畸形/超大数据耗尽后 fail-closed（剩余箱进 unplaced，阻塞出货），不卡死 API 进程。
// shortcut: 5e8 ≈ 2–3 s 同步上限，约为 300 个互不相同箱规行所需的 3 倍；更大订单需改为分片/异步排柜再调高。
const COMPUTE_BUDGET = 500_000_000;
const PALETTE = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
  '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1', '#FF69B4', '#32CD32', '#FF4500', '#7FB069',
  '#E07A5F', '#3D5A80', '#EE6C4D', '#81B29A', '#F2CC8F', '#9A8C98', '#6D9DC5', '#C9ADA7',
];

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const round3 = (value) => Math.round(value * 1000) / 1000;

const colorFor = (seed) => {
  let hash = 0;
  for (const char of String(seed ?? '')) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

/** 可用空间 = 内尺寸 − 余量（关门/纸箱鼓包）。 */
const usableMm = (spec, config = loadContainerConfig()) => ({
  length: spec.innerMm.length - config.clearanceMm.length,
  width: spec.innerMm.width - config.clearanceMm.width,
  height: spec.innerMm.height - config.clearanceMm.height,
});

// 归一化（四舍五入到整 mm）后每边必须仍 ≥1：0.1 mm 之类会变成 0，让排柜循环不收敛。
const isValidMm = (value) => Number.isInteger(value) && value >= 1;
const positiveDims = (source) => {
  const length = Math.round(toNumber(source?.length));
  const width = Math.round(toNumber(source?.width));
  const height = Math.round(toNumber(source?.height));
  return isValidMm(length) && isValidMm(width) && isValidMm(height) ? { length, width, height } : null;
};

/** 按单箱体积以 1.2:1:0.8 推算箱规，夹紧到可用空间；结果必须标记「估算」。 */
const estimateCarton = (cbm, usable) => {
  const base = Math.cbrt((cbm * 1e9) / 0.96);
  const clamp = (value, max) => Math.round(Math.max(100, Math.min(value, max)));
  return {
    length: clamp(base * 1.2, usable.length),
    width: clamp(base, usable.width),
    height: clamp(base * 0.8, usable.height),
  };
};

/** 画像匹配：按配置顺序，先品类名再报关名做小写子串匹配；都不命中用 default。 */
const resolveProfile = (config, categoryName, productName) => {
  const haystacks = [categoryName, productName].map((text) => String(text || '').toLowerCase()).filter(Boolean);
  for (const [key, profile] of Object.entries(config.profiles)) {
    if (key === 'default') continue;
    if (haystacks.some((text) => profile.match.some((word) => word && text.includes(word.toLowerCase())))) {
      return { key, ...profile };
    }
  }
  return { key: 'default', ...config.profiles.default };
};

/**
 * 每条 boxes>0 的装箱明细生成一行；箱规优先级 line → 体积估算 → 商品箱规（仅一件一箱）→ 商品体积估算 → missing。
 * @returns {Array<{ lineId, productId, name, color, cartons, kgPerCarton, cartonMm, dimsSource,
 *   profile, heavy, upright, maxStackKg }>}
 */
const toCartonLines = (packingItems, spec, config = loadContainerConfig()) => {
  const usable = usableMm(spec, config);
  return (packingItems || []).flatMap((item) => {
    const cartons = Math.max(0, Math.trunc(toNumber(item.boxes)));
    if (cartons === 0) return [];
    const product = item.product || {};
    const name = product.customsName || product.name || '未知商品';
    const kgPerCarton = Math.max(0, toNumber(item.grossWeight)) / cartons;

    let cartonMm = positiveDims(item);
    let dimsSource = cartonMm ? 'line' : 'missing';
    if (!cartonMm) {
      const lineCbm = toNumber(item.volume) / cartons;
      const productDims = positiveDims(product);
      const productCbm = (toNumber(product.volume) * toNumber(item.quantity)) / cartons;
      if (lineCbm > 0) {
        cartonMm = estimateCarton(lineCbm, usable);
        dimsSource = 'estimated';
      } else if (productDims && toNumber(item.quantity) === cartons) {
        // 商品尺寸按“件”记录，仅在一件一箱时可当箱规。
        cartonMm = productDims;
        dimsSource = 'product';
      } else if (productCbm > 0) {
        cartonMm = estimateCarton(productCbm, usable);
        dimsSource = 'estimated';
      }
    }

    const categoryName = typeof product.category === 'string' ? product.category : product.category?.name;
    const profile = resolveProfile(config, categoryName, name);
    const cartonCbm = cartonMm ? (cartonMm.length * cartonMm.width * cartonMm.height) / 1e9 : 0;
    return [{
      lineId: item.id,
      productId: item.productId ?? null,
      name,
      color: colorFor(item.productId ?? item.id),
      cartons,
      kgPerCarton: round3(kgPerCarton),
      cartonMm,
      dimsSource,
      profile: profile.key,
      heavy: profile.heavy || (cartonCbm > 0 && kgPerCarton / cartonCbm >= config.heavyDensityKgPerCbm),
      upright: profile.upright,
      maxStackKg: profile.maxStackKg,
    }];
  });
};

/** 允许的朝向：竖放箱只做水平旋转；重货（非竖放）大面朝下；其余六向。去重、顺序固定。 */
const orientationsFor = (line) => {
  const { length: a, width: b, height: c } = line.cartonMm;
  let list = line.upright
    ? [[a, b, c], [b, a, c]]
    : [[a, b, c], [b, a, c], [a, c, b], [c, a, b], [b, c, a], [c, b, a]];
  if (line.heavy && !line.upright) {
    const lowest = Math.min(a, b, c);
    list = list.filter((entry) => entry[2] === lowest);
  }
  const seen = new Set();
  return list
    .filter((entry) => !seen.has(entry.join()) && seen.add(entry.join()))
    .map(([l, w, h]) => ({ l, w, h }));
};

const overlaps = (a, b) => (
  a.x < b.x + b.dx && a.x + a.dx > b.x
  && a.y < b.y + b.dy && a.y + a.dy > b.y
  && a.z < b.z + b.dz && a.z + a.dz > b.z
);

/**
 * 承压向下传递（压强模型）：新块总重 W 均摊到支撑面积上，得到压强 p = W / supportArea；
 * 支撑块每个底层纸箱承受 p × 箱底面积 + 自身 (nz−1) 层重量，不得超过 maxStackKg。
 * 落到支撑块上的重量再按其自身支撑面积继续向下传递。
 * @returns {Map<object, number>|null} 各祖先块新增的顶部压强；任一超限返回 null
 */
const collectLoad = (refs, supportArea, weightKg, acc = new Map()) => {
  if (weightKg <= 0 || supportArea <= 0) return acc;
  const pressure = weightKg / supportArea;
  for (const { block, overlap } of refs) {
    acc.set(block, (acc.get(block) || 0) + pressure);
    collectLoad(block.supportRefs, block.supportArea, pressure * overlap, acc);
  }
  return acc;
};

const loadWithinLimits = (acc) => [...acc].every(([block, pressure]) => (
  (block.nz - 1) * block.kgEach + (block.pTop + pressure) * block.cartonArea <= block.maxStackKg + EPS
));

/**
 * 每个底层纸箱（nx×ny 网格的一格）的底面都须有 ≥ minRatio 的面积落在下方块顶面；块平均支撑会漏掉悬空的单箱。
 * @returns {number} 沿 x 满足条件的最长列前缀（0 表示首列即不合格）
 */
const supportedColumns = (blocks, ep, o, nx, ny, minRatio) => {
  const cols = new Float64Array(nx * ny);
  const x1 = ep.x + nx * o.l;
  const y1 = ep.y + ny * o.w;
  for (const b of blocks) {
    if (b.z + b.dz !== ep.z || b.x >= x1 || b.x + b.dx <= ep.x || b.y >= y1 || b.y + b.dy <= ep.y) continue;
    const iLo = Math.max(0, Math.floor((b.x - ep.x) / o.l));
    const iHi = Math.min(nx - 1, Math.ceil((b.x + b.dx - ep.x) / o.l) - 1);
    const jLo = Math.max(0, Math.floor((b.y - ep.y) / o.w));
    const jHi = Math.min(ny - 1, Math.ceil((b.y + b.dy - ep.y) / o.w) - 1);
    for (let i = iLo; i <= iHi; i += 1) {
      const ox = Math.min(ep.x + (i + 1) * o.l, b.x + b.dx) - Math.max(ep.x + i * o.l, b.x);
      for (let j = jLo; j <= jHi; j += 1) {
        const oy = Math.min(ep.y + (j + 1) * o.w, b.y + b.dy) - Math.max(ep.y + j * o.w, b.y);
        if (ox > 0 && oy > 0) cols[i * ny + j] += ox * oy;
      }
    }
  }
  const need = minRatio * o.l * o.w - 1e-6;
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) if (cols[i * ny + j] < need) return i;
  }
  return nx;
};

/** 在极值点 ep 用朝向 o 为 line 造最大的合法块；无合法块返回 null。 */
const formBlock = (ctx, ep, o, work) => {
  const { usable, blocks, minSupportRatio, payloadCap } = ctx;
  const { line } = work;
  const nxMax = Math.floor((usable.length - ep.x) / o.l);
  const nyMax = Math.floor((usable.width - ep.y) / o.w);
  const nzFit = Math.floor((usable.height - ep.z) / o.h);
  if (nxMax < 1 || nyMax < 1 || nzFit < 1 || ctx.budget <= 0) return null;

  const kg = line.kgPerCarton;
  const byWeight = kg > 0 ? Math.floor((payloadCap - ctx.weight + EPS) / kg) : Infinity;
  const limit = Math.min(work.left, byWeight);
  if (limit < 1) return null;
  const stackCap = kg > 0 ? Math.floor(line.maxStackKg / kg + EPS) + 1 : Infinity;
  const nzCap = Math.min(nzFit, stackCap);
  // 重货沿柜长摊开，重心不偏一端。
  const nzTarget = line.heavy ? Math.min(nzCap, Math.max(1, Math.ceil(limit / (nxMax * nyMax)))) : nzCap;

  for (let nz = nzTarget; nz >= 1; nz -= 1) {
    let best = null;
    for (let ny = Math.min(nyMax, Math.ceil(limit / nz)); ny >= 1; ny -= 1) {
      ctx.budget -= blocks.length + 1;
      if (ctx.budget <= 0) return best;
      const yEnd = ep.y + ny * o.w;
      const zEnd = ep.z + nz * o.h;
      let xLimit = usable.length;
      let blocked = false;
      for (const b of blocks) {
        if (b.y < yEnd && b.y + b.dy > ep.y && b.z < zEnd && b.z + b.dz > ep.z && b.x + b.dx > ep.x) {
          if (b.x <= ep.x) { blocked = true; break; }
          xLimit = Math.min(xLimit, b.x);
        }
      }
      if (blocked) continue;
      let nx = Math.min(nxMax, Math.floor((xLimit - ep.x) / o.l));
      if (nx < 1) continue;

      let shapeNy = ny;
      let shapeNz = nz;
      if (nx * ny * nz > limit) {
        if (limit >= ny * nz) nx = Math.floor(limit / (ny * nz));
        else { nx = 1; shapeNy = Math.min(ny, limit); shapeNz = Math.max(1, Math.floor(limit / shapeNy)); }
      }
      let cartons = nx * shapeNy * shapeNz;
      if (best && cartons <= best.cartons) continue;

      const supportRefs = [];
      let supportArea = 0;
      if (ep.z > 0) {
        // 逐箱支撑：沿 x 取每个底层纸箱都够支撑的最长前缀，其余列留给后续块。
        nx = supportedColumns(blocks, ep, o, nx, shapeNy, minSupportRatio);
        if (nx < 1) continue;
        cartons = nx * shapeNy * shapeNz;
        if (best && cartons <= best.cartons) continue;
      }
      const candidate = { x: ep.x, y: ep.y, z: ep.z, nx, ny: shapeNy, nz: shapeNz, o };
      const dx = nx * o.l;
      const dy = shapeNy * o.w;
      if (ep.z > 0) {
        for (const b of blocks) {
          if (b.z + b.dz !== ep.z) continue;
          const ox = Math.min(ep.x + dx, b.x + b.dx) - Math.max(ep.x, b.x);
          const oy = Math.min(ep.y + dy, b.y + b.dy) - Math.max(ep.y, b.y);
          if (ox > 0 && oy > 0) { supportArea += ox * oy; supportRefs.push({ block: b, overlap: ox * oy }); }
        }
        if (line.heavy && supportRefs.some(({ block }) => !block.heavy)) continue;
        if (kg > 0 && !loadWithinLimits(collectLoad(supportRefs, supportArea, cartons * kg))) continue;
      }
      best = { ...candidate, cartons, supportRefs, supportArea };
    }
    if (best) return best;
  }
  return null;
};

const betterBlock = (a, b) => {
  if (!b) return true;
  if (a.cartons !== b.cartons) return a.cartons > b.cartons;
  return a.z + a.nz * a.o.h < b.z + b.nz * b.o.h;
};

const byXzy = (a, b) => a.x - b.x || a.z - b.z || a.y - b.y;

const packOne = (works, ctx) => {
  const blocks = [];
  let eps = [{ x: 0, y: 0, z: 0 }];
  ctx.blocks = blocks;
  ctx.weight = 0;

  const place = (work, found) => {
    const { o } = found;
    const block = {
      x: found.x, y: found.y, z: found.z,
      dx: found.nx * o.l, dy: found.ny * o.w, dz: found.nz * o.h,
      nx: found.nx, ny: found.ny, nz: found.nz,
      o, lineId: work.line.lineId, cartons: found.cartons,
      kgEach: work.line.kgPerCarton, kg: found.cartons * work.line.kgPerCarton,
      heavy: work.line.heavy, maxStackKg: work.line.maxStackKg,
      cartonArea: o.l * o.w, pTop: 0, supportRefs: found.supportRefs, supportArea: found.supportArea,
    };
    for (const [ancestor, pressure] of collectLoad(found.supportRefs, found.supportArea, block.kg)) {
      ancestor.pTop += pressure;
    }
    blocks.push(block);
    ctx.weight += block.kg;
    work.left -= found.cartons;

    const covered = (point) => point.x >= block.x && point.x < block.x + block.dx
      && point.y >= block.y && point.y < block.y + block.dy
      && point.z >= block.z && point.z < block.z + block.dz;
    // 悬在下层之上的块（如高出底座边缘一点）会遮住其外侧的地面；侧面极值点同时投影到其正下方的最高承托面。
    const dropped = (point) => {
      let z = 0;
      for (const other of blocks) {
        if (other !== block && other.z + other.dz <= point.z && other.x <= point.x && point.x < other.x + other.dx
          && other.y <= point.y && point.y < other.y + other.dy) z = Math.max(z, other.z + other.dz);
      }
      return { ...point, z };
    };
    const sides = [
      { x: block.x + block.dx, y: block.y, z: block.z },
      { x: block.x, y: block.y + block.dy, z: block.z },
    ];
    const next = [
      ...eps.filter((point) => !covered(point)),
      ...sides,
      ...(block.z > 0 ? sides.map(dropped).filter((point) => point.z < block.z) : []),
      { x: block.x, y: block.y, z: block.z + block.dz },
    ].filter((point) => point.x < ctx.usable.length && point.y < ctx.usable.width && point.z < ctx.usable.height)
      .sort(byXzy);
    eps = next.filter((point, index) => index === 0 || byXzy(point, next[index - 1]) !== 0);
  };

  const findBlock = (work) => {
    for (const ep of eps) {
      let best = null;
      for (const o of work.orients) {
        const candidate = formBlock(ctx, ep, o, work);
        if (candidate && betterBlock(candidate, best)) best = candidate;
      }
      if (best) return best;
    }
    return null;
  };

  // 逐行按优先级装；某行装不下后继续后续行，扫一遍后再回头补缝，直到无进展。
  let progress = true;
  while (progress && blocks.length < MAX_BLOCKS_PER_CONTAINER && ctx.budget > 0) {
    progress = false;
    for (const work of works) {
      while (work.left > 0 && blocks.length < MAX_BLOCKS_PER_CONTAINER && ctx.budget > 0) {
        const found = findBlock(work);
        if (!found) break;
        place(work, found);
        progress = true;
      }
    }
  }
  return blocks;
};

const priority = (a, b) => (
  (b.line.heavy - a.line.heavy)
  || (a.line.heavy ? b.density - a.density : 0)
  || b.baseArea - a.baseArea
  || b.height - a.height
  || (a.line.lineId < b.line.lineId ? -1 : a.line.lineId > b.line.lineId ? 1 : 0)
);

const unplacedEntry = (line, cartons, reason) => ({
  lineId: line.lineId, name: line.name, cartons, reason, cartonMm: line.cartonMm,
});

/**
 * 多柜装柜计划：一次一柜，放不下的转入下一个同型柜；无法进任何空柜的箱进入 unplaced。
 * @returns {{ containers: object[], unplaced: Array<{ lineId, name, cartons, reason, cartonMm }> }}
 */
const packContainers = (lines, spec, config = loadContainerConfig(), { budget = COMPUTE_BUDGET } = {}) => {
  const usable = usableMm(spec, config);
  const payloadCap = Math.min(spec.safeGrossKg, spec.maxPayloadKg);
  const unplaced = [];
  const works = [];

  for (const line of lines) {
    // 入口再校验一次：直接传入的归一化行同样不得带 0/小数/非有限边长。
    const dims = line.cartonMm;
    if (!dims || !isValidMm(dims.length) || !isValidMm(dims.width) || !isValidMm(dims.height)) {
      unplaced.push(unplacedEntry(line, line.cartons, 'missing-dimensions'));
      continue;
    }
    const fits = orientationsFor(line)
      .filter((o) => o.l <= usable.length && o.w <= usable.width && o.h <= usable.height);
    if (fits.length === 0) { unplaced.push(unplacedEntry(line, line.cartons, 'oversize')); continue; }
    const orients = fits.filter((o) => o.w <= spec.doorMm.width && o.h <= spec.doorMm.height);
    if (orients.length === 0) { unplaced.push(unplacedEntry(line, line.cartons, 'door')); continue; }
    const first = orients[0];
    works.push({
      line, orients, left: line.cartons,
      density: (line.kgPerCarton * 1e9) / (first.l * first.w * first.h),
      baseArea: first.l * first.w, height: first.h,
    });
  }
  works.sort(priority);

  const ctx = { usable, minSupportRatio: config.minSupportRatio, payloadCap, blocks: [], weight: 0, budget };
  const containers = [];
  const lineById = new Map(lines.map((line) => [line.lineId, line]));
  while (works.some((work) => work.left > 0) && containers.length < MAX_CONTAINERS && ctx.budget > 0) {
    const blocks = packOne(works, ctx);
    if (blocks.length === 0) break;
    let step = 0;
    const placed = blocks.map((block) => ({
      step: (step += 1),
      lineId: block.lineId,
      x: block.x, y: block.y, z: block.z,
      nx: block.nx, ny: block.ny, nz: block.nz,
      cartonMm: { length: block.o.l, width: block.o.w, height: block.o.h },
      cartons: block.cartons,
      kg: round3(block.kg),
    }));
    const grossKg = round3(blocks.reduce((sum, block) => sum + block.kg, 0));
    const cargoCbm = round3(blocks.reduce((sum, block) => sum + (block.dx * block.dy * block.dz) / 1e9, 0));
    const moment = blocks.reduce((sum, block) => sum + block.kg * (block.x + block.dx / 2), 0);
    containers.push({
      index: containers.length,
      blocks: placed,
      cartons: blocks.reduce((sum, block) => sum + block.cartons, 0),
      grossKg,
      cargoCbm,
      weightPct: (grossKg / spec.safeGrossKg) * 100,
      volumePct: (cargoCbm / spec.safeVolumeCbm) * 100,
      usedHeightMm: Math.max(...blocks.map((block) => block.z + block.dz)),
      cogXmm: Math.round(grossKg > 0 ? moment / grossKg : usable.length / 2),
    });
  }
  for (const work of works) {
    if (work.left > 0) unplaced.push(unplacedEntry(lineById.get(work.line.lineId), work.left, 'no-space'));
  }
  return { containers, unplaced };
};

module.exports = { usableMm, toCartonLines, packContainers, orientationsFor };
