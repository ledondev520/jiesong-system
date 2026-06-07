/**
 * Input: Prisma Client、文件上传工具
 * Output: 统一合同附件服务
 * Pos: 文件管理领域服务，屏蔽采购/出口合同附件的底层表差异
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const { deleteFile: removeFile, getFullPath } = require('../utils/upload');

const CONTRACT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
};

/**
 * 职责：统一创建合同附件记录
 * @param {string} contractId - 合同ID
 * @param {string} contractType - PURCHASE | SALES
 * @param {Object} file - multer 文件对象
 * @param {string} [description] - 文件描述
 */
const createFile = async (contractId, contractType, file, description) => {
  const { getRelativePath } = require('../utils/upload');
  const baseData = {
    fileName: file.originalname,
    filePath: getRelativePath(file.path),
    fileType: file.mimetype,
    mimeType: file.mimetype,
    fileSize: file.size,
    description: description || null,
  };

  if (contractType === CONTRACT_TYPE.SALES) {
    return prisma.salesContractFile.create({
      data: { ...baseData, salesContractId: contractId },
    });
  }

  return prisma.contractFile.create({
    data: { ...baseData, purchaseContractId: contractId },
  });
};

/**
 * 职责：统一查询合同附件列表
 * @param {string} contractId - 合同ID
 * @param {string} contractType - PURCHASE | SALES
 */
const listFiles = async (contractId, contractType) => {
  if (contractType === CONTRACT_TYPE.SALES) {
    const files = await prisma.salesContractFile.findMany({
      where: { salesContractId: contractId },
      orderBy: { uploadedAt: 'desc' },
    });
    return files.map((f) => ({ ...f, contractType: CONTRACT_TYPE.SALES }));
  }

  const files = await prisma.contractFile.findMany({
    where: { purchaseContractId: contractId },
    orderBy: { uploadedAt: 'desc' },
  });
  return files.map((f) => ({ ...f, contractType: CONTRACT_TYPE.PURCHASE }));
};

/**
 * 职责：根据 fileId 查找文件（不区分合同类型，双表查询）
 * @param {string} fileId
 * @returns {Object|null} 文件记录 + contractType
 */
const findFileById = async (fileId) => {
  let file = await prisma.contractFile.findUnique({ where: { id: fileId } });
  if (file) return { ...file, contractType: CONTRACT_TYPE.PURCHASE };

  file = await prisma.salesContractFile.findUnique({ where: { id: fileId } });
  if (file) return { ...file, contractType: CONTRACT_TYPE.SALES };

  return null;
};

/**
 * 职责：删除文件记录并清理物理文件
 * @param {string} fileId
 */
const deleteFileRecord = async (fileId) => {
  const file = await findFileById(fileId);
  if (!file) return null;

  if (file.contractType === CONTRACT_TYPE.SALES) {
    await prisma.salesContractFile.delete({ where: { id: fileId } });
  } else {
    await prisma.contractFile.delete({ where: { id: fileId } });
  }

  // 清理物理文件
  removeFile(file.filePath);

  return file;
};

module.exports = {
  CONTRACT_TYPE,
  createFile,
  listFiles,
  findFileById,
  deleteFileRecord,
};
