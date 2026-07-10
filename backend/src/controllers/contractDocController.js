/**
 * Input: 采购合同ID
 * Output: 购销合同 Word/PDF 文档
 * Pos: 控制器，处理合同文档生成、下载与预览请求
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const contractDocService = require('../services/contractDocService');
const fileService = require('../services/fileService');
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
    const format = String(req.body?.format || 'docx').toLowerCase() === 'pdf' ? 'pdf' : 'docx';

    if (format === 'docx') {
      const templateExists = await contractDocService.checkTemplateExists();
      if (!templateExists) throw createError('合同模板不存在，请先上传模板文件', 400);
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
    
    const options = {
      storeName,
      deliveryAddress,
      deliveryContact,
      depositRate: depositRate === undefined ? 30 : Number(depositRate),
    };
    const isPdf = format === 'pdf';
    const buffer = isPdf
      ? await contractDocService.generatePurchaseContractPdf(purchaseContract, options)
      : await contractDocService.generatePurchaseContract(purchaseContract, options);
    const filename = isPdf
      ? contractDocService.generatePdfFilename(purchaseContract)
      : contractDocService.generateFilename(purchaseContract, storeName);
    const mimeType = isPdf
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const category = isPdf ? 'SYSTEM_GENERATED_PDF' : 'SYSTEM_GENERATED_WORD';

    // 系统生成件先归档再返回，确保下载成功对应一份可追溯版本。
    await fileService.archiveGeneratedFile({
      contractId: id,
      contractType: 'PURCHASE',
      buffer,
      fileName: filename,
      mimeType,
      category,
      description: isPdf ? '系统生成 PDF 合同' : '系统生成 Word 合同',
    });

    const encodedFilename = encodeURIComponent(filename);

    res.setHeader('Content-Type', mimeType);
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
 * 职责：获取采购合同PDF文档（前端预览）
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
    
    const buffer = await contractDocService.generatePurchaseContractPdf(purchaseContract, {});
    const filename = contractDocService.generatePdfFilename(purchaseContract);
    const encodedFilename = encodeURIComponent(filename);
    
    res.setHeader('Content-Type', 'application/pdf');
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
