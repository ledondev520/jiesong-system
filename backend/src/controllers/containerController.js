/**
 * Input: containerService（货柜服务层）
 * Output: 货柜及装箱明细 HTTP 控制器（list/getById/create/update/remove/addItem/updateItem/removeItem/listItems/getItemsSummary）
 * Pos: 货柜控制器层，委托 service 完成业务，仅负责请求解析与响应组装
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { success, created, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const containerService = require('../services/containerService');

const list = async (req, res, next) => {
  try {
    const { page, pageSize } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, portId, keyword } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;

    const { items, total } = await containerService.list({
      page,
      pageSize,
      status,
      portId,
      keyword,
      lite,
    });

    paginated(res, items, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

const getById = async (req, res, next) => {
  try {
    const contract = await containerService.getById(req.params.id);
    success(res, contract);
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    const contract = await containerService.create(req.body || {});
    created(res, contract, '货柜创建成功');
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contract = await containerService.update(id, req.body || {});
    success(res, contract, '货柜更新成功');
  } catch (error) {
    next(error);
  }
};

const remove = async (req, res, next) => {
  try {
    await containerService.remove(req.params.id);
    success(res, null, '货柜删除成功');
  } catch (error) {
    next(error);
  }
};

const addItem = async (req, res, next) => {
  try {
    const item = await containerService.addItem(req.params.id, req.body || {});
    created(res, item, '装箱明细添加成功');
  } catch (error) {
    next(error);
  }
};

const updateItem = async (req, res, next) => {
  try {
    const { id, itemId } = req.params;
    const item = await containerService.updateItem(id, itemId, req.body || {});
    success(res, item, '装箱明细更新成功');
  } catch (error) {
    next(error);
  }
};

const removeItem = async (req, res, next) => {
  try {
    await containerService.removeItem(req.params.id, req.params.itemId);
    success(res, null, '装箱明细删除成功');
  } catch (error) {
    next(error);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contract = await containerService.updateStatus(id, req.body?.status);
    success(res, contract, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

const getNextContainerNo = async (req, res, next) => {
  try {
    const nextNo = await containerService.getNextContainerNo(req.params.portId);
    success(res, nextNo);
  } catch (error) {
    next(error);
  }
};

const getProducts = async (req, res, next) => {
  try {
    const items = await containerService.getProducts(req.params.id);
    success(res, items);
  } catch (error) {
    next(error);
  }
};

const getVisualization = async (req, res, next) => {
  try {
    const visualization = await containerService.getVisualization(req.params.id);
    success(res, visualization);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：返回货柜所有装箱明细行（含商品和门店信息）
 * 参数：req.params.id - 货柜(salesContract)ID
 * 返回：{ success: true, data: PackingItem[] }
 */
const listItems = async (req, res, next) => {
  try {
    const items = await containerService.listItems(req.params.id);
    success(res, items);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：返回货柜装箱明细汇总数据
 * 参数：req.params.id - 货柜(salesContract)ID
 * 返回：{ success: true, data: { itemCount, totalBoxes, totalGrossWeight, totalNetWeight, totalVolume, totalAmount } }
 */
const getItemsSummary = async (req, res, next) => {
  try {
    const summary = await containerService.getItemsSummary(req.params.id);
    success(res, summary);
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
  updateItem,
  removeItem,
  updateStatus,
  getNextContainerNo,
  getProducts,
  getVisualization,
  listItems,
  getItemsSummary,
};
