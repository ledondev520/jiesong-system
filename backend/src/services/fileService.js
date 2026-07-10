/**
 * Input: Prisma Client、文件上传工具
 * Output: 统一合同附件服务，并将落盘附件收紧为最小文件权限
 * Pos: 文件管理领域服务，屏蔽采购/出口合同附件的底层表差异
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { deleteFile: removeFile, getFullPath } = require('../utils/upload');

const CONTRACT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
};

const CONTRACT_FILE_CATEGORY = Object.freeze({
  OTHER: 'OTHER',
  SIGNED_CONTRACT: 'SIGNED_CONTRACT',
  PRODUCTION_PHOTO: 'PRODUCTION_PHOTO',
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  CARRIER_DOCUMENT: 'CARRIER_DOCUMENT',
  SYSTEM_GENERATED_WORD: 'SYSTEM_GENERATED_WORD',
  SYSTEM_GENERATED_PDF: 'SYSTEM_GENERATED_PDF',
});

const normalizeCategory = (value) => (
  Object.values(CONTRACT_FILE_CATEGORY).includes(value) ? value : CONTRACT_FILE_CATEGORY.OTHER
);

/**
 * 职责：在建立数据库记录前收紧用户上传附件的落盘权限。
 * 权限变更失败时抛错，避免留下已登记但未受保护的合同凭证。
 */
const secureStoredFile = (absolutePath) => {
  const directory = path.dirname(absolutePath);
  fs.chmodSync(directory, 0o700);
  fs.chmodSync(absolutePath, 0o600);
};

/**
 * 职责：统一创建合同附件记录
 * @param {string} contractId - 合同ID
 * @param {string} contractType - PURCHASE | SALES
 * @param {Object} file - multer 文件对象
 * @param {string} [description] - 文件描述
 */
const createFile = async (contractId, contractType, file, description, category) => {
  const { getRelativePath } = require('../utils/upload');
  secureStoredFile(file.path);
  const baseData = {
    fileName: file.originalname,
    filePath: getRelativePath(file.path),
    fileType: file.mimetype,
    mimeType: file.mimetype,
    fileSize: file.size,
    description: description || null,
    category: normalizeCategory(category),
    checksum: null,
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
 * 职责：把系统生成的 Word/PDF 以内容校验和归档为合同版本。
 * 相同合同、分类和内容复用既有记录；新内容写入 0700 目录和 0600 文件。
 */
const archiveGeneratedFile = async ({
  contractId,
  contractType = CONTRACT_TYPE.PURCHASE,
  buffer,
  fileName,
  mimeType,
  category,
  description,
  uploadRoot = config.upload.dir,
  prismaClient = prisma,
} = {}) => {
  if (!contractId || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('归档系统生成合同缺少合同ID或文件内容');
  }
  const normalizedCategory = normalizeCategory(category);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const isSales = contractType === CONTRACT_TYPE.SALES;
  const delegate = isSales ? prismaClient.salesContractFile : prismaClient.contractFile;
  const relationField = isSales ? 'salesContractId' : 'purchaseContractId';
  const existing = await delegate.findFirst({
    where: {
      [relationField]: contractId,
      category: normalizedCategory,
      checksum,
    },
  });
  if (existing) return existing;

  const dateDir = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const safeContractId = String(contractId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const extension = path.extname(fileName || '') || (mimeType === 'application/pdf' ? '.pdf' : '.bin');
  const directory = path.join(uploadRoot, 'generated', dateDir, safeContractId);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const absolutePath = path.join(directory, `${checksum}${extension}`);
  fs.writeFileSync(absolutePath, buffer, { mode: 0o600 });
  fs.chmodSync(absolutePath, 0o600);

  return delegate.create({
    data: {
      [relationField]: contractId,
      fileName,
      filePath: path.relative(uploadRoot, absolutePath),
      fileType: mimeType,
      mimeType,
      fileSize: buffer.length,
      description: description || '系统生成合同版本',
      category: normalizedCategory,
      checksum,
    },
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
  CONTRACT_FILE_CATEGORY,
  archiveGeneratedFile,
  createFile,
  listFiles,
  findFileById,
  deleteFileRecord,
};
