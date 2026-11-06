/**
 * Input: uploaded CSV/xlsx bytes
 * Output: string-valued rows and validated headers; shared in-memory multer upload for CSV/xlsx imports
 * Pos: shared import boundary; never evaluates workbook formulas and never writes uploads to disk
 */
const path = require('node:path');
const zlib = require('node:zlib');
const ExcelJS = require('exceljs');
const multer = require('multer');
const Papa = require('papaparse');
const JSZip = require('jszip');
const { SaxesParser } = require('saxes');
const { StringDecoder } = require('node:string_decoder');
const { createError } = require('../middleware/errorHandler');

const MAX_ROWS = 5000;
const MAX_COLUMNS = 100;
const acceptsTabularFile = name => /\.(csv|xlsx)$/i.test(name || '');

// In-memory only: the client filename is used for the extension check and the
// import-record label, never for fs/path access, so traversal, absolute,
// percent-encoded or NUL-byte names cannot reach the filesystem.
const tabularUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (acceptsTabularFile(file.originalname)) cb(null, true);
    else cb(createError('只支持 CSV 或 xlsx 文件', 400));
  },
});

// Check dimensions before ExcelJS expands sparse arrays, columns or merged regions.
function workbookXmlGuard(name) {
  const worksheet = /xl\/worksheets\/sheet\d+\.xml/.test(name);
  if (!worksheet && name.replace(/^\//, '') !== 'xl/workbook.xml') return null;
  const parser = new SaxesParser();
  const bounded = (value, max) => /^\d+$/.test(value || '') && Number(value) >= 1 && Number(value) <= max;
  parser.on('doctype', () => { throw new Error('Workbook DTDs are not supported'); });
  parser.on('opentag', node => {
    const tag = node.name.split(':').pop();
    const attrs = node.attributes;
    if (!worksheet) {
      if (tag === 'sheet' && !bounded(attrs.sheetId, 65535)) throw new Error('Sheet ID exceeds limit');
      return;
    }
    if (tag === 'mergeCell') throw new Error('Paste merged cells as individual values');
    if (tag === 'row' && !bounded(attrs.r, MAX_ROWS + 1)) throw new Error('Row index exceeds limit');
    if (tag === 'col' && (!bounded(attrs.min, MAX_COLUMNS) || !bounded(attrs.max, MAX_COLUMNS))) throw new Error('Column range exceeds limit');
    if (tag === 'c') {
      const coordinate = /^([A-Z]{1,3})([1-9]\d*)$/.exec(attrs.r || '');
      const column = coordinate && [...coordinate[1]].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
      if (!coordinate || column > MAX_COLUMNS || !bounded(coordinate[2], MAX_ROWS + 1)) throw new Error('Cell coordinate exceeds limit');
    }
  });
  return parser;
}

// Bound actual streamed inflation, not attacker-controlled central-directory sizes.
async function checkWorkbookArchive(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const entries = Object.values(zip.files);
  if (entries.length > 256) throw new Error('Too many ZIP entries');
  let expanded = 0;
  for (const entry of entries) {
    if (entry.dir) continue;
    await new Promise((resolve, reject) => {
      const parser = workbookXmlGuard(entry.name);
      const decoder = new StringDecoder('utf8');
      const stream = entry.nodeStream('nodebuffer');
      const fail = error => { stream.destroy(error); reject(error); };
      stream.on('error', reject);
      stream.on('end', () => {
        try { if (parser) { parser.write(decoder.end()); parser.close(); } resolve(); }
        catch (error) { fail(error); }
      });
      stream.on('data', chunk => {
        try {
          expanded += chunk.length;
          if (expanded > 32 * 1024 * 1024) throw new Error('Expanded workbook exceeds 32 MiB');
          if (parser) parser.write(decoder.write(chunk));
        } catch (error) { fail(error); }
      });
    });
  }
}

// Synchronous ZIP-bomb guard for XLSX/DOCX buffers handed to SheetJS/AdmZip (both inflate everything).
// Actually inflates each entry with a hard output cap, so forged central-directory sizes cannot hide a bomb.
// shortcut: ZIP64 and non-stored/deflate methods are rejected, upgrade if real files ever need them.
function assertSafeOfficeArchive(buffer, { maxEntries = 512, maxUncompressedBytes = 64 * 1024 * 1024, maxCompressionRatio = 1000 } = {}) {
  const invalid = () => createError('Office 文件结构无效或解压后超出限制', 400);
  if (!Buffer.isBuffer(buffer)) throw invalid();
  if (buffer.length >= 2 && buffer.readUInt16LE(0) !== 0x4b50) return; // 非 ZIP（如旧版 .xls/CSV）无 ZIP 炸弹风险，行列范围另有守卫
  if (buffer.length < 22) throw invalid();
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw invalid();
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  if (count === 0xffff || offset === 0xffffffff || count > maxEntries) throw invalid();
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) throw invalid();
    const method = buffer.readUInt16LE(offset + 10);
    const compressed = buffer.readUInt32LE(offset + 20);
    const declared = buffer.readUInt32LE(offset + 24);
    const nameLen = buffer.readUInt16LE(offset + 28);
    const next = offset + 46 + nameLen + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
    const local = buffer.readUInt32LE(offset + 42);
    if (compressed === 0xffffffff || declared === 0xffffffff || local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw invalid();
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    if (start + compressed > buffer.length) throw invalid();
    let actual;
    if (method === 0) actual = compressed;
    else if (method === 8) {
      try {
        actual = zlib.inflateRawSync(buffer.subarray(start, start + compressed), { maxOutputLength: maxUncompressedBytes - total + 1 }).length;
      } catch { throw invalid(); }
    } else throw invalid();
    total += actual;
    if (total > maxUncompressedBytes) throw invalid();
    if (actual > 1024 * 1024 && actual / Math.max(compressed, 1) > maxCompressionRatio) throw invalid();
    offset = next;
  }
}

// Bound the worksheet range before sheet_to_json walks it (a tiny file can declare a huge <dimension>).
function assertSafeWorksheetRange(sheet, { maxRows = 100000, maxCols = 200, maxCells = 5000000 } = {}) {
  if (!sheet?.['!ref']) return;
  const range = require('xlsx').utils.decode_range(sheet['!ref']);
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  if (rows > maxRows || cols > maxCols || rows * cols > maxCells) throw createError('工作表范围超出行列限制', 400);
}

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
    try {
      await checkWorkbookArchive(buffer);
      await workbook.xlsx.load(buffer);
    }
    catch { throw createError('xlsx 文件损坏、格式无效或解压后超出限制', 400); }
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

module.exports = { assertSafeOfficeArchive, assertSafeWorksheetRange, parseTabularFile, acceptsTabularFile, tabularUpload, MAX_ROWS };
