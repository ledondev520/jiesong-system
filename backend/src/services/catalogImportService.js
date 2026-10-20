/**
 * Input: ADMIN CSV/xlsx catalog or opening-balance uploads
 * Output: read-only validation previews or atomic insert-only imports
 * Pos: migration boundary; opening stock never fabricates purchase/inspection evidence
 */
const ExcelJS = require('exceljs');
const Papa = require('papaparse');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { parseTabularFile } = require('../utils/tabularImport');

const TYPES = {
  products: { label: '商品', model: 'product', fields: {
    报关名: 'customsName', 规格: 'specification', 单位: 'unit', HS编码: 'hsCode', 描述: 'description',
  }, required: ['报关名', '单位'] },
  suppliers: { label: '供应商', model: 'supplier', fields: {
    名称: 'name', 简称: 'shortName', 联系人: 'contactName', 电话: 'contactPhone', 邮箱: 'contactEmail', 地址: 'address',
  }, required: ['名称'] },
  stores: { label: '门店', model: 'store', fields: {
    名称: 'name', 港口代码: 'portCode', 联系人: 'contactName', 电话: 'contactPhone', 邮箱: 'contactEmail', 地址: 'address',
  }, required: ['名称', '港口代码'] },
  'opening-inventory': { label: '库存期初', model: 'inventory', fields: {
    期初编号: 'reference', 商品ID: 'productId', 数量: 'quantity', 单位: 'unit', 期初日期: 'asOf', 备注: 'note',
  }, required: ['期初编号', '商品ID', '数量', '单位', '期初日期'] },
};

function definition(kind) {
  if (!Object.hasOwn(TYPES, kind)) throw createError('不支持的导入类型', 400);
  return TYPES[kind];
}

function listTemplates() {
  return Object.entries(TYPES).map(([kind, spec]) => ({
    kind, label: spec.label, headers: Object.keys(spec.fields), required: spec.required,
  }));
}

async function template(kind, format = 'xlsx') {
  const spec = definition(kind);
  if (!['csv', 'xlsx'].includes(format)) throw createError('模板格式只支持 csv 或 xlsx', 400);
  const headers = Object.keys(spec.fields);
  if (format === 'csv') return Buffer.from('\uFEFF' + Papa.unparse([headers]) + '\r\n');
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(spec.label);
  sheet.addRow(headers);
  sheet.columns.forEach(column => { column.width = 24; column.numFmt = '@'; });
  return Buffer.from(await book.xlsx.writeBuffer());
}

function rowValues(spec, row) {
  return Object.fromEntries(Object.entries(spec.fields).map(([header, field]) => [field, row[header] || '']));
}

async function validate(kind, parsed, db) {
  const spec = definition(kind);
  const headers = Object.keys(spec.fields);
  if (headers.some(header => !parsed.headers.includes(header)) || parsed.headers.some(header => !headers.includes(header))) {
    throw createError('表头与模板不一致，请下载当前模板', 400);
  }
  const seen = new Set();
  const rows = [];
  for (const [index, row] of parsed.data.entries()) {
    const errors = [];
    const data = rowValues(spec, row);
    for (const header of spec.required) if (!row[header]) errors.push(`${header}必填`);
    for (const value of Object.values(data)) if (value.length > 1000) errors.push('单元格不能超过1000字符');
    if (data.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.contactEmail)) errors.push('邮箱格式无效');
    let key;
    if (kind === 'products') {
      key = JSON.stringify([data.customsName, data.specification, data.unit]);
      if (data.hsCode && !/^\d{10}$/.test(data.hsCode)) errors.push('HS编码必须为10位数字');
      if (await db.product.count({ where: { customsName: data.customsName, unit: data.unit,
        OR: data.specification ? [{ specification: data.specification }] : [{ specification: null }, { specification: '' }],
      } })) errors.push('商品名称、规格和单位已存在');
    } else if (kind === 'suppliers' || kind === 'stores') {
      key = data.name;
      if (await db[spec.model].count({ where: { name: data.name } })) errors.push('名称已存在，请在档案中维护现有记录');
      if (kind === 'stores') {
        const port = await db.port.findUnique({ where: { code: data.portCode } });
        if (!port) errors.push('港口代码不存在');
        else data.portId = port.id;
        delete data.portCode;
      }
    } else {
      key = data.reference;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(data.reference)) errors.push('期初编号只允许1至64位字母、数字、下划线或连字符');
      data.id = `opening:${data.reference}`;
      if (await db.inventory.findUnique({ where: { id: data.id } })) errors.push('期初编号已导入，禁止重复增加库存');
      const product = await db.product.findUnique({ where: { id: data.productId } });
      if (!product || !product.isActive) errors.push('商品ID不存在或已停用');
      else if (data.unit !== product.unit) errors.push('单位必须与商品档案一致');
      if (!/^\d+(\.\d+)?$/.test(data.quantity) || !Number.isFinite(Number(data.quantity)) || Number(data.quantity) <= 0) errors.push('数量必须为有限正数');
      data.quantity = Number(data.quantity);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(data.asOf) ? new Date(`${data.asOf}T00:00:00.000Z`) : new Date(NaN);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== data.asOf || date > new Date()) errors.push('期初日期必须为有效且不晚于今天的 YYYY-MM-DD');
      data.inboundAt = date;
      data.status = 'INBOUND';
      data.note = `[OPENING:${data.reference}] ${data.note}`.trim();
      delete data.reference; delete data.asOf;
    }
    if (seen.has(key)) errors.push('文件内重复记录');
    seen.add(key);
    rows.push({ row: index + 2, values: row, data, errors });
  }
  const invalid = rows.filter(row => row.errors.length).length;
  return { kind, canImport: invalid === 0 && rows.length > 0,
    summary: { total: rows.length, valid: rows.length - invalid, invalid }, rows };
}

async function preview(kind, file) {
  definition(kind);
  return validate(kind, await parseTabularFile(file), prisma);
}

async function execute(kind, file, { confirmOpening = false, userId } = {}) {
  const spec = definition(kind);
  if (kind === 'opening-inventory' && !confirmOpening) throw createError('请确认期初数量已经盘点核对', 400);
  const parsed = await parseTabularFile(file);
  return prisma.$transaction(async db => {
    const result = await validate(kind, parsed, db);
    if (!result.canImport) {
      const error = createError('导入校验失败，请重新预览并修正错误', 400);
      throw error;
    }
    for (const row of result.rows) await db[spec.model].create({ data: row.data });
    await db.operationLog.create({ data: {
      userId, action: 'IMPORT', entity: 'CatalogImport', entityId: kind,
      newValue: JSON.stringify({ kind, count: result.rows.length }),
    } });
    return { kind, imported: result.rows.length };
  }, { maxWait: 10000, timeout: 30000 });
}

module.exports = { listTemplates, template, preview, execute };
