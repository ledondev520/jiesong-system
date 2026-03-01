/**
 * Input: 采购合同ID
 * Output: 购销合同Word文档
 * Pos: 控制器，处理合同文档生成请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const contractDocService = require('../services/contractDocService');
const { success } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');

/**
 * 职责：根据采购合同生成购销合同文档
 * 思路：
 *   1. 获取采购合同详情（含供应商、商品明细）
 *   2. 调用服务生成Word文档
 *   3. 返回文档下载
 */
const generateFromPurchase = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { storeName, deliveryAddress, deliveryContact, depositRate } = req.body;
    
    // 0. 检查模板是否存在
    const templateExists = await contractDocService.checkTemplateExists();
    if (!templateExists) {
      throw createError('合同模板不存在，请先上传模板文件', 400);
    }
    
    // 1. 获取采购合同详情
    const purchaseContract = await prisma.purchaseContract.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    
    if (!purchaseContract) {
      throw createError('采购合同不存在', 404);
    }
    
    // 2. 生成文档
    const buffer = await contractDocService.generatePurchaseContract(purchaseContract, {
      storeName,
      deliveryAddress,
      deliveryContact,
      depositRate: depositRate ? parseInt(depositRate) : 30, // 默认30%
    });
    
    // 3. 返回文档（文件名格式：购销合同CGXXXXXX-店铺-产品名.docx）
    const filename = contractDocService.generateFilename(purchaseContract, storeName);
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.send(buffer);
    
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：上传合同模板
 */
const uploadTemplate = async (req, res, next) => {
  try {
    if (!req.file) {
      throw createError('请上传模板文件', 400);
    }
    
    await contractDocService.saveTemplate(req.file.buffer);
    success(res, null, '模板上传成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：检查模板状态
 */
const checkTemplate = async (req, res, next) => {
  try {
    const exists = await contractDocService.checkTemplateExists();
    success(res, { exists }, exists ? '模板已配置' : '模板未配置');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取模板列表（当前仅支持单模板）
 */
const getTemplates = async (req, res, next) => {
  try {
    const info = await contractDocService.getTemplateInfo();
    success(res, {
      items: info.exists ? [info] : [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：删除合同模板（仅管理员）
 */
const deleteTemplate = async (req, res, next) => {
  try {
    const exists = await contractDocService.checkTemplateExists();
    if (!exists) {
      throw createError('模板不存在', 404);
    }
    await contractDocService.removeTemplate();
    success(res, null, '模板删除成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取采购合同PDF文档（兼容前端预览）
 */
const getContractPdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // 1. 获取采购合同详情
    const purchaseContract = await prisma.purchaseContract.findUnique({
      where: { id },
      include: {
        supplier: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
    
    if (!purchaseContract) {
      throw createError('采购合同不存在', 404);
    }
    
    const buffer = await contractDocService.generatePurchaseContract(purchaseContract, {});
    const filename = contractDocService.generateFilename(purchaseContract, purchaseContract.storeName);
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `inline; filename="${encodedFilename}"; filename*=UTF-8''${encodedFilename}`);
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  generateFromPurchase,
  uploadTemplate,
  checkTemplate,
  getTemplates,
  deleteTemplate,
  getContractPdf,
};
