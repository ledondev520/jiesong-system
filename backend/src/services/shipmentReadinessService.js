/**
 * Input: 装箱明细、柜型规格（config/containers.json，默认 40HQ）
 * Output: 利用率判定 checkUtilisation、完整装柜检查 evaluateLoadingCheck、兼容旧调用方的 evaluateShipmentReadiness
 * Pos: 出口合同确认发运前的权威门槛；柜型尺寸与限值只来自 containerSpecs
 *
 * C2 仍用本文件内的旧排柜算法判断“装得下”；C3 将替换为 containerPacking.js 并输出同形状的 plan。
 */

const { getContainerSpec, loadContainerConfig } = require('./containerSpecs');

const BOX_GAP_MM = 10;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundTo1 = (value) => Number(value.toFixed(1));

/** 展示用百分比：未达阈值时绝不显示成阈值本身（79.95 不能写成 80.0）。 */
const formatPct = (pct, thresholdPct) => {
  const text = pct.toFixed(1);
  return pct < thresholdPct && Number(text) >= thresholdPct ? (Math.floor(pct * 10) / 10).toFixed(1) : text;
};

/**
 * 仅按汇总量判断利用率，不排柜；列表页使用。比较一律用未取整的百分比。
 * @param {{ grossKg: number, cargoCbm: number }} totals
 * @param {{ safeGrossKg: number, safeVolumeCbm: number }} spec
 * @param {number} thresholdPct
 */
const checkUtilisation = (totals, spec, thresholdPct = loadContainerConfig().readyThresholdPct) => {
  const grossKg = Math.max(0, toNumber(totals?.grossKg));
  const cargoCbm = Math.max(0, toNumber(totals?.cargoCbm));
  const weightPct = (grossKg / spec.safeGrossKg) * 100;
  const volumePct = (cargoCbm / spec.safeVolumeCbm) * 100;
  const weightOk = weightPct >= thresholdPct;
  const volumeOk = volumePct >= thresholdPct;
  const overReasons = [];
  if (grossKg > spec.safeGrossKg) overReasons.push('weight');
  if (cargoCbm > spec.safeVolumeCbm) overReasons.push('volume');
  return {
    weightPct,
    volumePct,
    reachedBy: weightOk && volumeOk ? 'both' : weightOk ? 'weight' : volumeOk ? 'volume' : 'none',
    utilisationReady: weightOk || volumeOk,
    overReasons,
  };
};

const dimsText = (dims) => (dims ? `${dims.length}×${dims.width}×${dims.height}` : '');

/**
 * 在装柜计划上执行完整检查（PRD:138：任一指标 ≥ 阈值，且全部箱装得下，且不超限）。
 * @param {{ spec: object, totals: { cartons: number, grossKg: number, cargoCbm: number },
 *   lines: Array<{ name: string, cartons: number, dimsSource: string }>,
 *   unplaced: Array<{ name: string, cartons: number, reason: string, cartonMm?: object }> }} plan
 * @param {{ packingLineCount: number, linesMissingBoxes: number }} facts
 */
