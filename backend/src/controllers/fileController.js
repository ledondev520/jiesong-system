/**
 * Input: fileService、响应工具
 * Output: 合同附件接口；含票面核验行的退税确认清单只允许管理员/财务下载或删除
 * Pos: 合同附件管理控制器，提供上传、列表、下载、删除接口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');
const { success, created } = require('../utils/response');
const { createError } = require('../middleware/errorHandler');
const fileService = require('../services/fileService');
const { getFullPath } = require('../utils/upload');
// 与退税清单确认接口一致，防止经通用附件接口读取财务核验行。
const assertPreparationAccess = (file, user) => {
  if (String(file?.description || '').startsWith('退税出货清单确认:')
    && !['ADMIN', 'FINANCE'].includes(user?.role)) throw createError('仅管理员或财务可访问已确认退税清单', 403);
};

/**
 * 职责：上传合同附件
 * POST /api/v1/contracts/:contractId/files
 */
const uploadFile = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    const contractType = req.body.contractType || 'PURCHASE';

    if (!req.file) {
      throw createError('请选择要上传的文件', 400);
    }

    const fileRecord = await fileService.createFile(
      contractId,
      contractType,
      req.file,
      req.body.description,
      req.body.category,
    );

    created(res, { ...fileRecord, contractType }, '文件上传成功');
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：获取合同附件列表
 * GET /api/v1/contracts/:contractId/files
 */
const listFiles = async (req, res, next) => {
  try {
    const { contractId } = req.params;
    const contractType = req.query.contractType || 'PURCHASE';

    const files = await fileService.listFiles(contractId, contractType);
    success(res, files);
  } catch (error) {
    next(error);
  }
};

/**
 * 职责：下载附件
 * GET /api/v1/files/:fileId/download
 */
const downloadFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const file = await fileService.findFileById(fileId);
    if (!file) throw createError('文件不存在', 404);
    assertPreparationAccess(file, req.user);

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
 * 职责：删除附件
 * DELETE /api/v1/files/:fileId
 */
const deleteFile = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const existing = await fileService.findFileById(fileId);
    if (!existing) throw createError('文件不存在', 404);
    assertPreparationAccess(existing, req.user);
    const file = await fileService.deleteFileRecord(fileId);
    if (!file) throw createError('文件不存在', 404);

    success(res, null, '文件删除成功');
  } catch (error) {
    next(error);
  }
};

module.exports = {
  uploadFile,
  listFiles,
  downloadFile,
  deleteFile,
};
