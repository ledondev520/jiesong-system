/**
 * Input: Prisma客户端
 * Output: 货柜相关的HTTP响应
 * Pos: 货柜控制器，处理货柜CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取货柜列表
 * 思路：支持关键字搜索货柜编号
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, portId, keyword } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {};
    if (status) where.status = status;
    if (portId) where.portId = portId;
    if (keyword) {
      where.containerNo = { contains: keyword };
    }
    
    const [containers, total] = await Promise.all([
      prisma.container.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { port: true, _count: { select: { items: true } } },
        orderBy: { containerNo: 'desc' }, // 按货柜编号倒序
      }),
      prisma.container.count({ where }),
    ]);
    
    paginated(res, containers, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取货柜详情
 * 思路：包含装箱明细、商品信息、门店信息
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const container = await prisma.container.findUnique({
      where: { id },
      include: {
        port: true,
        items: { 
          include: { 
            product: true,
            // 关联门店信息（如果有）
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    
    if (!container) {
      throw createError('货柜不存在', 404);
    }
    
    // 如果有 storeId，查询门店信息
    const storeIds = [...new Set(container.items.filter(i => i.storeId).map(i => i.storeId))];
    let storeMap = new Map();
    if (storeIds.length > 0) {
      const stores = await prisma.store.findMany({
        where: { id: { in: storeIds } },
        select: { id: true, name: true },
      });
      storeMap = new Map(stores.map(s => [s.id, s]));
    }
    
    // 组装结果
    const result = {
      ...container,
      items: container.items.map(item => ({
        ...item,
        store: item.storeId ? storeMap.get(item.storeId) : null,
      })),
    };
    
    success(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建货柜
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    
    // 获取港口简码
    const port = await prisma.port.findUnique({ where: { id: data.portId } });
    if (!port) {
      throw createError('港口不存在', 404);
    }
    
    // 生成货柜编号：YY-NNN-PORT
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.container.count({
      where: {
        containerNo: { startsWith: `${year}-` },
        portId: data.portId,
      },
    });
    const containerNo = `${year}-${String(count + 1).padStart(3, '0')}-${port.code}`;
    
    const container = await prisma.container.create({
      data: {
        containerNo,
        portId: data.portId,
        estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : null,
        customsBroker: data.customsBroker,
        isFumigated: data.isFumigated,
        hasTaxRefund: data.hasTaxRefund,
        note: data.note,
      },
      include: { port: true },
    });
    
    created(res, container, '货柜创建成功');
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
    const data = req.body;
    
    const container = await prisma.container.update({
      where: { id },
      data: {
        shippedAt: data.shippedAt ? new Date(data.shippedAt) : undefined,
        estimatedArrival: data.estimatedArrival ? new Date(data.estimatedArrival) : undefined,
        customsBroker: data.customsBroker,
        isFumigated: data.isFumigated,
        hasTaxRefund: data.hasTaxRefund,
        note: data.note,
      },
      include: { port: true },
    });
    
    success(res, container, '货柜更新成功');
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
    
    await prisma.container.delete({ where: { id } });
    
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
    
    const item = await prisma.containerItem.create({
      data: {
        containerId: id,
        productId: data.productId,
        storeId: data.storeId,
        quantity: data.quantity,
        unit: data.unit,
        boxes: data.boxes,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        note: data.note,
      },
      include: { product: true },
    });
    
    // 更新货柜汇总数据
    const stats = await prisma.containerItem.aggregate({
      where: { containerId: id },
      _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true },
    });
    
    await prisma.container.update({
      where: { id },
      data: {
        totalBoxes: stats._sum.boxes || 0,
        grossWeight: stats._sum.grossWeight || 0,
        netWeight: stats._sum.netWeight || 0,
        volume: stats._sum.volume || 0,
      },
    });
    
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
    
    const updateData = { status };
    if (status === 'SHIPPED') {
      updateData.shippedAt = new Date();
    }
    
    const container = await prisma.container.update({
      where: { id },
      data: updateData,
    });
    
    success(res, container, '状态更新成功');
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
    
    const port = await prisma.port.findUnique({ where: { id: portId } });
    if (!port) {
      throw createError('港口不存在', 404);
    }
    
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.container.count({
      where: {
        containerNo: { startsWith: `${year}-` },
        portId,
      },
    });
    const containerNo = `${year}-${String(count + 1).padStart(3, '0')}-${port.code}`;
    
    success(res, { containerNo });
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
    
    const items = await prisma.containerItem.findMany({
      where: { containerId: id },
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
    
    const item = await prisma.containerItem.update({
      where: { id: itemId },
      data: {
        quantity: data.quantity,
        unit: data.unit,
        boxes: data.boxes,
        grossWeight: data.grossWeight,
        netWeight: data.netWeight,
        volume: data.volume,
        storeId: data.storeId,
        note: data.note,
      },
      include: { product: true },
    });
    
    // 更新货柜汇总数据
    await recalculateContainerStats(id);
    
    success(res, item, '装箱明细更新成功');
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
    
    await prisma.containerItem.delete({ where: { id: itemId } });
    
    // 更新货柜汇总数据
    await recalculateContainerStats(id);
    
    success(res, null, '装箱明细删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：重新计算货柜汇总数据
 * @param {string} containerId - 货柜ID
 */
const recalculateContainerStats = async (containerId) => {
  const stats = await prisma.containerItem.aggregate({
    where: { containerId },
    _sum: { boxes: true, grossWeight: true, netWeight: true, volume: true },
  });
  
  await prisma.container.update({
    where: { id: containerId },
    data: {
      totalBoxes: stats._sum.boxes || 0,
      grossWeight: stats._sum.grossWeight || 0,
      netWeight: stats._sum.netWeight || 0,
      volume: stats._sum.volume || 0,
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