const evaluateLoadingCheck = (plan, facts) => {
  const { spec, totals } = plan;
  const thresholdPct = loadContainerConfig().readyThresholdPct;
  const util = checkUtilisation(totals, spec, thresholdPct);
  const type = spec.code;
  const blockers = [];
  const add = (code, message) => blockers.push({ code, message });

  if (facts.packingLineCount === 0) add('missing-packing-items', '尚未录入装箱明细');
  if (facts.linesMissingBoxes > 0) add('missing-box-count', `${facts.linesMissingBoxes} 行装箱明细未填写箱数`);
  for (const line of plan.lines) {
    if (line.dimsSource === 'missing') {
      add('missing-dimensions', `${line.name} 缺少箱规和体积，无法排柜，请补充箱规（长×宽×高）`);
    }
  }
  if (util.overReasons.includes('weight')) {
    add('over-weight', `超重：毛重 ${roundTo1(totals.grossKg)} kg，超过${type}安全上限 ${spec.safeGrossKg} kg`);
  }
  if (util.overReasons.includes('volume')) {
    add('over-volume', `超体积：${roundTo1(totals.cargoCbm)} CBM，超过${type}安全上限 ${spec.safeVolumeCbm} CBM`);
  }
  for (const entry of plan.unplaced.filter((item) => item.reason === 'oversize' || item.reason === 'door')) {
    add('oversize', `${entry.name} 箱规 ${dimsText(entry.cartonMm)} mm 超过${type}内尺寸，无法装入`);
  }
  const unplacedCartons = plan.unplaced
    .filter((item) => item.reason === 'no-space')
    .reduce((sum, item) => sum + item.cartons, 0);
  if (unplacedCartons > 0) {
    // shortcut: C2 只有单柜排柜，所需柜数取容量下限；C3 改用多柜计划的真实柜数。
    const needed = Math.max(2, Math.ceil(totals.cargoCbm / spec.safeVolumeCbm), Math.ceil(totals.grossKg / spec.safeGrossKg));
    add('unplaced', `仍有 ${unplacedCartons} 箱装不下，共需 ${needed} 个${type}，请拆分订单或更换柜型`);
  }
  if (!util.utilisationReady) {
    const { weightPct, volumePct } = util;
    add('under-utilised', `未达出柜标准：体积 ${formatPct(volumePct, thresholdPct)}%、毛重 ${formatPct(weightPct, thresholdPct)}%，任一需达到 ${thresholdPct}%`);
  }

  const warnings = [];
  const estimatedLines = plan.lines.filter((line) => line.dimsSource === 'estimated').length;
  if (estimatedLines > 0) {
    warnings.push({
      code: 'estimated',
      message: `${estimatedLines} 行箱规为估算（按体积÷箱数推算），装柜结果仅供参考，请补充实际箱规`,
    });
  }

  const hardBlockers = blockers.filter((item) => item.code !== 'under-utilised');
  const ready = blockers.length === 0;
  return {
    ready,
    containerType: type,
    status: hardBlockers.length > 0 ? 'blocked' : ready ? 'ready' : 'under-utilised',
    weightPct: util.weightPct,
    volumePct: util.volumePct,
    thresholdPct,
    reachedBy: util.reachedBy,
    blockers,
    warnings,
    headline: blockers[0]?.message
      || `可出柜：体积 ${formatPct(util.volumePct, thresholdPct)}%、毛重 ${formatPct(util.weightPct, thresholdPct)}%，全部 ${totals.cartons} 箱已装入 1 个${type}`,
  };
};

// ---- 旧排柜算法（C3 替换）：按箱展开后做空间切分 ----

const inferBoxDimensions = (volumeCbm, inner) => {
  const base = Math.cbrt((volumeCbm * 1e9) / 0.96);
  const clamp = (value, max) => Math.round(Math.max(100, Math.min(value, max)));
  return {
    length: clamp(base * 1.2, inner.length),
    width: clamp(base, inner.width),
    height: clamp(base * 0.8, inner.height),
  };
};

/** 每行装箱明细一条；无箱规且无体积时标记 missing，不再伪造箱子。 */
const buildPlanLines = (packingItems, inner) => packingItems.flatMap((item) => {
  const cartons = Math.max(0, Math.trunc(toNumber(item.boxes)));
  if (cartons === 0) return [];

  const product = item.product || {};
  const name = product.customsName || product.name || '未知商品';
  const hasItemDimensions = item.length && item.width && item.height;
  const hasProductDimensions = product.length && product.width && product.height;
  if (hasItemDimensions || hasProductDimensions) {
    const source = hasItemDimensions ? item : product;
    return [{
      lineId: item.id, name, cartons, dimsSource: hasItemDimensions ? 'line' : 'product',
      cartonMm: { length: toNumber(source.length), width: toNumber(source.width), height: toNumber(source.height) },
    }];
  }

  const itemVolume = toNumber(item.volume);
  const productVolume = toNumber(product.volume);
  const perCartonCbm = itemVolume > 0
    ? itemVolume / cartons
    : productVolume > 0 ? (productVolume * toNumber(item.quantity)) / cartons : 0;
  if (perCartonCbm <= 0) return [{ lineId: item.id, name, cartons, dimsSource: 'missing', cartonMm: null }];
  return [{ lineId: item.id, name, cartons, dimsSource: 'estimated', cartonMm: inferBoxDimensions(perCartonCbm, inner) }];
});

