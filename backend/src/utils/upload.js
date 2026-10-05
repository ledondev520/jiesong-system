/**
 * Input: multer库、配置
 * Output: 文件上传中间件（通用 upload、合同附件 contractUpload、装箱单核对内存接收 pdfCheckUpload）；非法格式返回客户端错误
 * Pos: 文件上传工具，处理合同文件等上传
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
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
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
 * 职责：删除文件
 * @param {string} relativePath - 相对路径
 */
const deleteFile = (relativePath) => {
  const fullPath = getFullPath(relativePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

module.exports = {
  upload,
  contractUpload,
  pdfCheckUpload,
  getRelativePath,
  getFullPath,
  deleteFile,
};
