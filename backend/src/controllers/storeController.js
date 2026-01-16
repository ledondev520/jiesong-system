/**
 * Input: Prisma客户端
 * Output: 门店相关的HTTP响应
 * Pos: 门店控制器，处理门店CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取门店列表
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, portId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = portId ? { portId } : {};
    
    const [stores, total] = await Promise.all([
      prisma.store.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { port: true },
        orderBy: { name: 'asc' },
      }),
      prisma.store.count({ where }),
    ]);
    
    paginated(res, stores, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取门店详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const store = await prisma.store.findUnique({
      where: { id },
      include: { port: true },
    });
    
    if (!store) {
      throw createError('门店不存在', 404);
    }
    
    success(res, store);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建门店
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    const store = await prisma.store.create({
      data: {
        name: data.name,
        portId: data.portId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        address: data.address,
      },
      include: { port: true },
    });
    
    created(res, store, '门店创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新门店
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const store = await prisma.store.update({
      where: { id },
      data: {
        name: data.name,
        portId: data.portId,
        contactName: data.contactName,
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        address: data.address,
      },
      include: { port: true },
    });
    
    success(res, store, '门店更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除门店（软删除）
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.store.update({
      where: { id },
      data: { isActive: false },
    });
    
    success(res, null, '门店删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取港口列表
 */
const getPorts = async (req, res, next) => {
  try {
    const ports = await prisma.port.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    
    success(res, ports);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getPorts,
};
