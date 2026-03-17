const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const {
  generateNextContractNo,
  normalizeFilterStatus,
  parseNullableNumber,
} = require('./shared/contractUtils');

const DEFAULT_CONTAINER_DIMENSIONS_MM = Object.freeze({
  length: 12032,
  width: 2352,
  height: 2698,
});

const DEFAULT_ITEM_DIMENSION_MM = 500;
const ASCII_GRID_WIDTH = 48;
const ASCII_GRID_HEIGHT = 12;
const ASCII_SYMBOLS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const roundNumber = (value, precision = 3) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(precision));
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const parsed = parseNullableNumber(value, fallback);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return parsed >= 0 ? parsed : fallback;
};

const resolveItemDimension = (item, key) => {
  const direct = parseNullableNumber(item?.[key], null);
  if (direct !== null && direct > 0) {
    return direct;
  }

  const fallback = parseNullableNumber(item?.product?.[key], null);
  if (fallback !== null && fallback > 0) {
    return fallback;
  }

  return DEFAULT_ITEM_DIMENSION_MM;
};

const resolveItemMetric = (item, key, quantity = 1) => {
  const direct = parseNullableNumber(item?.[key], null);
  if (direct !== null && direct >= 0) {
    return direct;
  }

  const perUnit = parseNullableNumber(item?.product?.[key], null);
  if (perUnit !== null && perUnit >= 0) {
    return perUnit * quantity;
  }

  return 0;
};

const buildLayoutItems = (packingItems = [], containerDimensions) => {
  let cursorX = 0;
  let cursorY = 0;
  let cursorZ = 0;
  let rowMaxWidth = 0;
  let layerMaxHeight = 0;
  let maxUsedHeight = 0;

  const items = packingItems.map((item, index) => {
    const quantity = toNonNegativeNumber(item.quantity, 0);
    const boxes = toNonNegativeNumber(item.boxes, 0);
    const length = toNonNegativeNumber(resolveItemDimension(item, 'length'), DEFAULT_ITEM_DIMENSION_MM);
    const width = toNonNegativeNumber(resolveItemDimension(item, 'width'), DEFAULT_ITEM_DIMENSION_MM);
    const height = toNonNegativeNumber(resolveItemDimension(item, 'height'), DEFAULT_ITEM_DIMENSION_MM);

    if (cursorX > 0 && cursorX + length > containerDimensions.length) {
      cursorX = 0;
      cursorY += rowMaxWidth;
      rowMaxWidth = 0;
    }

    if (cursorY > 0 && cursorY + width > containerDimensions.width) {
      cursorX = 0;
      cursorY = 0;
      cursorZ += layerMaxHeight;
      rowMaxWidth = 0;
      layerMaxHeight = 0;
    }

    const overflow = (
      length > containerDimensions.length ||
      width > containerDimensions.width ||
      height > containerDimensions.height ||
      cursorX + length > containerDimensions.length ||
      cursorY + width > containerDimensions.width ||
      cursorZ + height > containerDimensions.height
    );
    const posX = overflow ? null : cursorX;
    const posY = overflow ? null : cursorY;
    const posZ = overflow ? null : cursorZ;
    const symbol = ASCII_SYMBOLS[index % ASCII_SYMBOLS.length];

    const grossWeight = resolveItemMetric(item, 'grossWeight', quantity);
    const netWeight = resolveItemMetric(item, 'netWeight', quantity);
    const volume = resolveItemMetric(item, 'volume', quantity);

    if (!overflow) {
      cursorX += length;
      rowMaxWidth = Math.max(rowMaxWidth, width);
      layerMaxHeight = Math.max(layerMaxHeight, height);
      maxUsedHeight = Math.max(maxUsedHeight, cursorZ + height);
    }

    return {
      id: item.id,
      symbol,
      overflow,
      product: item.product
        ? {
            id: item.product.id,
            name: item.product.name,
            hsCode: item.product.hsCode || null,
            unit: item.product.unit || null,
          }
        : null,
      store: item.store ? { id: item.store.id, name: item.store.name } : null,
      quantity: roundNumber(quantity),
      boxes: Math.trunc(boxes),
      grossWeight: roundNumber(grossWeight),
      netWeight: roundNumber(netWeight),
      volume: roundNumber(volume),
      dimensionsMm: {
        length: roundNumber(length, 2),
        width: roundNumber(width, 2),
        height: roundNumber(height, 2),
      },
      positionMm: {
        x: posX === null ? null : roundNumber(posX, 2),
        y: posY === null ? null : roundNumber(posY, 2),
        z: posZ === null ? null : roundNumber(posZ, 2),
      },
      note: item.note || null,
    };
  });

  return {
    items,
    maxUsedHeight: roundNumber(maxUsedHeight, 2),
  };
};

