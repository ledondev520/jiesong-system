/**
 * Input: Prisma客户端
 * Output: 出口合同相关的HTTP响应
 * Pos: 销售控制器，处理出口合同CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：获取出口合同列表
 * 思路：支持关键字搜索合同编号
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, storeId, keyword } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {};
    if (status) where.status = status;
    if (storeId) {
      where.items = { some: { storeId } };
    }
    if (keyword) {
      where.contractNo = { contains: keyword };
    }
    
    const [contracts, total] = await Promise.all([
      prisma.salesContract.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.salesContract.count({ where }),
    ]);
    
    paginated(res, contracts, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取出口合同详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contract = await prisma.salesContract.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            product: true,
            store: { include: { port: true } },
          },
        },
        payments: true,
      },
    });
    
    if (!contract) {
      throw createError('出口合同不存在', 404);
    }
    
    success(res, contract);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建出口合同
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    
    // 生成合同编号
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
    
    created(res, contract, '出口合同创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新出口合同
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const contract = await prisma.salesContract.update({
      where: { id },
      data: {
        exchangeRate: data.exchangeRate,
        signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        note: data.note,
      },
    });
    
    success(res, contract, '出口合同更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除出口合同
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.salesContract.delete({ where: { id } });
    
    success(res, null, '出口合同删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：添加销售明细
 */
const addItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    // 获取合同汇率
    const contract = await prisma.salesContract.findUnique({ where: { id } });
    
    // 计算销售价：成本价 / 汇率 * 1.3
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
    
    // 更新合同总金额
    const total = await prisma.salesItem.aggregate({
      where: { salesContractId: id },
      _sum: { sellingPrice: true },
    });
    
    await prisma.salesContract.update({
      where: { id },
      data: { totalAmount: total._sum.sellingPrice || 0 },
    });
    
    created(res, item, '销售明细添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新合同状态
 */
const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const contract = await prisma.salesContract.update({
      where: { id },
      data: { status },
    });
    
    success(res, contract, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取下一个合同编号
 */
const getNextContractNo = async (req, res, next) => {
  try {
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.salesContract.count({
      where: { contractNo: { startsWith: `EXP${year}` } },
    });
    const contractNo = `EXP${year}${String(count + 1).padStart(5, '0')}`;
    
    success(res, { contractNo });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：计算销售价格
 * 思路：成本价(RMB) / 汇率 * 利润率(1.3) = 销售价(USD)
 */
const calculatePrice = async (req, res, next) => {
  try {
    const { costPrice, exchangeRate, profitRate = 1.3 } = req.body;
    
    const sellingPrice = costPrice / exchangeRate * profitRate;
    const roundedUp = Math.ceil(sellingPrice);
    const roundedDown = Math.floor(sellingPrice);
    
    success(res, {
      exact: sellingPrice.toFixed(2),
      roundedUp,
      roundedDown,
      recommended: Math.round(sellingPrice),
    });
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
  addItem,
  updateStatus,
  getNextContractNo,
  calculatePrice,
};
