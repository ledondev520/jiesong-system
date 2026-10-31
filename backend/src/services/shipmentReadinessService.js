/**
 * Input: 装箱明细、柜型规格（config/containers.json，默认 40HQ）、containerPacking 的多柜装柜计划
 * Output: 利用率判定 checkUtilisation、完整装柜检查 evaluateLoadingCheck、装柜计划 buildLoadingPlan、兼容旧调用方的 evaluateShipmentReadiness
 * Pos: 出口合同确认发运前的权威门槛；柜型尺寸与限值只来自 containerSpecs，排柜只来自 containerPacking
 */

const { getContainerSpec, listContainerTypes, loadContainerConfig } = require('./containerSpecs');
const { toCartonLines, packContainers, usableMm } = require('./containerPacking');

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
    containerType: spec.code,
    thresholdPct,
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
 *   containers: Array<{ index: number, cartons: number, cogXmm: number }>,
 *   unplaced: Array<{ name: string, cartons: number, reason: string, cartonMm?: object }> }} plan
 * @param {{ packingLineCount: number, linesMissingBoxes: number }} facts
 */
const evaluateLoadingCheck = (plan, facts) => {
  const { spec, totals } = plan;
  const containers = plan.containers || [];
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
    add('oversize', `${entry.name} 箱规 ${dimsText(entry.cartonMm)} mm 超过${type}内尺寸或柜门，无法装入`);
  }
  // 首柜之外的箱子（溢出柜 + 任何柜都放不进的箱）都意味着一个柜装不下。
  const overflowCartons = containers.slice(1).reduce((sum, container) => sum + container.cartons, 0)
    + plan.unplaced.filter((item) => item.reason === 'no-space').reduce((sum, item) => sum + item.cartons, 0);
  // 汇总已超限时“超重/超体积”已说明一个柜装不下，不再重复提示溢出。
  if (overflowCartons > 0 && util.overReasons.length === 0) {
    add('unplaced', `仍有 ${overflowCartons} 箱装不下，共需 ${Math.max(2, containers.length)} 个${type}，请拆分订单或更换柜型`);
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

  const halfLength = usableMm(spec).length / 2;
  for (const container of containers) {
    const offset = container.cogXmm - halfLength;
    if (Math.abs(offset) > halfLength * 0.2) {
      const prefix = containers.length > 1 ? `第 ${container.index + 1} 柜` : '';
      warnings.push({
        code: 'cog-offset',
        message: `${prefix}重心偏${offset > 0 ? '前' : '后'} ${(Math.abs(offset) / 1000).toFixed(2)} m，建议重新分布重货`,
      });
    }
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

/** 汇总量取自装箱明细（与 recalculateContractStats 一致），不信任可编辑的合同头。 */
const sumTotals = (packingItems) => ({
  cartons: packingItems.reduce((sum, item) => sum + Math.max(0, Math.trunc(toNumber(item.boxes))), 0),
  grossKg: packingItems.reduce((sum, item) => sum + Math.max(0, toNumber(item.grossWeight)), 0),
  cargoCbm: packingItems.reduce((sum, item) => sum + Math.max(0, toNumber(item.volume)), 0),
});

/**
 * 装柜计划（含检查）。utilisationOnly：历史数据只看汇总利用率，不排柜。
 * @param {{ packingItems?: object[] }} salesContract
 * @param {{ containerType?: string, utilisationOnly?: boolean }} options
 */
const buildLoadingPlan = (salesContract, { containerType, utilisationOnly = false } = {}) => {
  const config = loadContainerConfig();
  const spec = getContainerSpec(containerType);
  const packingItems = salesContract.packingItems || [];
  const totals = sumTotals(packingItems);
  const linesMissingBoxes = packingItems.filter((item) => toNumber(item.boxes) <= 0).length;

  const lines = utilisationOnly ? [] : toCartonLines(packingItems, spec, config);
  const packed = packContainers(lines, spec, config);
  const plan = {
    algorithm: 'block-ep-v1',
    containerType: spec.code,
    container: { ...spec, usableMm: usableMm(spec, config) },
    availableTypes: listContainerTypes(),
    lines,
    containers: packed.containers,
    unplaced: packed.unplaced,
    totals,
  };
  const check = evaluateLoadingCheck(
    { spec, totals, lines, containers: packed.containers, unplaced: packed.unplaced },
    { packingLineCount: packingItems.length, linesMissingBoxes },
  );
  return { plan: { ...plan, check }, spec, linesMissingBoxes };
};

/**
 * 兼容 salesService / tradeWorkflowService：返回旧字段并附带 check 与 plan。
 * 门槛按单个柜判定：首柜之外的箱都算“没装下”。
 */
const evaluateShipmentReadiness = (salesContract, options = {}) => {
  const { plan, spec, linesMissingBoxes } = buildLoadingPlan(salesContract, options);
  const { check, totals, lines } = plan;
  const util = checkUtilisation(totals, spec, check.thresholdPct);
  const placedBoxCount = plan.containers.reduce((sum, container) => sum + container.cartons, 0);
  const firstContainerCartons = plan.containers[0]?.cartons ?? 0;
  const unplacedBoxCount = plan.unplaced.reduce((sum, item) => sum + item.cartons, 0) + placedBoxCount - firstContainerCartons;

  return {
    weightPct: check.weightPct,
    volumePct: check.volumePct,
    utilizationReady: util.utilisationReady,
    overloaded: util.overReasons.length > 0,
    overloadReasons: util.overReasons,
    physicalFit: unplacedBoxCount === 0 && totals.cartons > 0 && linesMissingBoxes === 0
      && !lines.some((line) => line.dimsSource === 'missing'),
    placedBoxCount: firstContainerCartons,
    unplacedBoxCount,
    estimatedDimensionCount: lines.filter((line) => line.dimsSource === 'estimated')
      .reduce((sum, line) => sum + line.cartons, 0),
    missingBoxItemCount: linesMissingBoxes,
    blockers: check.blockers.map((item) => item.code),
    ready: check.ready,
    check,
    plan,
  };
};

module.exports = {
  checkUtilisation,
  evaluateLoadingCheck,
  buildLoadingPlan,
  evaluateShipmentReadiness,
};
