/**
 * Input: Prisma客户端、统一附件服务与上传路径工具
 * Output: 采购合同相关的HTTP响应
 * Pos: 采购控制器，处理采购合同CRUD请求与受限附件存储、下载
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const fileService = require('../services/fileService');
const { success, created, paginated } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const {
  validatePurchaseTransition,
  normalizePurchaseStatus,
  getPurchaseSettlementStatus,
  PURCHASE_STATUS,
} = require('../services/purchaseStateMachine');
const { applyPurchaseInStock } = require('../services/inventorySnapshot');
const { normalizePagination } = require('../utils/pagination');
const auditLog = require('../utils/auditLog');
const { createPurchaseWithItems, updatePurchase } = require('../agent/commands/purchase');
const contractTemplateService = require('../services/contractTemplateService');
const { calculateNewLineTotal, normalizePurchaseTaxRate } = require('../services/purchaseAmountService');
const {
  assertPurchaseProductionReady,
  evaluatePurchaseProductionReadiness,
  updatePurchaseProductionDetails,
} = require('../services/purchaseProductionService');
const purchaseInvoiceService = require('../services/purchaseInvoiceService');

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

    // 历史对比统一使用不含税单价，避免拿含税行总额/数量与当前不含税单价比较。
    const prices = historyItems.map((h) => Number(h.unitPrice)).filter((p) => Number.isFinite(p) && p > 0);
    if (prices.length === 0) continue;

    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    if (averagePrice <= 0) continue;

    const currentPrice = Number(item.unitPrice);
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
 * 思路：服务端分页与全部采购明细搜索共用筛选，汇总覆盖完整合同目录
 */
const list = async (req, res, next) => {
  try {
    const { page, pageSize, skip } = normalizePagination(req.query, { pageSize: 20, maxPageSize: 100 });
    const { status, supplierId } = req.query;
    const searchText = (key) => {
      const value = req.query[key];
      if (value === undefined) return '';
      if (typeof value !== 'string') throw createError(`${key} 必须为文本`, 400);
      return value.trim();
    };
    const keyword = searchText('keyword');
    const productKeyword = searchText('productKeyword');
    const storeName = searchText('storeName');
    const lite = req.query.lite === 'true' || req.query.lite === true;
    
    const where = {};
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (storeName) where.storeName = { contains: storeName };
    if (productKeyword) {
      where.items = { some: { product: { customsName: { contains: productKeyword } } } };
    }
    if (keyword) {
      where.OR = [
        { contractNo: { contains: keyword } },
        { supplier: { name: { contains: keyword } } },
        { items: { some: { product: { customsName: { contains: keyword } } } } },
      ];
    }
    
    const [contracts, total, statusCounts, stores] = await Promise.all([
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
      prisma.purchaseContract.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.purchaseContract.findMany({ where: { storeName: { not: null } }, select: { storeName: true }, distinct: ['storeName'] }),
    ]);
    
    paginated(res, contracts, total, page, pageSize, {
      summary: { statusCounts: Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all])), stores: stores.map((row) => row.storeName).filter(Boolean) },
    });
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
    
    success(res, {
      ...contract,
      productionReadiness: evaluatePurchaseProductionReadiness(contract.items),
    });
  } catch (error) {
    next(error);
  }
};

/** 读取当前采购合同的催票清单、发票号码和选填附件状态。 */
const getInvoicePreparation = async (req, res, next) => {
  try {
    const preparation = await purchaseInvoiceService.getPurchaseInvoicePreparation(req.params.id);
    success(res, preparation);
  } catch (error) {
    next(error);
  }
};

