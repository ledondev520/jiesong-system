/**
 * Input: sales、packingListCheck 与单柜财务服务层
 * Output: 出口合同、装箱单核对、退税准备和单柜财务结算 HTTP 适配
 * Pos: 纯路由适配层，业务逻辑收敛至 services Module
 */

const { success, created, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');
const salesService = require('../services/salesService');
const contractTemplateService = require('../services/contractTemplateService');
const auditLog = require('../utils/auditLog');
const packingListCheckService = require('../services/packingListCheckService');
const fileService = require('../services/fileService');
const taxRefundPreparationService = require('../services/taxRefundPreparationService');
const salesFinanceService = require('../services/salesFinanceService');

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
    let data = req.body || {};
    let template = null;

    // 如果提供了 templateId，合并模板数据
    if (req.query.templateId) {
      template = await contractTemplateService.getById(req.query.templateId);
      if (template.type !== 'SALES') {
        throw createError('模板类型不匹配', 400);
      }
      data = {
        exchangeRate: data.exchangeRate !== undefined ? data.exchangeRate : template.items?.[0]?.exchangeRate,
        note: data.note || template.note,
        ...data,
      };
    }

    const contract = await salesService.createSalesContract(data);

    // 如果模板包含明细，自动添加
    if (template && template.items && template.items.length > 0) {
      for (const item of template.items) {
        await salesService.addSalesItem(contract.id, {
          productId: item.productId,
          storeId: item.storeId,
          quantity: item.quantity,
          unit: item.unit,
          costPrice: item.costPrice,
          sellingPrice: item.sellingPrice,
          note: item.note,
        });
      }
    }

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
        oldValue: { status: 'SHIPPED', revertedCount: contract._revertInfo.revertedCount },
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
        newValue: { status: 'SHIPPED', allocatedQuantity: contract._applyInfo.allocatedQuantity },
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

/** 列出可直接带入当前货柜的已完工采购明细及剩余箱数。 */
const getAvailablePurchaseItems = async (req, res, next) => {
  try {
    const items = await salesService.getAvailablePurchaseItems(req.params.id);
    success(res, items);
  } catch (error) {
    next(error);
  }
};

/** 按选中箱数从采购完工资料创建装箱明细。 */
const importPurchasePackingItems = async (req, res, next) => {
  try {
    const result = await salesService.importPurchasePackingItems(req.params.id, req.body?.items);
    await auditLog.logOperation({
      userId: req.user?.id,
      action: 'IMPORT_PURCHASE_PACKING_ITEMS',
      entity: 'SalesContract',
      entityId: req.params.id,
      newValue: {
        importedCount: result.importedCount,
        sources: (req.body?.items || []).map((item) => ({
          purchaseItemId: item.purchaseItemId,
          boxes: item.boxes,
        })),
      },
      req,
      note: '从已完工采购资料导入装箱明细',
    });
    created(res, result, `已导入 ${result.importedCount} 条装箱明细`);
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

const uploadFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      throw createError('请选择要上传的文件', 400);
    }

    const contractFile = await fileService.createFile(
      id,
      fileService.CONTRACT_TYPE.SALES,
      req.file,
      req.body?.description,
      req.body?.category,
    );

    created(res, contractFile, '文件上传成功');
  } catch (error) {
    next(error);
  }
};

const getFiles = async (req, res, next) => {
  try {
    const { id } = req.params;

    const files = await fileService.listFiles(id, fileService.CONTRACT_TYPE.SALES);

    success(res, files);
  } catch (error) {
    next(error);
  }
};

const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const file = await fileService.findFileById(fileId);
    if (!file || file.contractType !== fileService.CONTRACT_TYPE.SALES) throw createError('文件不存在', 404);
    await fileService.deleteFileRecord(fileId);

    success(res, null, '文件删除成功');
  } catch (error) {
    next(error);
  }
};

const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const path = require('path');
    const { getFullPath } = require('../utils/upload');

    const file = await fileService.findFileById(fileId);
    if (!file || file.contractType !== fileService.CONTRACT_TYPE.SALES) throw createError('文件不存在', 404);

    const absolutePath = path.isAbsolute(file.filePath)
      ? file.filePath
      : getFullPath(file.filePath);

    res.download(absolutePath, file.fileName, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：核对船司装箱单 PDF 与系统装箱数据
 * 思路：接收内存中的 PDF 文件 → 解析/比对 → 受限归档 → 持久化差异记录
 */
const checkPackingList = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      throw createError('请选择要核对的装箱单 PDF', 400);
    }
    const result = await packingListCheckService.checkPackingListPdf(req.params.id, req.file, {
      checkedById: req.user?.id || null,
    });
    created(res, result, '装箱单核对完成并已归档');
  } catch (error) {
    next(error);
  }
};

const listPackingListChecks = async (req, res, next) => {
  try {
    const result = await packingListCheckService.listPackingListChecks(req.params.id, {
      limit: req.query.limit,
    });
    success(res, result);
  } catch (error) {
    next(error);
  }
};

const reviewPackingListCheck = async (req, res, next) => {
  try {
    const result = await packingListCheckService.reviewPackingListCheck(
      req.params.id,
      req.params.checkId,
      {
        decision: req.body.decision,
        note: req.body.note,
        reviewedById: req.user?.id || null,
      },
    );
    success(res, result, '人工核对结论已保存');
  } catch (error) {
    next(error);
  }
};

/** 汇总当前专项单的申报凭证、备案单证、收汇节点和 2026 规则口径。 */
const getTaxRefundPreparation = async (req, res, next) => {
  try {
    const preparation = await taxRefundPreparationService.getTaxRefundPreparation(req.params.id);
    success(res, preparation);
  } catch (error) {
    next(error);
  }
};

/** 导出内部材料准备清单；该文件不伪装成税务机关正式回执。 */
const exportTaxRefundPreparation = async (req, res, next) => {
  try {
    const result = await taxRefundPreparationService.exportTaxRefundPreparation(req.params.id);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`);
    res.send(result.buffer);
  } catch (error) {
    next(error);
  }
};

/** 返回一个专项单的美元回款、人民币成本、退税和现金流统一口径。 */
const getFinanceSummary = async (req, res, next) => {
  try {
    const summary = await salesFinanceService.getSalesFinanceSummary(req.params.id);
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
  updateStatus,
  getNextContractNo,
  calculatePrice,
  addPackingItem,
  getAvailablePurchaseItems,
  importPurchasePackingItems,
  updatePackingItem,
  removePackingItem,
  uploadFile,
  getFiles,
  deleteFile,
  downloadFile,
  checkPackingList,
  listPackingListChecks,
  reviewPackingListCheck,
  getTaxRefundPreparation,
  exportTaxRefundPreparation,
  getFinanceSummary,
};
