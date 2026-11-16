#!/usr/bin/env node
/** Install the approved reusable template/catalog and dated official refund library into private storage. */
const fs = require('node:fs/promises');
const path = require('node:path');
process.chdir(path.resolve(__dirname, '..'));
const { resolveWpsUploadRoot } = require('./wps-upload-dir');
process.env.UPLOAD_DIR = resolveWpsUploadRoot({ backendDir: process.cwd() });
const { loadWorkbook, readCell, templateSheets, installProfile, loadProfile, todayInShanghai } = require('../src/services/exportPacketExcelService');
const { EXPORT_PACKAGE_KIND } = require('../src/services/customsPreentrySheet');

const readDbf = (buffer) => {
  if (buffer.length < 33) throw new Error('退税率DBF不完整');
  const count = buffer.readUInt32LE(4), headerLength = buffer.readUInt16LE(8), recordLength = buffer.readUInt16LE(10);
  if (!recordLength || headerLength < 33 || headerLength + count * recordLength > buffer.length) throw new Error('退税率DBF长度无效');
  const fields = [];
  for (let offset = 32; offset + 32 <= headerLength && buffer[offset] !== 0x0d; offset += 32) fields.push({ name: buffer.subarray(offset, offset + 11).toString('ascii').replace(/\0.*$/, ''), length: buffer[offset + 16] });
  if (!['CODE', 'TSL', 'ST_DATE', 'END_DATE'].every((key) => fields.some((field) => field.name === key))) throw new Error('退税率DBF缺少必要字段');
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const base = headerLength + index * recordLength;
    if (buffer[base] === 0x2a) continue;
    const values = {}; let offset = base + 1;
    for (const field of fields) { values[field.name] = buffer.subarray(offset, offset + field.length).toString('ascii').trim(); offset += field.length; }
    if (/^\d{8,10}$/.test(values.CODE) && /^\d{8}$/.test(values.ST_DATE) && /^\d{8}$/.test(values.END_DATE) && Number.isFinite(Number(values.TSL)) && values.TSL !== '') records.push({ code: values.CODE, rate: Number(values.TSL), startDate: values.ST_DATE, endDate: values.END_DATE });
  }
  if (!records.length) throw new Error('退税率DBF没有可用记录');
  return records;
};

const configure = async ({ template, catalog, refundDbf, refundVersion, reviewedOn = todayInShanghai() }) => {
  if (!template || !catalog || !refundDbf || !/^20\d{2}[A-Z]$/.test(refundVersion || '') || !/^\d{4}-\d{2}-\d{2}$/.test(reviewedOn)) throw new Error('必须提供 --template、--catalog、--refund-dbf、--refund-version，日期使用 YYYY-MM-DD');
  const workbook = await loadWorkbook(await fs.readFile(template));
  const sheets = templateSheets(workbook);
  const goods = []; const quotes = [];
  const catalogBook = await loadWorkbook(await fs.readFile(catalog));
  const catalogSheet = catalogBook.getWorksheet('货品目录');
  if (!catalogSheet) throw new Error('申报要素目录缺少“货品目录”工作表');
  catalogSheet.eachRow((row, index) => {
    if (index === 1) return;
    const name = String(readCell(row.getCell(2)) || '').trim();
    const hsCode = String(readCell(row.getCell(3)) || '').trim();
    if (name && /^\d{10}$/.test(hsCode)) goods.push({ name, hsCode, declaration: String(readCell(row.getCell(13)) || ''), origin: String(readCell(row.getCell(12)) || '') });
  });
  const [contract, , packing] = sheets;
  const no = String(readCell(contract.getCell('F3')) || '').match(/EXP\d{6,12}/)?.[0];
  for (let row = 9; row <= 24; row += 1) {
    const name = String(readCell(packing.getCell(row, 2)) || '').trim();
    if (!name) continue;
    const specification = String(readCell(packing.getCell(row, 4)) || '').trim();
    const hsCode = String(readCell(packing.getCell(row, 3)) || '').trim();
    const declaration = String(readCell(packing.getCell(row, 11)) || '').trim();
    const origin = String(readCell(packing.getCell(row, 12)) || '').trim();
    if (/^\d{10}$/.test(hsCode) && declaration && origin) goods.push({ name, specification, hsCode, declaration, origin });
    const unitPriceUsd = Number(readCell(contract.getCell(row, 5)));
    if (no && unitPriceUsd > 0) quotes.push({ productName: name, specification, unitPriceUsd, contractNo: no, date: reviewedOn });
  }
  const sellerName = String(readCell(contract.getCell('B5')) || '').split('\n')[0].trim();
  const buyerName = String(readCell(contract.getCell('B6')) || '').trim();
  const tradeTerm = String(readCell(contract.getCell('A28')) || '').match(/Trade term:\s*([A-Z]{3})/i)?.[1]?.toUpperCase();
  const packageKind = EXPORT_PACKAGE_KIND;
  if (!sellerName || !buyerName || !tradeTerm) throw new Error('原模板缺少买卖方或贸易术语');
  for (const sheet of [...workbook.worksheets]) if (!sheets.includes(sheet)) workbook.removeWorksheet(sheet.id);
  sheets.forEach((sheet, index) => {
    sheet.eachRow((row) => row.eachCell((cell) => {
      if (cell.col > (index === 2 ? 12 : 6) || cell.row > (index === 2 ? 27 : 44)) { cell.value = null; return; }
      if (cell.value && typeof cell.value === 'object' && ('formula' in cell.value || 'sharedFormula' in cell.value)) cell.value = readCell(cell);
    }));
    sheet.name = ['合同', '发票', '箱单'][index];
    for (let row = 9; row <= 24; row += 1) for (let col = 1; col <= (index === 2 ? 12 : 6); col += 1) sheet.getCell(row, col).value = null;
    for (let col = index === 2 ? 5 : 4; col <= (index === 2 ? 8 : 6); col += 1) sheet.getCell(25, col).value = null;
    sheet.getCell(index === 2 ? 'H3' : 'F3').value = null;
    sheet.getCell(index === 2 ? 'H4' : 'F4').value = null;
  });
  const profile = { version: 1, defaults: { sellerName, buyerName, tradeTerm, packageKind }, goods, quotes,
    refundLibrary: { version: refundVersion, checkedAt: reviewedOn, records: readDbf(await fs.readFile(refundDbf)) },
    templateBase64: Buffer.from(await workbook.xlsx.writeBuffer()).toString('base64') };
  await installProfile(profile);
  const saved = await loadProfile();
  if (saved.goods.length !== goods.length || saved.refundLibrary.version !== refundVersion) throw new Error('四单配置保存后核对失败');
  return { goodsCount: goods.length, taxVersion: refundVersion, templateSheets: 3 };
};

if (require.main === module) {
  const args = {};
  for (let index = 2; index < process.argv.length; index += 2) args[process.argv[index].replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = process.argv[index + 1];
  configure(args).then((result) => console.log(JSON.stringify(result))).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { configure, readDbf };