/** 通过专用 Interface 规范化并登记一份或多份供应商发票号码。 */
const registerInvoiceNumbers = async (req, res, next) => {
  try {
    const preparation = await purchaseInvoiceService.registerPurchaseInvoiceNumbers(
      req.params.id,
      { invoiceNumbers: req.body?.invoiceNumbers },
    );
    success(res, preparation, '供应商发票号码已登记');
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
    let input = req.body || {};

    // 如果提供了 templateId，合并模板数据
    if (req.query.templateId) {
      const template = await contractTemplateService.getById(req.query.templateId);
      if (template.type !== 'PURCHASE') {
        throw createError('模板类型不匹配', 400);
      }
      const mergedItems = Array.isArray(input.items) && input.items.length > 0
        ? input.items
        : (template.items || []);
      input = {
        supplierId: input.supplierId || template.supplierId,
        taxRate: input.taxRate !== undefined ? input.taxRate : template.taxRate,
        note: input.note || template.note,
        items: mergedItems,
        ...input,
        items: mergedItems,
      };
    }

    const contract = await createPurchaseWithItems({
      input,
      prismaClient: prisma,
    });

    const warnings = await checkPriceWarnings(input.items || [], prisma);

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

    const item = await prisma.$transaction(async (tx) => {
      const contract = await tx.purchaseContract.findUnique({
        where: { id },
        select: { taxRate: true },
      });
      if (!contract) throw createError('采购合同不存在', 404);

      const taxRate = normalizePurchaseTaxRate(contract.taxRate);
      const createdItem = await tx.purchaseItem.create({
        data: {
          purchaseContractId: id,
          productId: data.productId,
          quantity: data.quantity,
          unit: data.unit,
          unitPrice: data.unitPrice,
          totalPrice: calculateNewLineTotal(data, taxRate),
          specification: data.specification,
          note: data.note,
        },
        include: { product: true },
      });

      const total = await tx.purchaseItem.aggregate({
        where: { purchaseContractId: id },
        _sum: { totalPrice: true },
      });
      await tx.purchaseContract.update({
        where: { id },
        data: { totalAmount: total._sum.totalPrice || 0 },
      });
      return createdItem;
    });
    
    created(res, item, '采购明细添加成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：批量保存采购明细的生产/装柜输入资料，允许先保存不完整草稿。
 */
const updateProductionDetails = async (req, res, next) => {
  try {
    const contract = await updatePurchaseProductionDetails(req.params.id, req.body?.items, prisma, {
      completeProduction: req.body?.completeProduction ?? false,
    });
    await auditLog.logOperation({
      userId: req.user?.id,
      action: 'UPDATE_PRODUCTION_DETAILS',
      entity: 'PurchaseContract',
      entityId: req.params.id,
      newValue: {
        itemIds: (req.body?.items || []).map((item) => item.id),
        itemCount: (req.body?.items || []).length,
        completeProduction: req.body?.completeProduction === true,
        status: contract.status,
      },
      req,
      note: '更新采购生产资料（规格、箱数、重量、体积和可选箱体尺寸）',
    });
    success(res, contract, req.body?.completeProduction === true ? '完工报告已保存，已进入待装柜' : '生产资料已保存');
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
    const targetStatus = normalizePurchaseStatus(req.body?.status);

    if (!targetStatus) {
      throw createError('status 不能为空', 400);
    }

    let applyResult = null;

    const contract = await prisma.$transaction(async (tx) => {
      const existingContract = await tx.purchaseContract.findUnique({
        where: { id },
        select: {
          id: true,
          status: true,
          totalAmount: true,
          paidAmount: true,
          invoiceNo: true,
          _count: { select: { payments: true } },
          items: {
            select: {
              id: true,
              _count: { select: { inventories: true, packingItems: true } },
              specification: true,
              boxes: true,
              grossWeight: true,
              netWeight: true,
              volume: true,
              length: true,
              width: true,
              height: true,
            },
          },
        },
      });

      if (!existingContract) {
        throw createError('采购合同不存在', 404);
      }

      const validationResult = validatePurchaseTransition(existingContract.status, targetStatus);
      if (!validationResult.valid) {
        throw createError(validationResult.message || '非法采购合同状态流转', 400);
      }

      const isTransition = existingContract.status !== targetStatus;
      const settledStatus = getPurchaseSettlementStatus(targetStatus, existingContract.totalAmount, existingContract.paidAmount);
      if (targetStatus === PURCHASE_STATUS.COMPLETED && settledStatus !== PURCHASE_STATUS.COMPLETED) {
        throw createError('采购款项尚未结清或存在金额差异，请先处理付款记录', 400);
      }
      if (isTransition && targetStatus === PURCHASE_STATUS.CANCELLED && (
        ![PURCHASE_STATUS.DRAFT, PURCHASE_STATUS.SIGNED].includes(normalizePurchaseStatus(existingContract.status))
        || existingContract.paidAmount > 0 || existingContract.invoiceNo || existingContract._count.payments > 0
        || existingContract.items.some((item) => item._count.inventories > 0 || item._count.packingItems > 0)
      )) {
        throw createError('仅尚未生产、未付款、未入库且未关联出口的合同可取消；已履行合同请先处理对应业务', 400);
      }

      if (
        isTransition
        && [PURCHASE_STATUS.READY, PURCHASE_STATUS.SHIPPED].includes(targetStatus)
      ) {
        assertPurchaseProductionReady(existingContract.items);
      }
      const contract = await tx.purchaseContract.update({
        where: { id },
        data: {
          status: settledStatus,
          ...(isTransition && targetStatus === PURCHASE_STATUS.READY
            ? { productionCompletedAt: new Date() }
            : {}),
        },
      });

      // 正向流转：入库时创建库存记录
      if (isTransition && targetStatus === PURCHASE_STATUS.RECEIVED) {
        applyResult = await applyPurchaseInStock(tx, id);
      }

      return contract;
    });

    // 记录入库操作的审计日志
    if (applyResult && (applyResult.created > 0 || applyResult.skipped > 0)) {
      await auditLog.logOperation({
        userId: req.user?.id,
        action: 'APPLY_IN_STOCK',
        entity: 'PurchaseContract',
        entityId: id,
        oldValue: { status: contract.status },
        newValue: { status: PURCHASE_STATUS.RECEIVED, createdCount: applyResult.created, skippedCount: applyResult.skipped },
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
 * 2. 统一附件服务收紧目录/文件权限后保存文件信息到数据库
 * 3. 返回文件记录
 */
const uploadFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    if (!req.file) {
      throw createError('请选择要上传的文件', 400);
    }
    
    const contractFile = await fileService.createFile(
      id,
      fileService.CONTRACT_TYPE.PURCHASE,
      req.file,
      req.body?.description,
      req.body?.category,
    );
    
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
 * 思路：查找文件记录，相对路径从 UPLOAD_DIR 解析，通过 res.download 返回文件流
 */
const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const path = require('path');
    const { getFullPath } = require('../utils/upload');

    const file = await prisma.contractFile.findUnique({ where: { id: fileId } });
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
        price: Number(h.unitPrice),
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
  getInvoicePreparation,
  registerInvoiceNumbers,
  create,
  update,
  remove,
  addItem,
  updateProductionDetails,
  updateStatus,
  uploadFile,
  getFiles,
  deleteFile,
  downloadFile,
  getNextContractNo,
  getProductPriceHistory,
  getSuppliersByProducts,
};
