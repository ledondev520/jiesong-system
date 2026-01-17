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

/**
 * 职责：获取采购合同列表
 * 思路：支持关键字搜索合同编号和供应商名称
 */
const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, supplierId, keyword } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    
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
        take: parseInt(pageSize),
        include: { supplier: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.purchaseContract.count({ where }),
    ]);
    
    paginated(res, contracts, total, parseInt(page), parseInt(pageSize));
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
 */
const create = async (req, res, next) => {
  try {
    const data = req.body;
    
    // 生成合同编号
    const year = new Date().getFullYear().toString().slice(-2);
    const count = await prisma.purchaseContract.count({
      where: { contractNo: { startsWith: `CG${year}` } },
    });
    const contractNo = `CG${year}${String(count + 1).padStart(5, '0')}`;
    
    const contract = await prisma.purchaseContract.create({
      data: {
        contractNo,
        supplierId: data.supplierId,
        signedAt: data.signedAt ? new Date(data.signedAt) : null,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : null,
        note: data.note,
      },
      include: { supplier: true },
    });
    
    created(res, contract, '采购合同创建成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：更新采购合同
 */
const update = async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = req.body;
    
    const contract = await prisma.purchaseContract.update({
      where: { id },
      data: {
        signedAt: data.signedAt ? new Date(data.signedAt) : undefined,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
        invoiceNo: data.invoiceNo,
        note: data.note,
      },
      include: { supplier: true },
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
    const { status } = req.body;
    
    const contract = await prisma.purchaseContract.update({
      where: { id },
      data: { status },
    });
    
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
  getNextContractNo,
};