const buildAsciiArt = (layoutItems = [], containerDimensions) => {
  const grid = Array.from({ length: ASCII_GRID_HEIGHT }, () => Array(ASCII_GRID_WIDTH).fill('.'));

  const toGridX = (value) => Math.floor((value / containerDimensions.length) * ASCII_GRID_WIDTH);
  const toGridY = (value) => Math.floor((value / containerDimensions.width) * ASCII_GRID_HEIGHT);

  layoutItems.forEach((item) => {
    if (item.overflow || !item.positionMm || item.positionMm.x === null || item.positionMm.y === null) {
      return;
    }

    const xStart = Math.max(0, Math.min(ASCII_GRID_WIDTH - 1, toGridX(item.positionMm.x)));
    const xEnd = Math.max(
      xStart + 1,
      Math.min(
        ASCII_GRID_WIDTH,
        Math.ceil(((item.positionMm.x + item.dimensionsMm.length) / containerDimensions.length) * ASCII_GRID_WIDTH)
      )
    );

    const yStart = Math.max(0, Math.min(ASCII_GRID_HEIGHT - 1, toGridY(item.positionMm.y)));
    const yEnd = Math.max(
      yStart + 1,
      Math.min(
        ASCII_GRID_HEIGHT,
        Math.ceil(((item.positionMm.y + item.dimensionsMm.width) / containerDimensions.width) * ASCII_GRID_HEIGHT)
      )
    );

    for (let y = yStart; y < yEnd; y += 1) {
      for (let x = xStart; x < xEnd; x += 1) {
        grid[y][x] = item.symbol;
      }
    }
  });

  const border = `+${'-'.repeat(ASCII_GRID_WIDTH)}+`;
  const body = grid.map((row) => `|${row.join('')}|`);
  const legend = layoutItems.map((item) => {
    const productName = item.product?.name || 'Unknown Product';
    const overflowTag = item.overflow ? ' [OVERFLOW]' : '';
    return `${item.symbol}=${productName} qty:${item.quantity} boxes:${item.boxes}${overflowTag}`;
  });

  const text = [border, ...body, border, `Legend (${layoutItems.length}):`, ...legend].join('\n');
  return {
    width: ASCII_GRID_WIDTH,
    height: ASCII_GRID_HEIGHT,
    text,
    legend,
  };
};

const generateNextContainerNo = async (portId) => {
  const year = new Date().getFullYear().toString().slice(-2);
  if (!portId) {
    return generateNextContractNo({ prisma, year });
  }

  const port = await prisma.port.findUnique({
    where: { id: portId },
    select: { code: true },
  });

  if (portId) {
    return generateNextContractNo({
      prisma,
      year,
      portCode: port?.code,
    });
  }

  return generateNextContractNo({ prisma, year });
};

