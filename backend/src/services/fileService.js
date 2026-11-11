/**
 * Input: Prisma Client、文件上传工具
 * Output: 统一合同附件服务、受限路径与文件身份校验后的失败上传清理、Buffer 归档与受保护凭证访问/删除约束
 * Pos: 文件管理领域服务，屏蔽采购/出口合同附件的底层表差异
 *
 * 下载/删除前的库内路径统一经 resolveContainedUploadPath（realpath 包含 UPLOAD_DIR）。
 */

const prisma = require('../utils/prisma');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');
const { deleteFile: removeFile, getFullPath, resolveContainedUploadPath } = require('../utils/upload');

const CONTRACT_TYPE = {
  PURCHASE: 'PURCHASE',
  SALES: 'SALES',
};

const CONTRACT_FILE_CATEGORY = Object.freeze({
  OTHER: 'OTHER',
  SIGNED_CONTRACT: 'SIGNED_CONTRACT',
  PRODUCTION_PHOTO: 'PRODUCTION_PHOTO',
  RECEIPT_PHOTO: 'RECEIPT_PHOTO',
  SUPPLIER_INVOICE: 'SUPPLIER_INVOICE',
  CARRIER_DOCUMENT: 'CARRIER_DOCUMENT',
  SYSTEM_GENERATED_WORD: 'SYSTEM_GENERATED_WORD',
  SYSTEM_GENERATED_PDF: 'SYSTEM_GENERATED_PDF',
  SYSTEM_GENERATED_XLSX: 'SYSTEM_GENERATED_XLSX',
});

// req.body 字段可能是数组/对象（类型混淆，CodeQL #82）；描述/分类只接受普通字符串。
const optionalText = (value, label) => {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw createError(`${label} 必须是字符串`, 400);
  return value || null;
};

const normalizeCategory = (value) => (
  Object.values(CONTRACT_FILE_CATEGORY).includes(value) ? value : CONTRACT_FILE_CATEGORY.OTHER
);

// 已确认清单含财务核验行；所有附件入口复用现有 ADMIN/FINANCE 边界。
// 采购合同文书（含供应商银行信息的生成件、签章合同、供应商发票）与 B96 的 contract-doc 角色一致：
// 读 ADMIN/PURCHASE/FINANCE/BOSS，写/删 ADMIN/PURCHASE/FINANCE；其余附件类别沿用原权限。
const RESTRICTED_PURCHASE_FILE_CATEGORIES = new Set([
  CONTRACT_FILE_CATEGORY.SYSTEM_GENERATED_WORD,
  CONTRACT_FILE_CATEGORY.SYSTEM_GENERATED_PDF,
  CONTRACT_FILE_CATEGORY.SIGNED_CONTRACT,
  CONTRACT_FILE_CATEGORY.SUPPLIER_INVOICE,
]);
const PURCHASE_ARTIFACT_READ_ROLES = ['ADMIN', 'PURCHASE', 'FINANCE', 'BOSS'];
const PURCHASE_ARTIFACT_WRITE_ROLES = ['ADMIN', 'PURCHASE', 'FINANCE'];
const isRestrictedPurchaseFile = (file) => (
  (file?.contractType === CONTRACT_TYPE.PURCHASE || Boolean(file?.purchaseContractId))
  && RESTRICTED_PURCHASE_FILE_CATEGORIES.has(file?.category)
);

/** action: 'read'（默认）| 'write' | 'delete' */
const assertFileAccess = (file, user, { action = 'read' } = {}) => {
  // Agent callers have no req.user; attachments are human-only.
  if (!user?.role) throw createError('无权访问附件', 403);
  if (isRestrictedPurchaseFile(file)) {
    const roles = action === 'read' ? PURCHASE_ARTIFACT_READ_ROLES : PURCHASE_ARTIFACT_WRITE_ROLES;
    if (!roles.includes(user.role)) throw createError('无权访问采购合同文书附件', 403);
  }
  if (String(file?.description || '').startsWith('退税出货清单确认:')
    && !['ADMIN', 'FINANCE'].includes(user?.role)) {
    throw createError('仅管理员或财务可访问已确认退税清单', 403);
  }
  // R3 P1-3：出口三单归档工作簿由 ADMIN/SALES/FINANCE 生成，仓库角色不得下载/删除（描述前缀见 exportPacketService）。
  if (String(file?.description || '').startsWith('出口三单生成版本')
    && user.role === 'WAREHOUSE') {
    throw createError('仓库角色无权访问出口三单归档文件', 403);
  }
};

