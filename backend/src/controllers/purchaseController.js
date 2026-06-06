/**
 * Input: Prisma客户端
 * Output: 采购合同相关的HTTP响应
 * Pos: 采购控制器，处理采购合同CRUD请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const { validatePurchaseTransition, PURCHASE_STATUS } = require('../services/purchaseStateMachine');
const { applyPurchaseInStock, revertPurchaseInStock } = require('../services/inventorySnapshot');
const { normalizePagination } = require('../utils/pagination');
const auditLog = require('../utils/auditLog');
const { createPurchaseWithItems, updatePurchase } = require('../agent/commands/purchase');

/**
 * 职责：检查商品价格是否高于历史均价并生成警告
 * 思路：对每个商品查询历史采购均价，若当前价高于均价10%则生成警告
 * @param {Array} items - 采购明细列表
 * @param {Object} prismaClient - Prisma客户端
 * @returns {Array} 警告列表
 */
const checkPriceWarnings = async (items, prismaClient) => {
  const warnings = [];

  for (const item of items) {
    if (!item.productId || !item.unitPrice || item.unitPrice <= 0) continue;

    const historyItems = await prismaClient.purchaseItem.findMany({
      where: { productId: item.productId, quantity: { gt: 0 } },
      include: {
        purchaseContract: { select: { contractNo: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (historyItems.length === 0) continue;

    const prices = historyItems.map((h) => h.totalPrice / h.quantity).filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length === 0) continue;

    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    if (averagePrice <= 0) continue;

    const currentPrice = item.unitPrice;
    const diffPct = ((currentPrice - averagePrice) / averagePrice) * 100;

    if (diffPct > 10) {
      warnings.push({
        productId: item.productId,
        currentPrice: Number(currentPrice.toFixed(2)),
        averagePrice: Number(averagePrice.toFixed(2)),
        diffPct: Number(diffPct.toFixed(1)),
        message: `当前价格 ¥${currentPrice} 高于历史均价 ¥${averagePrice.toFixed(2)} ${diffPct.toFixed(1)}%，请说明原因`,
      });
    }
  }

  return warnings;
};

/**
 * 职责：获取采购合同列表
 * 思路：支持关键字搜索合同编号和供应商名称
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, supplierId, keyword } = req.query;
    const lite = req.query.lite === 'true' || req.query.lite === true;
    
    const where = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (keyword) {
      where.OR = [
        { contractNo: { contains: keyword } },
        { supplier: { name: { contains: keyword } } },
      ];
    }
    
    const [contracts, total] = await Promise.all([
      prisma.purchaseContract.findMany({
        where,
        skip,
        take: pageSize,
        include: lite
          ? {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  hasQualityIssue: true,
                },
              },
            }
          : {
              supplier: {
                select: {
                  id: true,
                  name: true,
                  hasQualityIssue: true,
                },
              },
              items: {
                take: 1,
                include: {
                  product: {
                    select: {
                      id: true,
                      customsName: true,
                      specification: true,
                      unit: true,
                    },
                  },
                },
              },
            },
        orderBy: { contractNo: 'desc' }, // 按合同编号倒序
      }),
      prisma.purchaseContract.count({ where }),
    ]);
    
    paginated(res, contracts, total, page, pageSize);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取采购合同详情
 */
const getById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const contract = await prisma.purchaseContract.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: { include: { product: true } },
        payments: true,
        files: true,
      },
    });
    
    if (!contract) {
      throw createError('采购合同不存在', 404);
    }
    
    success(res, contract);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：创建采购合同
 * 思路：创建完成后检查商品价格是否高于历史均价10%以上，若有则返回警告
 */
const create = async (req, res, next) => {
  try {
    const contract = await createPurchaseWithItems({
      input: req.body,
      prismaClient: prisma,
    });

    const warnings = await checkPriceWarnings(req.body.items || [], prisma);

    if (warnings.length > 0) {
      const warningMessages = warnings.map((w) => w.message).join('；');
      created(res, { contract, warnings }, `采购合同创建成功，但${warningMessages}`);
    } else {
      created(res, contract, '采购合同创建成功');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新采购合同
 */
const update = async (req, res, next) => {
  try {
    const contract = await updatePurchase({
      id: req.params.id,
      input: req.body,
      prismaClient: prisma,
    });
    
    success(res, contract, '采购合同更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除采购合同
 */
const remove = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    await prisma.purchaseContract.delete({ where: { id } });
    
    success(res, null, '采购合同删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：添加采购明细
 */
const addItem = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const item = await prisma.purchaseItem.create({
      data: {
        purchaseContractId: id,
        productId: data.productId,
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.unitPrice,
        totalPrice: data.quantity * data.unitPrice,
        specification: data.specification,
        note: data.note,
      },
      include: { product: true },
    });
    
    // 更新合同总金额
    const total = await prisma.purchaseItem.aggregate({
      where: { purchaseContractId: id },
      _sum: { totalPrice: true },
    });
    
    await prisma.purchaseContract.update({
      where: { id },
      data: { totalAmount: total._sum.totalPrice || 0 },
    });
    
    created(res, item, '采购明细添加成功');
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
    const targetStatus = typeof req.body?.status === 'string' ? req.body.status.trim() : req.body?.status;

    if (!targetStatus) {
      throw createError('status 不能为空', 400);
    }

    let revertResult = null;
    let applyResult = null;

    const contract = await prisma.$transaction(async (tx) => {
      const existingContract = await tx.purchaseContract.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existingContract) {
        throw createError('采购合同不存在', 404);
      }

      const validationResult = validatePurchaseTransition(existingContract.status, targetStatus);
      if (!validationResult.valid) {
        throw createError(validationResult.message || '非法采购合同状态流转', 400);
      }

      const isTransition = existingContract.status !== targetStatus;
      const contract = await tx.purchaseContract.update({
        where: { id },
        data: { status: targetStatus },
      });

      // 正向流转：入库时创建库存记录
      if (isTransition && targetStatus === PURCHASE_STATUS.IN_STOCK) {
        applyResult = await applyPurchaseInStock(tx, id);
      }

      // 反向流转：从入库状态回退时，回滚库存记录
      if (isTransition && existingContract.status === PURCHASE_STATUS.IN_STOCK) {
        revertResult = await revertPurchaseInStock(tx, id);
      }

      return contract;
    });

    // 记录回滚操作的审计日志
    if (revertResult && revertResult.reverted > 0) {
      await auditLog.logOperation({
        userId: req.user?.id,
        action: 'REVERT_IN_STOCK',
        entity: 'PurchaseContract',
        entityId: id,
        oldValue: { status: PURCHASE_STATUS.IN_STOCK, revertedInventoryCount: revertResult.reverted },
        newValue: { status: targetStatus },
        req,
        note: `采购入库回滚：恢复 ${revertResult.reverted} 条库存记录`,
      });
      console.log(`[库存回滚] 采购合同 ${id}: 恢复 ${revertResult.reverted} 条入库记录`);
    }

    // 记录入库操作的审计日志
    if (applyResult && (applyResult.created > 0 || applyResult.skipped > 0)) {
      await auditLog.logOperation({
        userId: req.user?.id,
        action: 'APPLY_IN_STOCK',
        entity: 'PurchaseContract',
        entityId: id,
        oldValue: { status: contract.status },
        newValue: { status: PURCHASE_STATUS.IN_STOCK, createdCount: applyResult.created, skippedCount: applyResult.skipped },
        req,
        note: `采购入库：创建 ${applyResult.created} 条库存记录，跳过 ${applyResult.skipped} 条`,
      });
      console.log(`[库存入库] 采购合同 ${id}: 创建 ${applyResult.created} 条记录，跳过 ${applyResult.skipped} 条`);
    }

    success(res, contract, '状态更新成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：上传合同文件
 * 思路：
 * 1. multer中间件处理文件上传
 * 2. 保存文件信息到数据库
 * 3. 返回文件记录
 */
const uploadFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      throw createError('请选择要上传的文件', 400);
    }
    
    const file = req.file;
    const { getRelativePath } = require('../utils/upload');
    
    // 保存文件记录
    const contractFile = await prisma.contractFile.create({
      data: {
        purchaseContractId: id,
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

/**
 * 职责：获取合同文件列表
 */
const getFiles = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const files = await prisma.contractFile.findMany({
      where: { purchaseContractId: id },
      orderBy: { uploadedAt: 'desc' },
    });
    
    success(res, files);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除合同文件
 */
const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { deleteFile: removeFile } = require('../utils/upload');
    
    // 获取文件记录
    const file = await prisma.contractFile.findUnique({
      where: { id: fileId },
    });
    
    if (!file) {
      throw createError('文件不存在', 404);
    }
    
    // 删除物理文件（可选，根据PRD要求保留文件）
    // removeFile(file.filePath);
    
    // 删除数据库记录
    await prisma.contractFile.delete({
      where: { id: fileId },
    });
    
    success(res, null, '文件删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：下载合同附件
 * 思路：查找文件记录，构造绝对路径，通过 res.download 返回文件流
 */
const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const path = require('path');

    const file = await prisma.contractFile.findUnique({ where: { id: fileId } });
    if (!file) throw createError('文件不存在', 404);

    const absolutePath = path.isAbsolute(file.filePath)
      ? file.filePath
      : path.join(process.cwd(), file.filePath);

    res.download(absolutePath, file.fileName, (err) => {
      if (err && !res.headersSent) next(err);
    });
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
    const count = await prisma.purchaseContract.count({
      where: { contractNo: { startsWith: `CG${year}` } },
    });
    const contractNo = `CG${year}${String(count + 1).padStart(5, '0')}`;
    
    success(res, { contractNo });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取商品历史采购价格统计
 * 思路：查询 PurchaseItem 中该商品的所有历史记录，计算均价、最低价、最高价
 * @param productId 商品ID
 * @returns { averagePrice, minPrice, maxPrice, count, history }
 */
const getProductPriceHistory = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const historyItems = await prisma.purchaseItem.findMany({
      where: { productId, quantity: { gt: 0 } },
      include: {
        purchaseContract: { select: { contractNo: true, createdAt: true } },
        product: { select: { customsName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (historyItems.length === 0) {
      return success(res, {
        averagePrice: null,
        minPrice: null,
        maxPrice: null,
        count: 0,
        history: [],
      });
    }

    const prices = historyItems
      .map((h) => ({
        contractNo: h.purchaseContract.contractNo,
        price: h.totalPrice / h.quantity,
        date: h.purchaseContract.createdAt,
      }))
      .filter((h) => Number.isFinite(h.price) && h.price > 0);

    if (prices.length === 0) {
      return success(res, {
        averagePrice: null,
        minPrice: null,
        maxPrice: null,
        count: 0,
        history: [],
      });
    }

    const priceValues = prices.map((p) => p.price);
    const averagePrice = priceValues.reduce((sum, p) => sum + p, 0) / priceValues.length;
    const minPrice = Math.min(...priceValues);
    const maxPrice = Math.max(...priceValues);

    success(res, {
      averagePrice: Number(averagePrice.toFixed(2)),
      minPrice: Number(minPrice.toFixed(2)),
      maxPrice: Number(maxPrice.toFixed(2)),
      count: priceValues.length,
      history: prices.map((p) => ({
        contractNo: p.contractNo,
        price: Number(p.price.toFixed(2)),
        date: p.date,
      })),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：根据商品ID列表获取曾供应过这些商品的供应商ID
 * 思路：查询 PurchaseItem 中包含这些商品的记录，获取对应的 PurchaseContract，再获取 supplierId
 * @param productIds 商品ID数组
 * @returns 供应商ID列表（去重）
 */
const getSuppliersByProducts = async (req, res, next) => {
  try {
    const { productIds } = req.body;
    
    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return success(res, { supplierIds: [] });
    }
    
    // 1. 查询包含这些商品的采购明细
    const purchaseItems = await prisma.purchaseItem.findMany({
      where: { productId: { in: productIds } },
      select: { purchaseContractId: true },
      distinct: ['purchaseContractId'],
    });
    
    if (purchaseItems.length === 0) {
      return success(res, { supplierIds: [] });
    }
    
    // 2. 获取对应的采购合同的供应商ID
    const contractIds = purchaseItems.map(item => item.purchaseContractId);
    const contracts = await prisma.purchaseContract.findMany({
      where: { id: { in: contractIds } },
      select: { supplierId: true },
      distinct: ['supplierId'],
    });
    
    const supplierIds = [...new Set(contracts.map(c => c.supplierId))];
    
    success(res, { supplierIds });
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
  uploadFile,
  getFiles,
  deleteFile,
  downloadFile,
  getNextContractNo,
  getProductPriceHistory,
  getSuppliersByProducts,
};
