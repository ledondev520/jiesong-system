const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');

const getSalesContracts = async ({ page, pageSize, status, storeId, keyword }) => {
  const where = {};
  if (status) where.status = status;
  if (storeId) {
    where.items = { some: { storeId } };
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
      include: {
        port: true,
        _count: { select: { items: true } },
      },
      orderBy: { contractNo: 'desc' },
    }),
    prisma.salesContract.count({ where }),
  ]);

  return { contracts, total };
};

const getSalesContractById = async (id) => {
  const contract = await prisma.salesContract.findUnique({
    where: { id },
    include: {
      port: true,
      items: {
        include: {
          product: true,
          store: { include: { port: true } },
        },
      },
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
    throw createError('出口合同不存在', 404);
  }

  return contract;
};

const createSalesContract = async (data = {}) => {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await prisma.salesContract.count({
    where: { contractNo: { startsWith: `EXP${year}` } },
  });
  const contractNo = `EXP${year}${String(count + 1).padStart(5, '0')}`;

  const contract = await prisma.salesContract.create({
    data: {
      contractNo,
      exchangeRate: data.exchangeRate,
      signedAt: data.signedAt ? new Date(data.signedAt) : null,
      note: data.note,
    },
  });

  return contract;
};

const updateSalesContract = async (id, data = {}) => {
  return prisma.salesContract.update({
    where: { id },
    data: {
      exchangeRate: data.exchangeRate,
      signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
      estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
      portId: data.portId || undefined,
      note: data.note,
    },
  });
};

const removeSalesContract = async (id) => {
  await prisma.salesContract.delete({ where: { id } });
};

const addSalesItem = async (id, data = {}) => {
  const contract = await prisma.salesContract.findUnique({ where: { id } });

  const sellingPrice = data.sellingPrice ||
    (data.costPrice / contract.exchangeRate * 1.3);

  const item = await prisma.salesItem.create({
    data: {
      salesContractId: id,
      productId: data.productId,
      storeId: data.storeId,
      quantity: data.quantity,
      unit: data.unit,
      costPrice: data.costPrice,
      sellingPrice,
      specification: data.specification,
      note: data.note,
    },
    include: { product: true, store: true },
  });

  const total = await prisma.salesItem.aggregate({
    where: { salesContractId: id },
    _sum: { sellingPrice: true },
  });

  await prisma.salesContract.update({
    where: { id },
    data: { totalAmount: total._sum.sellingPrice || 0 },
  });

  return item;
};

const updateSalesStatus = async (id, status) => {
  return prisma.salesContract.update({
    where: { id },
    data: { status },
  });
};

const getNextContractNo = async () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const count = await prisma.salesContract.count({
    where: { contractNo: { startsWith: `EXP${year}` } },
  });
  return `EXP${year}${String(count + 1).padStart(5, '0')}`;
};

const calculateSellingPrice = ({ costPrice, exchangeRate, profitRate = 1.3 }) => {
  const numericCostPrice = Number(costPrice);
  const numericExchangeRate = Number(exchangeRate);
  const numericProfitRate = Number(profitRate);

  if (!Number.isFinite(numericCostPrice) || !Number.isFinite(numericExchangeRate) || !Number.isFinite(numericProfitRate)) {
    throw createError('costPrice、exchangeRate 和 profitRate 必须为数字', 400);
  }
  if (numericExchangeRate <= 0) {
    throw createError('exchangeRate 必须大于0', 400);
  }

  const sellingPrice = numericCostPrice / numericExchangeRate * numericProfitRate;

  return {
    exact: sellingPrice.toFixed(2),
    roundedUp: Math.ceil(sellingPrice),
    roundedDown: Math.floor(sellingPrice),
    recommended: Math.round(sellingPrice),
  };
};

const addPackingItem = async (id, data = {}) => {
  const unitPrice = data.unitPrice || null;
  const totalPrice = unitPrice && data.quantity ? unitPrice * data.quantity : null;

  const item = await prisma.packingItem.create({
    data: {
      salesContractId: id,
      productId: data.productId,
      storeId: data.storeId || null,
      quantity: data.quantity,
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
    include: { product: true, store: true },
  });

  await recalculateContractStats(id);

  return item;
};

const updatePackingItem = async (id, itemId, data = {}) => {
  const unitPrice = data.unitPrice || null;
  const totalPrice = unitPrice && data.quantity ? unitPrice * data.quantity : null;

  const item = await prisma.packingItem.update({
    where: { id: itemId },
    data: {
      quantity: data.quantity,
      unit: data.unit,
      boxes: data.boxes,
      grossWeight: data.grossWeight,
      netWeight: data.netWeight,
      volume: data.volume,
      unitPrice,
      totalPrice,
      storeId: data.storeId || null,
      length: data.length || null,
      width: data.width || null,
      height: data.height || null,
      note: data.note,
    },
    include: { product: true, store: true },
  });

  await recalculateContractStats(id);
  return item;
};

const removePackingItem = async (id, itemId) => {
  await prisma.packingItem.delete({ where: { id: itemId } });
  await recalculateContractStats(id);
};

const recalculateContractStats = async (contractId) => {
  const stats = await prisma.packingItem.aggregate({
    where: { salesContractId: contractId },
    _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true, totalPrice: true },
  });

  await prisma.salesContract.update({
    where: { id: contractId },
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
  getSalesContracts,
  getSalesContractById,
  createSalesContract,
  updateSalesContract,
  removeSalesContract,
  addSalesItem,
  updateSalesStatus,
  getNextContractNo,
  calculateSellingPrice,
  addPackingItem,
  updatePackingItem,
  removePackingItem,
};
