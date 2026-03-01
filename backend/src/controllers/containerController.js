/**
 * Input: Prisma客户端
 * Output: 货柜相关的HTTP响应（兼容层）
 * Pos: 货柜控制器，兼容旧前端调用，内部映射到 SalesContract/PackingItem
 *
 * Note: 在模型重构后，货柜概念与销售合同（SalesContract）共享同一张表。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 将前端旧状态映射到 salesContract 支持的状态。
 */
const normalizeFilterStatus = (status) => {
  switch (status) {
    case 'PENDING':
    case 'LOADING':
      return 'DRAFT';
    default:
      return status;
  }
};

/**
 * 安全解析可空数值。
 */
const parseNullableNumber = (value, fallback = null) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * 生成货柜编号（兼容旧接口返回）
 */
const toContainerPayload = (contract) => ({
  ...contract,
  containerNo: contract.contractNo,
});

/**
 * 用于下一个货柜编号，沿用旧接口返回字段 contractNo/containerNo。
 */
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

/**
 * 职责：获取货柜列表
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, portId, keyword } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);

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

    const [contracts, total] = await Promise.all([
      prisma.salesContract.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { port: true, _count: { select: { packingItems: true } } },
        orderBy: { contractNo: 'desc' },
      }),
      prisma.salesContract.count({ where }),
    ]);

    const normalized = contracts.map(toContainerPayload);
    paginated(res, normalized, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取货柜详情（含装箱明细）
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
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

    success(res, toContainerPayload({ ...contract, items: contract.packingItems }));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建货柜
 */
const create = async (req, res, next) => {
  try {
    const data = req.body || {};

    const status = normalizeFilterStatus(data.status || 'DRAFT');
    const contractNo = data.contractNo || data.containerNo || (await generateNextContainerNo());
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

    created(res, toContainerPayload(contract), '货柜创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新货柜
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body || {};

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

    success(res, toContainerPayload(contract), '货柜更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除货柜
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;

    await prisma.salesContract.delete({ where: { id } });

    success(res, null, '货柜删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：添加装箱明细
 */
const addItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;

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

    created(res, item, '装箱明细添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新货柜状态
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const contract = await prisma.salesContract.update({
      where: { id },
      data: {
        status: normalizeFilterStatus(status),
        ...(status === 'SHIPPED' ? { shippedAt: new Date() } : {}),
      },
    });

    success(res, toContainerPayload(contract), '状态更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取下一个货柜编号
 */
const getNextContainerNo = async (req, res, next) => {
  try {
    const { portId } = req.params;
    const nextNo = await generateNextContainerNo(portId);
    success(res, { containerNo: nextNo, contractNo: nextNo });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：查询货柜中的商品
 */
const getProducts = async (req, res, next) => {
  try {
    const { id } = req.params;

    const items = await prisma.packingItem.findMany({
      where: { salesContractId: id },
      include: { product: true },
    });

    success(res, items);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新装箱明细
 */
const updateItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const data = req.body;

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
      data: {
        ...updateData,
      },
      include: { product: true },
    });

    await recalculateContainerStats(id);

    success(res, updatedItem, '装箱明细更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除装箱明细
 */
const removeItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;

    await prisma.packingItem.delete({ where: { id: itemId } });

    await recalculateContainerStats(id);

    success(res, null, '装箱明细删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：重新计算货柜汇总数据
 */
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
