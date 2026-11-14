/** Input: authenticated XLSX upload. Output: packet preview or the three-sheet download, without business-record mutations. */
const service = require('../services/exportPacketExcelService');
const { createError } = require('../middleware/errorHandler');
const { success } = require('../utils/response');

const readInput = (req) => {
  if (!req.file?.buffer) throw createError('请上传出货汇总 Excel', 400);
  let options;
  try { options = JSON.parse(req.body?.options || '{}'); }
  catch { throw createError('制单参数不是有效JSON', 400); }
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw createError('制单参数格式无效', 400);
  return options;
};

const preview = async (req, res, next) => {
  try { success(res, await service.prepareExcelPacket(req.file?.buffer, readInput(req))); }
  catch (error) { next(error); }
};
const generate = async (req, res, next) => {
  try {
    const result = await service.generateExcelPacket(req.file?.buffer, readInput(req));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(result.buffer);
  } catch (error) { next(error); }
};
module.exports = { preview, generate };
