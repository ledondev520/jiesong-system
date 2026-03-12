/**
 * Input: sales service 层
 * Output: 出口合同 HTTP 控制器
 * Pos: 纯路由适配层，业务逻辑收敛至 services/salesService
 */

const { success, created, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const salesService = require('../services/salesService');
const auditLog = require('../utils/auditLog');

const list = async (req, res, next) => {
  try {
    const { page, pageSize } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, storeId, keyword } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;

    const result = await salesService.getSalesContracts({ page, pageSize, status, storeId, keyword, lite });
    paginated(res, result.contracts, result.total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const contract = await salesService.getSalesContractById(req.params.id);
    success(res, contract);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const contract = await salesService.createSalesContract(req.body || {});
    created(res, contract, '出口合同创建成功');
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const contract = await salesService.updateSalesContract(req.params.id, req.body || {});
    success(res, contract, '出口合同更新成功');
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await salesService.removeSalesContract(req.params.id);
    success(res, null, '出口合同删除成功');
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const item = await salesService.addSalesItem(req.params.id, req.body || {});
    created(res, item, '销售明细添加成功');
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const contract = await salesService.updateSalesStatus(req.params.id, req.body?.status, {
      userId: req.user?.id,
      req,
    });

    // 记录回滚操作的审计日志
    if (contract._revertInfo) {
      await auditLog.logOperation({
        userId: req.user?.id,
        action: contract._revertInfo.action,
        entity: 'SalesContract',
        entityId: req.params.id,
        oldValue: { status: 'OUT_STOCK', revertedCount: contract._revertInfo.revertedCount },
        newValue: { status: req.body?.status },
        req,
        note: contract._revertInfo.note,
      });
    }

    // 记录出库操作的审计日志
    if (contract._applyInfo) {
      await auditLog.logOperation({
        userId: req.user?.id,
        action: contract._applyInfo.action,
        entity: 'SalesContract',
        entityId: req.params.id,
        oldValue: { status: contract.status },
        newValue: { status: 'OUT_STOCK', allocatedQuantity: contract._applyInfo.allocatedQuantity },
        req,
        note: contract._applyInfo.note,
      });
    }

    // 清理内部字段，不返回给客户端
    delete contract._revertInfo;
    delete contract._applyInfo;

    success(res, contract, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

const getNextContractNo = async (req, res, next) => {
  try {
    const contractNo = await salesService.getNextContractNo();
    success(res, { contractNo });
  } catch (error) {
    next(error);
  }
};

const calculatePrice = async (req, res, next) => {
  try {
    const result = salesService.calculateSellingPrice({
      costPrice: req.body?.costPrice,
      exchangeRate: req.body?.exchangeRate,
      profitRate: req.body?.profitRate,
    });
    success(res, result);
  } catch (error) {
    next(error);
  }
};

const addPackingItem = async (req, res, next) => {
  try {
    const item = await salesService.addPackingItem(req.params.id, req.body || {});
    created(res, item, '装箱明细添加成功');
  } catch (error) {
    next(error);
  }
};

const updatePackingItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const item = await salesService.updatePackingItem(id, itemId, req.body || {});
    success(res, item, '装箱明细更新成功');
  } catch (error) {
    next(error);
  }
};

const removePackingItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    await salesService.removePackingItem(id, itemId);
    success(res, null, '装箱明细删除成功');
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
  addPackingItem,
  updatePackingItem,
  removePackingItem,
};
