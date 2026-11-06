/**
 * Input: multer库、配置
 * Output: 文件上传中间件；磁盘上传写流前校验并保护可信根下的日期目录，非法格式返回客户端错误
 * Pos: 文件上传工具，处理合同文件等上传；附件下载/删除路径统一经 resolveContainedUploadPath 做 realpath 包含校验
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');

// 确保上传目录存在
const uploadDir = config.upload.dir;
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 存储配置
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 按日期分目录
    const dateDir = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const destDir = path.join(uploadDir, dateDir);
    try {
      const realRoot = fs.realpathSync(path.resolve(uploadDir));
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true, mode: 0o700 });
      }
      const stat = fs.lstatSync(destDir);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw createError('上传目录存储路径无效', 400);
      const realDestination = fs.realpathSync(destDir);
      if (realDestination !== path.join(realRoot, dateDir)) throw createError('上传目录存储路径无效', 400);
      fs.chmodSync(realDestination, 0o700);
    } catch (error) {
      return cb(error); // Refuse storage before Multer starts a file stream.
    }
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

// 文件过滤器
const fileFilter = (req, file, cb) => {
  // 允许的文件类型
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(createError('不支持的文件类型', 400), false);
  }
};

// 创建multer实例
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.upload.maxSize, // 默认50MB
  },
});

// 合同附件专用：限制 10MB，仅允许 pdf/jpg/png/xlsx/docx
const contractFileFilter = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(createError('仅支持 PDF、JPG、PNG、XLSX、DOCX 格式', 400), false);
  }
};

const contractUpload = multer({
  storage,
  fileFilter: contractFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

// 装箱单核对专用：先以内存接收，解析通过或转人工核对后由 fileService 受限归档原件。
const pdfCheckUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(createError('仅支持 PDF 格式的装箱单', 400), false);
    }
  },
  limits: {
    fileSize: 20 * 1024 * 1024, // 20MB
  },
});

/**
 * 职责：获取文件的相对路径（用于存储到数据库）
 * @param {string} absolutePath - 文件绝对路径
 * @returns {string} 相对路径
 */
const getRelativePath = (absolutePath) => {
  return path.relative(uploadDir, absolutePath);
};

/**
 * 职责：获取文件的完整URL
 * @param {string} relativePath - 相对路径
 * @returns {string} 完整路径
 */
const getFullPath = (relativePath) => {
  return path.join(uploadDir, relativePath);
};

/**
 * 职责：把库里存的附件路径解析为 UPLOAD_DIR 内的真实普通文件路径（下载/删除共用）
 * 思路：拒绝 NUL 与根外/`..` 路径，对根和目标都取 realpath 后再做包含检查（根本身可为符号链接/相对路径），
 *       目标必须是普通文件（lstat）。文件不存在抛 404，其余一律 400，调用方不得再自行拼路径。
 * @param {string} storedPath - ContractFile.filePath（相对 UPLOAD_DIR 或历史绝对路径）
 * @returns {{ path: string, realPath: string }} path 为根内的词法路径，realPath 为真实路径
 */
const resolveContainedUploadPath = (storedPath, uploadRoot = uploadDir) => {
  const invalidPath = () => createError('附件存储路径无效', 400);
  if (typeof storedPath !== 'string' || !storedPath || storedPath.includes('\0')) throw invalidPath();
  const absoluteRoot = path.resolve(uploadRoot);
  const target = path.resolve(absoluteRoot, storedPath);
  if (!target.startsWith(`${absoluteRoot}${path.sep}`)) throw invalidPath();
  let realRoot;
  let realTarget;
  try {
    realRoot = fs.realpathSync(absoluteRoot);
    realTarget = fs.realpathSync(target);
  } catch (error) {
    if (error?.code === 'ENOENT') throw createError('附件文件不存在', 404);
    throw invalidPath();
  }
  if (!realTarget.startsWith(`${realRoot}${path.sep}`)) throw invalidPath();
  if (!fs.lstatSync(realTarget).isFile()) throw invalidPath();
  return { path: target, realPath: realTarget };
};

/**
 * 职责：删除文件（路径必须通过 resolveContainedUploadPath；文件已不存在视为已删除）
 * @param {string} relativePath - 相对路径
 */
const deleteFile = (relativePath) => {
  let resolved;
  try {
    resolved = resolveContainedUploadPath(relativePath);
  } catch (error) {
    if (error?.statusCode === 404) return;
    throw error;
  }
  fs.unlinkSync(resolved.path);
};

module.exports = {
  upload,
  contractUpload,
  pdfCheckUpload,
  getRelativePath,
  getFullPath,
  resolveContainedUploadPath,
  deleteFile,
};
