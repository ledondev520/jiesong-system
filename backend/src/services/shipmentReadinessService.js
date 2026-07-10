/**
 * Input: 40HQ 汇总指标与装箱明细
 * Output: 商业利用率、安全上限、物理可装载性与阻塞原因
 * Pos: 出口合同确认发运前的权威门槛
 */

const CONTAINER_40HQ = Object.freeze({
  length: 12030,
  width: 2350,
  height: 2690,
  maxVolume: 68,
  maxWeight: 22000,
});

const SHIPPING_READY_THRESHOLD_PCT = 80;
const BOX_GAP_MM = 10;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const inferBoxDimensions = (volumeCbm) => {
  if (!volumeCbm || volumeCbm <= 0) {
    return { length: 500, width: 400, height: 300, estimated: true };
  }
  const base = Math.cbrt((volumeCbm * 1e9) / 0.96);
  const clamp = (value, max) => Math.round(Math.max(100, Math.min(value, max)));
  return {
    length: clamp(base * 1.2, CONTAINER_40HQ.length),
    width: clamp(base, CONTAINER_40HQ.width),
    height: clamp(base * 0.8, CONTAINER_40HQ.height),
    estimated: true,
  };
};

const buildBoxes = (packingItems = []) => packingItems.flatMap((item) => {
  const boxCount = Math.max(0, Math.trunc(toNumber(item.boxes)));
  if (boxCount === 0) return [];

  const product = item.product || {};
  const hasItemDimensions = item.length && item.width && item.height;
  const hasProductDimensions = product.length && product.width && product.height;
  let dimensions;

  if (hasItemDimensions || hasProductDimensions) {
    dimensions = {
      length: toNumber(hasItemDimensions ? item.length : product.length),
      width: toNumber(hasItemDimensions ? item.width : product.width),
      height: toNumber(hasItemDimensions ? item.height : product.height),
      estimated: false,
    };
  } else {
    const itemVolume = toNumber(item.volume);
    const productVolume = toNumber(product.volume);
    const itemQuantity = toNumber(item.quantity);
    const perBoxCbm = itemVolume > 0
      ? itemVolume / boxCount
      : productVolume > 0
        ? (productVolume * itemQuantity) / boxCount
        : 0;
    dimensions = inferBoxDimensions(perBoxCbm);
  }

  return Array.from({ length: boxCount }, (_, index) => ({
    id: `${item.id}-${index}`,
    itemId: item.id,
    name: product.customsName || product.name || '未知商品',
    ...dimensions,
  }));
});

const packBoxes = (boxes) => {
  const placed = [];
  const unplaced = [];
  const spaces = [{
    x: 0,
    y: 0,
    z: 0,
    length: CONTAINER_40HQ.length,
    width: CONTAINER_40HQ.width,
    height: CONTAINER_40HQ.height,
  }];

  const sorted = [...boxes].sort((a, b) => (
    (b.length * b.width * b.height) - (a.length * a.width * a.height)
  ));

  for (const box of sorted) {
    let wasPlaced = false;
    spaces.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);
    const orientations = [
      { length: box.length, width: box.width, rotated: false },
      { length: box.width, width: box.length, rotated: true },
    ];

    for (let index = 0; index < spaces.length && !wasPlaced; index += 1) {
      const space = spaces[index];
      for (const orientation of orientations) {
        if (
          orientation.length > space.length
          || orientation.width > space.width
          || box.height > space.height
        ) {
          continue;
        }

        placed.push({ ...box, ...orientation, x: space.x, y: space.y, z: space.z });
        spaces.splice(index, 1);

        if (space.length - orientation.length - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x + orientation.length + BOX_GAP_MM,
            y: space.y,
            z: space.z,
            length: space.length - orientation.length - BOX_GAP_MM,
            width: space.width,
            height: space.height,
          });
        }
        if (space.width - orientation.width - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x,
            y: space.y + orientation.width + BOX_GAP_MM,
            z: space.z,
            length: orientation.length,
            width: space.width - orientation.width - BOX_GAP_MM,
            height: space.height,
          });
        }
        if (space.height - box.height - BOX_GAP_MM > 100) {
          spaces.push({
            x: space.x,
            y: space.y,
            z: space.z + box.height + BOX_GAP_MM,
            length: orientation.length,
            width: orientation.width,
            height: space.height - box.height - BOX_GAP_MM,
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

const evaluateShipmentReadiness = ({ grossWeight, volume, packingItems = [] }) => {
  const safeGrossWeight = Math.max(0, toNumber(grossWeight));
  const safeVolume = Math.max(0, toNumber(volume));
  const weightPct = Number(((safeGrossWeight / CONTAINER_40HQ.maxWeight) * 100).toFixed(1));
  const volumePct = Number(((safeVolume / CONTAINER_40HQ.maxVolume) * 100).toFixed(1));
  const utilizationReady = weightPct >= SHIPPING_READY_THRESHOLD_PCT
    || volumePct >= SHIPPING_READY_THRESHOLD_PCT;
  const overloadReasons = [];
  if (safeGrossWeight > CONTAINER_40HQ.maxWeight) overloadReasons.push('weight');
  if (safeVolume > CONTAINER_40HQ.maxVolume) overloadReasons.push('volume');

  const missingBoxItemCount = packingItems.filter((item) => toNumber(item.boxes) <= 0).length;
  const boxes = buildBoxes(packingItems);
  const plan = packBoxes(boxes);
  const blockers = [];
  if (packingItems.length === 0) blockers.push('missing-packing-items');
  if (missingBoxItemCount > 0) blockers.push('missing-box-count');
  if (!utilizationReady) blockers.push('under-utilized');
  if (overloadReasons.length > 0) blockers.push('overloaded');
  if (plan.unplaced.length > 0) blockers.push('physical-overflow');

  return {
    weightPct,
    volumePct,
    utilizationReady,
    overloaded: overloadReasons.length > 0,
    overloadReasons,
    physicalFit: plan.unplaced.length === 0 && boxes.length > 0 && missingBoxItemCount === 0,
    placedBoxCount: plan.placed.length,
    unplacedBoxCount: plan.unplaced.length,
    estimatedDimensionCount: boxes.filter((box) => box.estimated).length,
    missingBoxItemCount,
    blockers,
    ready: blockers.length === 0,
  };
};

module.exports = {
  CONTAINER_40HQ,
  SHIPPING_READY_THRESHOLD_PCT,
  evaluateShipmentReadiness,
};
