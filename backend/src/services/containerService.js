const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

const normalizeFilterStatus = (status) => {
  switch (status) {
    case 'PENDING':
    case 'LOADING':
      return 'DRAFT';
    default:
      return status;
  }
};

const parseNullableNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toContainerPayload = (contract) => ({
  ...contract,
  containerNo: contract.contractNo,
});

const generateNextContainerNo = async (portId) => {
  const year = new Date().getFullYear().toString().slice(-2);
  if (portId) {
    const port = await prisma.port.findUnique({ where: { id: portId } });
    if (port?.code) {
      const count = await prisma.salesContract.count({
        where: {
          contractNo: {
            startsWith: `${year}-`,
            endsWith: `-${port.code}`,
          },
        },
      });
      if (count >= 0) {
        return `${year}-${String(count + 1).padStart(3, '0')}-${port.code}`;
      }
    }
  }

  const count = await prisma.salesContract.count({
    where: { contractNo: { startsWith: `EXP${year}` } },
  });
  return `EXP${year}${String(count + 1).padStart(5, '0')}`;
};

const list = async ({ page, pageSize, status, portId, keyword }) => {
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
      include: { port: true, _count: { select: { packingItems: true } } },
      orderBy: { contractNo: 'desc' },
    }),
    prisma.salesContract.count({ where }),
  ]);

  return {
    items: contracts.map(toContainerPayload),
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

  return toContainerPayload({ ...contract, items: contract.packingItems });
};

const create = async (data = {}) => {
  const status = normalizeFilterStatus(data.status || 'DRAFT');
  const contractNo = data.contractNo || data.containerNo || (await generateNextContainerNo(data.portId));
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

  return toContainerPayload(contract);
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

  return toContainerPayload(contract);
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

  return toContainerPayload(contract);
};

const getNextContainerNo = async (portId) => {
  const containerNo = await generateNextContainerNo(portId);
  return { containerNo, contractNo: containerNo };
};

const getProducts = async (id) => {
  return prisma.packingItem.findMany({
    where: { salesContractId: id },
    include: { product: true },
  });
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
};