const list = async ({ page, pageSize, status, portId, keyword, lite = false }) => {
  const where = {};
  if (status) {
    where.status = normalizeFilterStatus(status);
  }
  if (portId) {
    where.portId = portId;
  }
  if (keyword) {
    where.contractNo = { contains: keyword };
  }

  const skip = (page - 1) * pageSize;
  const [contracts, total] = await Promise.all([
    prisma.salesContract.findMany({
      where,
      skip,
      take: pageSize,
      ...(lite
        ? {}
        : {
            include: {
              port: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          }),
      orderBy: { contractNo: 'desc' },
    }),
    prisma.salesContract.count({ where }),
  ]);

  return {
    items: contracts,
    total,
  };
};

const getById = async (id) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id },
    include: {
      port: true,
      packingItems: {
        include: {
          product: true,
          store: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: true,
    },
  });

  if (!contract) {
    throw createError('货柜不存在', 404);
  }

  return contract;
};

const create = async (data = {}) => {
  const status = normalizeFilterStatus(data.status || 'DRAFT');
  const contractNo = data.contractNo || (await generateNextContainerNo(data.portId));
  const exchangeRate = parseNullableNumber(data.exchangeRate, 7.0);

  const contract = await prisma.salesContract.create({
    data: {
      contractNo,
      exchangeRate,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : null,
      portId: data.portId,
      customsBroker: data.customsBroker || null,
      isFumigated: data.isFumigated || false,
      hasTaxRefund: data.hasTaxRefund || false,
      status,
      note: data.note,
      shippedAt: data.shippedAt ? new Date(data.shippedAt) : null,
      totalBoxes: data.totalBoxes || 0,
      grossWeight: data.grossWeight || 0,
      netWeight: data.netWeight || 0,
      volume: data.volume || 0,
    },
  });

  return contract;
};

const update = async (id, data = {}) => {
  const updateData = {};
  if (data.portId !== undefined) updateData.portId = data.portId;
  if (data.status !== undefined) updateData.status = normalizeFilterStatus(data.status);
  if (data.contractNo !== undefined) updateData.contractNo = data.contractNo;
  if (data.signedAt !== undefined) updateData.signedAt = data.signedAt ? new Date(data.signedAt) : null;
  if (data.estimatedArrival !== undefined) {
    updateData.estimatedArrival = data.estimatedArrival ? new Date(data.estimatedArrival) : null;
  }
  if (data.shippedAt !== undefined) updateData.shippedAt = data.shippedAt ? new Date(data.shippedAt) : null;
  if (data.customsBroker !== undefined) updateData.customsBroker = data.customsBroker;
  if (data.isFumigated !== undefined) updateData.isFumigated = data.isFumigated;
  if (data.hasTaxRefund !== undefined) updateData.hasTaxRefund = data.hasTaxRefund;
  if (data.totalBoxes !== undefined) updateData.totalBoxes = data.totalBoxes;
  if (data.grossWeight !== undefined) updateData.grossWeight = data.grossWeight;
  if (data.netWeight !== undefined) updateData.netWeight = data.netWeight;
  if (data.volume !== undefined) updateData.volume = data.volume;
  if (data.note !== undefined) updateData.note = data.note;
  if (data.exchangeRate !== undefined) {
    updateData.exchangeRate = parseNullableNumber(data.exchangeRate);
  }

  const contract = await prisma.salesContract.update({
    where: { id },
    data: updateData,
  });

  return contract;
};

const remove = async (id) => {
  await prisma.salesContract.delete({ where: { id } });
};

const addItem = async (id, data) => {
  const quantity = parseNullableNumber(data.quantity, 0);
  const unitPrice = parseNullableNumber(data.unitPrice, null);
  const totalPrice = unitPrice === null ? null : unitPrice * (quantity || 0);

  const item = await prisma.packingItem.create({
    data: {
      salesContractId: id,
      productId: data.productId,
      storeId: data.storeId,
      quantity,
      unit: data.unit,
      boxes: data.boxes,
      grossWeight: data.grossWeight,
      netWeight: data.netWeight,
      volume: data.volume,
      unitPrice,
      totalPrice,
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
      note: data.note,
    },
    include: { product: true },
  });

  await recalculateContainerStats(id);
  return item;
};