const packBoxes = (boxes, inner) => {
  const placed = [];
  const unplaced = [];
  const spaces = [{ x: 0, y: 0, z: 0, length: inner.length, width: inner.width, height: inner.height }];

  const sorted = [...boxes].sort((a, b) => (
    (b.length * b.width * b.height) - (a.length * a.width * a.height)
  ));

  for (const box of sorted) {
    let wasPlaced = false;
    spaces.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    const orientations = [
      { length: box.length, width: box.width },
      { length: box.width, width: box.length },
    ];

    for (let index = 0; index < spaces.length && !wasPlaced; index += 1) {
      const space = spaces[index];
      for (const orientation of orientations) {
        if (orientation.length > space.length || orientation.width > space.width || box.height > space.height) continue;

        placed.push(box);
        spaces.splice(index, 1);
        if (space.length - orientation.length - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x + orientation.length + BOX_GAP_MM, y: space.y, z: space.z,
            length: space.length - orientation.length - BOX_GAP_MM, width: space.width, height: space.height,
          });
        }
        if (space.width - orientation.width - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x, y: space.y + orientation.width + BOX_GAP_MM, z: space.z,
            length: orientation.length, width: space.width - orientation.width - BOX_GAP_MM, height: space.height,
          });
        }
        if (space.height - box.height - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x, y: space.y, z: space.z + box.height + BOX_GAP_MM,
            length: orientation.length, width: orientation.width, height: space.height - box.height - BOX_GAP_MM,
          });
        }
        wasPlaced = true;
        break;
      }
    }
    if (!wasPlaced) unplaced.push(box);
  }
  return { placed, unplaced };
};

const fitsEmptyContainer = (dims, inner) => (
  dims.height <= inner.height
  && ((dims.length <= inner.length && dims.width <= inner.width)
    || (dims.width <= inner.length && dims.length <= inner.width))
);

/** 汇总量取自装箱明细（与 recalculateContractStats 一致），不信任可编辑的合同头。 */
const sumTotals = (packingItems) => ({
  cartons: packingItems.reduce((sum, item) => sum + Math.max(0, Math.trunc(toNumber(item.boxes))), 0),
  grossKg: packingItems.reduce((sum, item) => sum + Math.max(0, toNumber(item.grossWeight)), 0),
  cargoCbm: packingItems.reduce((sum, item) => sum + Math.max(0, toNumber(item.volume)), 0),
});

/**
 * 兼容 salesService / tradeWorkflowService：返回旧字段并附带 check。
 * @param {{ packingItems?: object[] }} salesContract
 * @param {{ containerType?: string, utilisationOnly?: boolean }} options utilisationOnly：历史数据不排柜
 */
const evaluateShipmentReadiness = (salesContract, { containerType, utilisationOnly = false } = {}) => {
  const spec = getContainerSpec(containerType);
  const packingItems = salesContract.packingItems || [];
  const totals = sumTotals(packingItems);
  const linesMissingBoxes = packingItems.filter((item) => toNumber(item.boxes) <= 0).length;

  const lines = utilisationOnly ? [] : buildPlanLines(packingItems, spec.innerMm);
  const boxes = lines.filter((line) => line.cartonMm).flatMap((line) => Array.from({ length: line.cartons }, () => ({
    ...line.cartonMm, lineId: line.lineId, name: line.name,
  })));
  const packed = packBoxes(boxes, spec.innerMm);

  const unplacedByLine = new Map();
  for (const box of packed.unplaced) {
    const reason = fitsEmptyContainer(box, spec.innerMm) ? 'no-space' : 'oversize';
    const key = `${box.lineId}:${reason}`;
    const entry = unplacedByLine.get(key) || {
      lineId: box.lineId, name: box.name, reason, cartons: 0,
      cartonMm: { length: box.length, width: box.width, height: box.height },
    };
    entry.cartons += 1;
    unplacedByLine.set(key, entry);
  }

  const check = evaluateLoadingCheck(
    { spec, totals, lines, unplaced: [...unplacedByLine.values()] },
    { packingLineCount: packingItems.length, linesMissingBoxes },
  );
  const overloadReasons = [];
  if (check.blockers.some((item) => item.code === 'over-weight')) overloadReasons.push('weight');
  if (check.blockers.some((item) => item.code === 'over-volume')) overloadReasons.push('volume');
  const util = checkUtilisation(totals, spec, check.thresholdPct);

  return {
    weightPct: check.weightPct,
    volumePct: check.volumePct,
    utilizationReady: util.utilisationReady,
    overloaded: overloadReasons.length > 0,
    overloadReasons,
    physicalFit: packed.unplaced.length === 0 && totals.cartons > 0 && linesMissingBoxes === 0
      && !lines.some((line) => line.dimsSource === 'missing'),
    placedBoxCount: packed.placed.length,
    unplacedBoxCount: packed.unplaced.length,
    estimatedDimensionCount: lines.filter((line) => line.dimsSource === 'estimated')
      .reduce((sum, line) => sum + line.cartons, 0),
    missingBoxItemCount: linesMissingBoxes,
    blockers: check.blockers.map((item) => item.code),
    ready: check.ready,
    check,
  };
};

module.exports = {
  checkUtilisation,
  evaluateLoadingCheck,
  evaluateShipmentReadiness,
};