// 到货照片是 Confidential 到货证据：仅采购合同、且仅能登记到货的人类角色可写/删。
const RECEIPT_PHOTO_ROLES = ['ADMIN', 'PURCHASE', 'WAREHOUSE'];
const assertReceiptPhotoAccess = (contractType, category, user) => {
  if (category === CONTRACT_FILE_CATEGORY.RECEIPT_PHOTO
    && (contractType !== CONTRACT_TYPE.PURCHASE || !RECEIPT_PHOTO_ROLES.includes(user?.role))) {
    throw createError('仅管理员、采购或仓库可在采购合同上登记或删除到货照片', 403);
  }
};

const assertContractType = (contractType) => {
  if (!Object.values(CONTRACT_TYPE).includes(contractType)) {
    throw createError('合同类型仅支持 PURCHASE 或 SALES', 400);
  }
};

/** Validate the new Multer payload before chmod or unlink; configured-root symlinks are trusted. */
const resolveUploadedPayload = (filePath, uploadRoot) => {
  const invalidPath = () => createError('上传文件存储路径无效', 400);
  if (typeof filePath !== 'string' || !filePath || filePath.includes('\0')) throw invalidPath();

  // A trusted relative UPLOAD_DIR may itself contain '..'; reject traversal only
  // in the supplied suffix, while still accepting Multer's path.join(root, name).
  const normalizedRoot = path.normalize(uploadRoot);
  const configuredPrefix = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;
  const suffix = filePath.startsWith(configuredPrefix) ? filePath.slice(configuredPrefix.length) : filePath;
  if (suffix.split(/[\\/]/).includes('..')) throw invalidPath();

  const absoluteRoot = path.resolve(uploadRoot);
  const absolutePath = path.resolve(filePath);
  if (!absolutePath.startsWith(`${absoluteRoot}${path.sep}`)) throw invalidPath();
  const relativePath = path.relative(absoluteRoot, absolutePath);
  const realRoot = fs.realpathSync(absoluteRoot);
  const realPath = fs.realpathSync(absolutePath);
  if (!realPath.startsWith(`${realRoot}${path.sep}`)
    || realPath !== path.resolve(realRoot, relativePath)) throw invalidPath();

  const stat = fs.lstatSync(realPath);
  if (!stat.isFile() || stat.nlink !== 1) throw invalidPath();
  return { path: realPath, relativePath, dev: stat.dev, ino: stat.ino };
};

/**
 * 职责：在建立数据库记录前收紧用户上传附件的落盘权限。
 * 权限变更失败时抛错，避免留下已登记但未受保护的合同凭证。
 */
const secureStoredFile = (absolutePath) => {
  const directory = path.dirname(absolutePath);
  fs.chmodSync(directory, 0o700);
  fs.chmodSync(absolutePath, 0o600);
};

const validateUploadedFileCategory = (file, category) => {
  if (
    category === CONTRACT_FILE_CATEGORY.PRODUCTION_PHOTO
    && !['image/jpeg', 'image/png'].includes(file?.mimetype)
  ) {
    throw createError('生产实物图仅支持 JPG、PNG 格式', 400);
  }
  if (
    category === CONTRACT_FILE_CATEGORY.RECEIPT_PHOTO
    && !['image/jpeg', 'image/png'].includes(file?.mimetype)
  ) {
    throw createError('到货照片仅支持 JPG、PNG 格式', 400);
  }
};

/**
 * 职责：统一创建合同附件记录
 * @param {string} contractId - 合同ID
 * @param {string} contractType - PURCHASE | SALES
 * @param {Object} file - multer 文件对象
 * @param {string} [description] - 文件描述
 * @param {Object} [user] - req.user，用于到货照片角色校验
 */
