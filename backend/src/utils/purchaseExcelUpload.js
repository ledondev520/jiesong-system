/**
 * Input: multer、上传大小配置、客户端文件名扩展名
 * Output: 仅接受 .xlsx/.xls 的内存上传中间件；不创建上传目录或磁盘文件
 * Pos: 采购合同 Excel 导入专用上传边界
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const multer = require('multer');
const path = require('path');
const config = require('../config');
const { createError } = require('../middleware/errorHandler');

// Keep purchase imports compatible with the UI's .xlsx/.xls and configured size.
// This module does not load disk storage or retain Confidential workbooks.
const purchaseExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxSize },
  fileFilter: (req, file, cb) => {
    if (['.xlsx', '.xls'].includes(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(createError('仅支持 .xlsx 或 .xls 格式的 Excel 文件', 400));
    }
  },
});

module.exports = { purchaseExcelUpload };