const updateStatus = async (id, status) => {
  const contract = await prisma.salesContract.update({
    where: { id },
    data: {
      status: normalizeFilterStatus(status),
      ...(status === 'SHIPPED' ? { shippedAt: new Date() } : {}),
    },
  });

  return contract;
};

const getNextContainerNo = async (portId) => {
  const contractNo = await generateNextContainerNo(portId);
  return { contractNo };
};

const getProducts = async (id) => {
  return prisma.packingItem.findMany({
    where: { salesContractId: id },
    include: { product: true },
  });
};

const getVisualization = async (id) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id },
    include: {
      port: true,
      packingItems: {
        include: {
          product: true,
          store: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!contract) {
    throw createError('货柜不存在', 404);
  }

  const dimensionsMm = { ...DEFAULT_CONTAINER_DIMENSIONS_MM };
  const capacityCbm = roundNumber(
    (dimensionsMm.length * dimensionsMm.width * dimensionsMm.height) / 1_000_000_000,
    3
  );

  const { items: layoutItems, maxUsedHeight } = buildLayoutItems(contract.packingItems, dimensionsMm);
  const summary = layoutItems.reduce(
    (acc, item) => {
      acc.totalQuantity += item.quantity;
      acc.totalBoxes += item.boxes;
      acc.totalGrossWeight += item.grossWeight;
      acc.totalNetWeight += item.netWeight;
      acc.totalVolume += item.volume;
      if (item.overflow) {
        acc.overflowItemCount += 1;
      }
      return acc;
    },
    {
      totalQuantity: 0,
      totalBoxes: 0,
      totalGrossWeight: 0,
      totalNetWeight: 0,
      totalVolume: 0,
      overflowItemCount: 0,
    }
  );

  const ascii = buildAsciiArt(layoutItems, dimensionsMm);
  const volumeUtilizationRate = capacityCbm > 0
    ? roundNumber((summary.totalVolume / capacityCbm) * 100, 2)
    : 0;

  return {
    container: {
      id: contract.id,
      contractNo: contract.contractNo,
      status: contract.status,
      port: contract.port ? { id: contract.port.id, name: contract.port.name, code: contract.port.code } : null,
      dimensionsMm,
      capacityCbm,
    },
    summary: {
      itemCount: layoutItems.length,
      overflowItemCount: summary.overflowItemCount,
      totalQuantity: roundNumber(summary.totalQuantity),
      totalBoxes: Math.trunc(summary.totalBoxes),
      totalGrossWeight: roundNumber(summary.totalGrossWeight),
      totalNetWeight: roundNumber(summary.totalNetWeight),
      totalVolume: roundNumber(summary.totalVolume),
      volumeUtilizationRate,
      stackedHeightMm: maxUsedHeight,
      declared: {
        totalBoxes: contract.totalBoxes,
        grossWeight: contract.grossWeight,
        netWeight: contract.netWeight,
        volume: contract.volume,
      },
    },
    layout: layoutItems,
    asciiArt: ascii.text,
    ascii,
  };
};

const updateItem = async (id, itemId, data = {}) => {
  const item = await prisma.packingItem.findUnique({
    where: { id: itemId },
    select: { quantity: true, unitPrice: true },
  });
  if (!item) {
    throw createError('装箱明细不存在', 404);
  }

  const updateData = {};
  if (data.quantity !== undefined) {
    updateData.quantity = parseNullableNumber(data.quantity, item.quantity);
  }
  if (data.unit !== undefined) {
    updateData.unit = data.unit;
  }
  if (data.boxes !== undefined) {
    updateData.boxes = data.boxes;
  }
  if (data.grossWeight !== undefined) {
    updateData.grossWeight = data.grossWeight;
  }
  if (data.netWeight !== undefined) {
    updateData.netWeight = data.netWeight;
  }
  if (data.volume !== undefined) {
    updateData.volume = data.volume;
  }
  if (data.storeId !== undefined) {
    updateData.storeId = data.storeId;
  }
  if (data.length !== undefined) {
    updateData.length = data.length;
  }
  if (data.width !== undefined) {
    updateData.width = data.width;
  }
  if (data.height !== undefined) {
    updateData.height = data.height;
  }
  if (data.note !== undefined) {
    updateData.note = data.note;
  }
  if (data.unitPrice !== undefined) {
    updateData.unitPrice = parseNullableNumber(data.unitPrice, null);
  }

  const nextQuantity = updateData.quantity ?? item.quantity;
  const nextUnitPrice = updateData.unitPrice ?? item.unitPrice;
  if (nextUnitPrice !== undefined) {
    updateData.totalPrice = nextUnitPrice === null ? null : nextUnitPrice * nextQuantity;
  }

  const updatedItem = await prisma.packingItem.update({
    where: { id: itemId },
    data: { ...updateData },
    include: { product: true },
  });

  await recalculateContainerStats(id);
  return updatedItem;
};

const removeItem = async (id, itemId) => {
  await prisma.packingItem.delete({ where: { id: itemId } });
  await recalculateContainerStats(id);
};

/**
 * 职责：获取货柜所有装箱明细行，含商品和门店信息
 * 参数：id - salesContractId（货柜ID）
 * 返回：PackingItem 数组，按创建时间升序
 */
const listItems = async (id) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!contract) {
    throw createError('货柜不存在', 404);
  }

  const items = await prisma.packingItem.findMany({
    where: { salesContractId: id },
    include: {
      product: {
        select: {
          id: true,
          customsName: true,
          description: true,
          specification: true,
          unit: true,
          hsCode: true,
        },
      },
      store: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return items;
};

/**
 * 职责：汇总货柜装箱明细数据，返回体积/重量/箱数统计
 * 参数：id - salesContractId（货柜ID）
 * 返回：{ itemCount, totalBoxes, totalGrossWeight, totalNetWeight, totalVolume, totalAmount }
 */
const getItemsSummary = async (id) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!contract) {
    throw createError('货柜不存在', 404);
  }

  const [count, agg] = await Promise.all([
    prisma.packingItem.count({ where: { salesContractId: id } }),
    prisma.packingItem.aggregate({
      where: { salesContractId: id },
      _sum: {
        boxes: true,
        grossWeight: true,
        netWeight: true,
        volume: true,
        totalPrice: true,
        quantity: true,
      },
    }),
  ]);

  return {
    itemCount: count,
    totalBoxes: agg._sum.boxes || 0,
    totalGrossWeight: roundNumber(agg._sum.grossWeight || 0),
    totalNetWeight: roundNumber(agg._sum.netWeight || 0),
    totalVolume: roundNumber(agg._sum.volume || 0),
    totalQuantity: roundNumber(agg._sum.quantity || 0),
    totalAmount: roundNumber(agg._sum.totalPrice || 0, 2),
  };
};

const recalculateContainerStats = async (salesContractId) => {
  const stats = await prisma.packingItem.aggregate({
    where: { salesContractId },
    _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true, totalPrice: true },
  });

  await prisma.salesContract.update({
    where: { id: salesContractId },
    data: {
      totalBoxes: stats._sum.boxes || 0,
      grossWeight: stats._sum.grossWeight || 0,
      netWeight: stats._sum.netWeight || 0,
      volume: stats._sum.volume || 0,
      totalAmount: stats._sum.totalPrice || 0,
    },
  });
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  addItem,
  updateItem,
  removeItem,
  updateStatus,
  getNextContainerNo,
  getProducts,
  getVisualization,
  listItems,
  getItemsSummary,
};
