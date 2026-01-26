/**
 * Input: Prisma客户端
 * Output: 财务相关的HTTP响应
 * Pos: 财务控制器，处理付款记录和账款查询
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');

/**
 * 职责：获取付款记录列表
 */
const listPayments = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, type } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = type ? { type } : {};
    
    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: {
          purchaseContract: { include: { supplier: true } },
          salesContract: true,
        },
        orderBy: { paymentDate: 'desc' },
      }),
      prisma.payment.count({ where }),
    ]);
    
    paginated(res, payments, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建付款记录
 */
const createPayment = async (req, res, next) => {
  try {
    const data = req.body;
    
    const payment = await prisma.payment.create({
      data: {
        type: data.type,
        purchaseContractId: data.purchaseContractId,
        salesContractId: data.salesContractId,
        amount: data.amount,
        currency: data.currency || 'CNY',
        paymentMethod: data.paymentMethod,
        paymentDate: new Date(data.paymentDate),
        note: data.note,
      },
    });
    
    // 更新关联合同的已付/已收金额
    if (data.purchaseContractId) {
      const total = await prisma.payment.aggregate({
        where: { purchaseContractId: data.purchaseContractId },
        _sum: { amount: true },
      });
      await prisma.purchaseContract.update({
        where: { id: data.purchaseContractId },
        data: { paidAmount: total._sum.amount || 0 },
      });
    }
    
    if (data.salesContractId) {
      const total = await prisma.payment.aggregate({
        where: { salesContractId: data.salesContractId },
        _sum: { amount: true },
      });
      await prisma.salesContract.update({
        where: { id: data.salesContractId },
        data: { receivedAmount: total._sum.amount || 0 },
      });
    }
    
    created(res, payment, '付款记录创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取应付账款
 */
const getPayables = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {
      totalAmount: { gt: 0 },
      NOT: { status: 'CANCELLED' },
    };
    
    const [contracts, total] = await Promise.all([
      prisma.purchaseContract.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: { supplier: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseContract.count({ where }),
    ]);
    
    // 计算未付金额
    const payables = contracts.map(c => ({
      ...c,
      unpaidAmount: c.totalAmount - c.paidAmount,
    }));
    
    paginated(res, payables, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取应收账款
 * 思路：
 *   1. 从 packingItems 获取门店信息（去重后）
 *   2. 如果没有门店信息，尝试从目的港口获取
 *   3. 按合同号倒序排列（EXP26 > EXP25 > EXP24）
 */
const getReceivables = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
    const where = {
      totalAmount: { gt: 0 },
      NOT: { status: 'CANCELLED' },
    };
    
    const [contracts, total] = await Promise.all([
      prisma.salesContract.findMany({
        where,
        skip,
        take: parseInt(pageSize),
        include: {
          // 包含装箱明细及门店
          packingItems: { 
            include: { store: true },
          },
          // 包含目的港口
          port: true,
        },
        // 按合同号倒序排列
        orderBy: { contractNo: 'desc' },
      }),
      prisma.salesContract.count({ where }),
    ]);
    
    // 计算未收金额 + 去重门店列表
    const receivables = contracts.map(c => {
      // 从 packingItems 获取唯一门店列表
      const storeMap = new Map();
      c.packingItems?.forEach(item => {
        if (item.store && !storeMap.has(item.store.id)) {
          storeMap.set(item.store.id, item.store.name);
        }
      });
      let uniqueStores = Array.from(storeMap.values());
      
      // 如果没有门店信息，尝试使用目的港口名称
      if (uniqueStores.length === 0 && c.port?.name) {
        uniqueStores = [c.port.name];
      }
      
      return {
        ...c,
        unreceiveAmount: c.totalAmount - c.receivedAmount,
        // 简化的门店列表
        stores: uniqueStores,
        packingItems: undefined, // 不返回完整数据
        port: undefined, // 不返回完整港口数据
      };
    });
    
    paginated(res, receivables, total, parseInt(page), parseInt(pageSize));
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取财务统计
 */
const getStats = async (req, res, next) => {
  try {
    // 应付汇总
    const payableStats = await prisma.purchaseContract.aggregate({
      where: { NOT: { status: 'CANCELLED' } },
      _sum: { totalAmount: true, paidAmount: true },
    });
    
    // 应收汇总
    const receivableStats = await prisma.salesContract.aggregate({
      where: { NOT: { status: 'CANCELLED' } },
      _sum: { totalAmount: true, receivedAmount: true },
    });
    
    success(res, {
      payable: {
        total: payableStats._sum.totalAmount || 0,
        paid: payableStats._sum.paidAmount || 0,
        unpaid: (payableStats._sum.totalAmount || 0) - (payableStats._sum.paidAmount || 0),
      },
      receivable: {
        total: receivableStats._sum.totalAmount || 0,
        received: receivableStats._sum.receivedAmount || 0,
        unreceived: (receivableStats._sum.totalAmount || 0) - (receivableStats._sum.receivedAmount || 0),
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listPayments,
  createPayment,
  getPayables,
  getReceivables,
  getStats,
};
