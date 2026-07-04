/**
 * Input: sales service 层
 * Output: 出口合同 HTTP 控制器
 * Pos: 纯路由适配层，业务逻辑收敛至 services/salesService；附件上传/列表/下载/删除在本层适配
 */

const { success, created, paginated } = require('../utils/response');
const { normalizePagination } = require('../utils/pagination');
const { createError } = require('../middleware/errorHandler');
const salesService = require('../services/salesService');
const contractTemplateService = require('../services/contractTemplateService');
const auditLog = require('../utils/auditLog');
const prisma = require('../utils/prisma');

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

const uploadFile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      throw createError('请选择要上传的文件', 400);
    }

    const file = req.file;
    const { getRelativePath } = require('../utils/upload');

    const contractFile = await prisma.salesContractFile.create({
      data: {
        salesContractId: id,
        fileName: file.originalname,
        filePath: getRelativePath(file.path),
        fileType: file.mimetype,
        fileSize: file.size,
      },
    });

    created(res, contractFile, '文件上传成功');
  } catch (error) {
    next(error);
  }
};

const getFiles = async (req, res, next) => {
  try {
    const { id } = req.params;

    const files = await prisma.salesContractFile.findMany({
      where: { salesContractId: id },
      orderBy: { uploadedAt: 'desc' },
    });

    success(res, files);
  } catch (error) {
    next(error);
  }
};

const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const file = await prisma.salesContractFile.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw createError('文件不存在', 404);
    }

    await prisma.salesContractFile.delete({
      where: { id: fileId },
    });

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

    const file = await prisma.salesContractFile.findUnique({ where: { id: fileId } });
    if (!file) throw createError('文件不存在', 404);

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
 * 思路：接收内存中的 PDF 文件 → packingListCheckService 解析并比对 → 返回差异报告
 */
const checkPackingList = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      throw createError('请选择要核对的装箱单 PDF', 400);
    }
    const { checkPackingListPdf } = require('../services/packingListCheckService');
    const result = await checkPackingListPdf(req.params.id, req.file.buffer);
    success(res, result);
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
  uploadFile,
  getFiles,
  deleteFile,
  downloadFile,
  checkPackingList,
};
