/**
 * Input: uploaded CSV/xlsx bytes
 * Output: string-valued rows and validated headers
 * Pos: shared import boundary; never evaluates workbook formulas
 */
const path = require('node:path');
const ExcelJS = require('exceljs');
const Papa = require('papaparse');
const { createError } = require('../middleware/errorHandler');

const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const acceptsTabularFile = name => /\.(csv|xlsx)$/i.test(name || '');

async function parseTabularFile({ originalname, buffer }) {
  const extension = path.extname(originalname || '').toLowerCase();
  if (!acceptsTabularFile(originalname)) throw createError('只支持 CSV 或 xlsx 文件', 400);
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw createError('导入文件为空', 400);
  let table;
  if (extension === '.csv') {
    const parsed = Papa.parse(buffer.toString('utf8').replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy' });
    if (parsed.errors.length) throw createError('CSV 解析错误', 400);
    table = parsed.data;
  } else {
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(buffer); }
    catch { throw createError('xlsx 文件损坏或格式无效', 400); }
    if (workbook.worksheets.length !== 1) throw createError('xlsx 必须只包含一个数据工作表', 400);
    const sheet = workbook.worksheets[0];
    if (sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > MAX_COLUMNS) throw createError('导入文件超出行列限制', 400);
    table = [];
    sheet.eachRow(row => {
      const cells = [];
      for (let column = 1; column <= sheet.columnCount; column++) {
        const cell = row.getCell(column);
        if (cell.type === ExcelJS.ValueType.Formula || cell.type === ExcelJS.ValueType.Error) {
          throw createError('xlsx 不允许公式或错误单元格，请粘贴为值', 400);
        }
        cells.push(cell.text);
      }
      if (cells.some(value => value.trim())) table.push(cells);
    });
  }
  if (table.length < 2) throw createError('导入文件必须包含表头及数据行', 400);
  if (table.length > MAX_ROWS + 1 || table[0].length > MAX_COLUMNS) throw createError('导入文件超出行列限制', 400);
  const headers = table[0].map(value => String(value).trim());
  if (headers.some(value => !value) || new Set(headers).size !== headers.length) throw createError('表头为空或重复', 400);
  const data = table.slice(1).map(row => {
    if (row.length !== headers.length) throw createError('数据列数与表头不一致', 400);
    return Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? '').trim()]));
  });
  return { headers, data, errors: [] };
}

module.exports = { parseTabularFile, acceptsTabularFile, MAX_ROWS };