const createFile = async (contractId, contractType, file, description, category, user) => {
  const filePath = file?.path;
  const uploadRoot = config.upload.dir;
  let payload;
  try {
    payload = resolveUploadedPayload(filePath, uploadRoot);
    // Tighten the new payload before any asynchronous lookup, including failure paths.
    secureStoredFile(payload.path);
    assertContractType(contractType);
    const normalizedCategory = normalizeCategory(optionalText(category, 'category'));
    const normalizedDescription = optionalText(description, 'description');
    assertReceiptPhotoAccess(contractType, normalizedCategory, user);
    if (isRestrictedPurchaseFile({ contractType, category: normalizedCategory })) {
      assertFileAccess({ contractType, category: normalizedCategory }, user, { action: 'write' });
    }
    // Provenance: system-generated labels are reserved for archiveGeneratedFile/archiveBufferFile.
    if (String(normalizedCategory).startsWith('SYSTEM_GENERATED_')) throw createError('不能手动上传系统生成类别的附件', 400);
    validateUploadedFileCategory(file, normalizedCategory);
    const isSales = contractType === CONTRACT_TYPE.SALES;
    const contract = await (isSales ? prisma.salesContract : prisma.purchaseContract).findUnique({
      where: { id: contractId }, select: { id: true },
    });
    if (!contract) throw createError('合同不存在或已被删除', 404);

    const baseData = {
      fileName: file.originalname,
      filePath: payload.relativePath,
      fileType: file.mimetype,
      mimeType: file.mimetype,
      fileSize: file.size,
      description: normalizedDescription,
      category: normalizedCategory,
      checksum: null,
    };
    return await (isSales ? prisma.salesContractFile : prisma.contractFile).create({
      data: { ...baseData, [isSales ? 'salesContractId' : 'purchaseContractId']: contractId },
    });
  } catch (error) {
    // req.file is this request's new multer payload; never remove another version.
    try {
      if (payload) {
        // Recheck after awaited lookups/writes; path or inode replacement is not this upload.
        const current = resolveUploadedPayload(filePath, uploadRoot);
        if (current.path !== payload.path || current.dev !== payload.dev || current.ino !== payload.ino) {
          throw createError('上传文件已变更，不能清理其他文件', 400);
        }
        fs.unlinkSync(current.path);
      }
    } catch (cleanupError) {
      // Keep the original failure classification; never log payload paths or bytes.
      if (cleanupError.code !== 'ENOENT') {
        error.uploadCleanupFailed = true;
        console.error('[fileService] rejected upload cleanup failed');
      }
    }
    if (error.code === 'P2003') throw createError('合同不存在或已被删除', 404);
    throw error;
  }
};

/**
 * 职责：把内存文件按内容校验和归档为合同附件。
 * 相同合同、分类和内容复用既有记录；新内容写入 0700 目录和 0600 文件。
 */
const archiveBufferFile = async ({
  contractId,
  contractType = CONTRACT_TYPE.PURCHASE,
  buffer,
  fileName,
  mimeType,
  category,
  description,
  storageScope = 'ingested',
  defaultDescription = '归档文件',
  uploadRoot = config.upload.dir,
  prismaClient = prisma,
} = {}) => {
  if (!contractId || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('归档文件缺少合同ID或文件内容');
  }
  const normalizedCategory = normalizeCategory(optionalText(category, 'category'));
  const normalizedDescription = optionalText(description, 'description');
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
  const safeStorageScope = String(storageScope || 'ingested').replace(/[^a-zA-Z0-9_-]/g, '_');
  const directory = path.join(uploadRoot, safeStorageScope, dateDir, safeContractId);
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
      fileSize: Buffer.byteLength(buffer),
      description: normalizedDescription || defaultDescription,
      category: normalizedCategory,
      checksum,
    },
  });
};

const archiveGeneratedFile = async (options = {}) => archiveBufferFile({
  ...options,
  storageScope: 'generated',
  defaultDescription: '系统生成合同版本',
});

/**
 * 职责：统一查询合同附件列表
 * @param {string} contractId - 合同ID
 * @param {string} contractType - PURCHASE | SALES
 */
const listFiles = async (contractId, contractType = CONTRACT_TYPE.PURCHASE) => {
  assertContractType(contractType);
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

/** 列表/详情内嵌附件：无权读取采购合同文书的角色看不到这些行。 */
const filterVisibleFiles = (files, user) => (files || []).filter((f) => {
  try { assertFileAccess({ ...f, contractType: f.contractType || CONTRACT_TYPE.PURCHASE }, user); return true; } catch { return false; }
});

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

  // 先校验存储路径在 UPLOAD_DIR 内：库里被篡改/符号链接逃逸的路径拒绝删除，记录也不动
  try {
    resolveContainedUploadPath(file.filePath);
  } catch (error) {
    if (error?.statusCode !== 404) throw error;
  }

  if (file.contractType === CONTRACT_TYPE.SALES) {
    const checkCount = await prisma.packingListCheck.count({
      where: { salesContractFileId: fileId },
    });
    if (checkCount > 0) {
      throw createError('该船司文件已有装箱单核对记录，不能删除；请保留原始凭证', 409);
    }
    await prisma.salesContractFile.delete({ where: { id: fileId } });
  } else {
    await prisma.contractFile.delete({ where: { id: fileId } });
  }

  // 清理物理文件
  removeFile(file.filePath);

  return file;
};

module.exports = {
  resolveContainedUploadPath,
  CONTRACT_TYPE,
  CONTRACT_FILE_CATEGORY,
  assertFileAccess,
  filterVisibleFiles,
  assertReceiptPhotoAccess,
  archiveBufferFile,
  archiveGeneratedFile,
  createFile,
  listFiles,
  findFileById,
  deleteFileRecord,
};
