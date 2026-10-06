/**
 * Input: Prisma 客户端、Excel 文件路径或查询参数
 * Output: Excel Buffer 或逐行导入统计；拒绝非空非法金额/日期，留空编号沿用统一序列
 * Pos: 采购合同批量导入导出服务
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const xlsx = require('xlsx');
const fs = require('fs');
const prisma = require('../utils/prisma');
const { createError } = require('../middleware/errorHandler');
const { generateNextPurchaseContractNo, isPurchaseNumberConflict } = require('./purchaseContractNumberService');

const STATUS_LABEL_MAP = {
  DRAFT: '草稿',
  SIGNED: '已签订',
  PRODUCING: '生产中',
  SHIPPED: '已发货',
  RECEIVED: '已收货',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};

const STATUS_VALUE_MAP = {
  '草稿': 'DRAFT',
  '已签订': 'SIGNED',
  '已确认': 'SIGNED',
  '生产中': 'PRODUCING',
  '已发货': 'SHIPPED',
  '已收货': 'RECEIVED',
  '已完成': 'COMPLETED',
  '已取消': 'CANCELLED',
};

const VALID_STATUSES = Object.keys(STATUS_VALUE_MAP);

/**
 * 职责：原子写入单行合同；仅自动编号被并发占用时重新分配
 * 思路：数据库唯一约束兜底，最多尝试五次；显式编号和其他错误不改号重试
 */
const createImportedContract = async (data) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.purchaseContract.create({
        data: { ...data, contractNo: data.contractNo || await generateNextPurchaseContractNo(prisma) },
      });
    } catch (error) {
      if (data.contractNo || !isPurchaseNumberConflict(error)) throw error;
      if (attempt === 4) throw createError('采购编号正在分配，请稍后重试', 409);
    }
  }
};

/**
 * 职责：将 Buffer 或 ArrayBuffer 转为 Node Buffer
 */
const toBuffer = (ab) => {
  if (Buffer.isBuffer(ab)) return ab;
  const buf = Buffer.alloc(ab.byteLength);
  const view = new Uint8Array(ab);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = view[i];
  }
  return buf;
};

/**
 * 职责：格式化日期为 yyyy-MM-dd
 */
const formatDate = (date) => {
  if (!date) return '';
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

/**
 * 职责：解析 Excel 中的日期值
 * 思路：xlsx 读取时日期可能是数字（序列号）或字符串
 */
const parseExcelDate = (value) => {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const calendarDate = (year, month, day) => {
    const date = new Date(year, month - 1, day);
    // JS normalizes impossible days/months; an import must not silently change
    // the supplied calendar date (including Excel's fictitious 1900-02-29).
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
  };
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel 日期序列号转 JS Date
    const d = xlsx.SSF.parse_date_code(value);
    if (d) return calendarDate(d.y, d.m, d.d);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    // yyyy-MM-dd / yyyy/MM/dd
    const m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
      return calendarDate(Number(m[1]), Number(m[2]), Number(m[3]));
    }
  }
  return null;
};

// Optional empty cells keep the existing null-date / zero-amount defaults.
const hasProvidedValue = value => value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '');

/**
 * 职责：解析金额
 */
const parseAmount = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * 职责：导出采购合同为 Excel
 * 思路：
 *   1. 按查询参数筛选合同
 *   2. 查询供应商信息
 *   3. 组装数据并使用 xlsx 生成 Buffer
 * @param {Object} query - 查询参数 { status, supplierId, dateFrom, dateTo }
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
const exportPurchasesExcel = async (query = {}) => {
  const { status, supplierId, dateFrom, dateTo } = query;

  const where = {};
  if (status) where.status = status;
  if (supplierId) where.supplierId = supplierId;
  if (dateFrom || dateTo) {
    where.signedAt = {};
    if (dateFrom) where.signedAt.gte = new Date(dateFrom);
    if (dateTo) where.signedAt.lte = new Date(dateTo);
  }

  const contracts = await prisma.purchaseContract.findMany({
    where,
    include: { supplier: true },
    orderBy: { contractNo: 'desc' },
  });

  const rows = contracts.map((c) => ({
    '合同编号': c.contractNo,
    '供应商名称': c.supplier?.name || '',
    '签订日期': formatDate(c.signedAt),
    '总金额': c.totalAmount,
    '币种': 'CNY',
    '状态': STATUS_LABEL_MAP[c.status] || c.status,
    '备注': c.note || '',
  }));

  const worksheet = xlsx.utils.json_to_sheet(rows);
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, '采购合同');

  // 设置列宽
  worksheet['!cols'] = [
    { wch: 16 }, // 合同编号
    { wch: 24 }, // 供应商名称
    { wch: 12 }, // 签订日期
    { wch: 14 }, // 总金额
    { wch: 8 },  // 币种
    { wch: 10 }, // 状态
    { wch: 30 }, // 备注
  ];

  const buffer = toBuffer(xlsx.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
  const filename = `采购合同导出_${formatDate()}.xlsx`;
  return { buffer, filename };
};

/**
 * 职责：从 Excel 批量导入采购合同
 * 思路：
 *   1. 读取 Excel 文件
 *   2. 逐行校验（供应商名称必填、日期格式、金额格式、状态有效性）
 *   3. 查找供应商 ID（不存在则报错）
 *   4. 合同编号留空则自动生成
 *   5. 写入数据库
 *   6. 返回成功/失败统计及错误明细
 * @param {string} filePath - 上传的 Excel 文件路径
 * @param {string} userId - 认证操作者
 * @param {{ historical?: boolean }} options - ADMIN显式历史补录；不创建库存或验货证据
 * @returns {Promise<{successRows: number, failedRows: number, errors: Array}>}
 */
const importPurchasesExcel = async (filePath, userId, options = {}) => {
  let allowHistorical = false;
  if (options.historical === true) {
    const user = typeof userId === 'string' && userId ? await prisma.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } }) : null;
    if (user?.role !== 'ADMIN' || !user.isActive) throw createError('历史采购补录仅允许有效管理员执行', 403);
    allowHistorical = true;
  }
  if (!fs.existsSync(filePath)) {
    throw createError('上传文件不存在', 400);
  }

  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

  if (rawData.length < 2) {
    throw createError('Excel 文件为空或缺少数据行', 400);
  }

  // 解析表头（支持中英文及常见别名）
  const headers = rawData[0].map((h) => (typeof h === 'string' ? h.trim() : ''));
  const colIndex = {};
  const findCol = (names) => {
    for (let i = 0; i < headers.length; i++) {
      const h = headers[i];
      for (const name of names) {
        if (h === name) return i;
      }
    }
    return -1;
  };

  colIndex.contractNo = findCol(['合同编号', '合同号', '编号']);
  colIndex.supplierName = findCol(['供应商名称', '供应商', 'supplierName', '厂家']);
  colIndex.signedAt = findCol(['签订日期', '签订时间', '日期', 'signedAt']);
  colIndex.totalAmount = findCol(['总金额', '金额', 'totalAmount', '总价']);
  colIndex.currency = findCol(['币种', '货币', 'currency']);
  colIndex.status = findCol(['状态', 'status']);
  colIndex.note = findCol(['备注', '说明', 'note']);

  if (colIndex.supplierName === -1) {
    throw createError('Excel 缺少「供应商名称」列，请检查表头', 400);
  }

  const errors = [];
  let successRows = 0;
  let failedRows = 0;

  // 预加载所有供应商，避免 N+1
  const allSuppliers = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const supplierMap = new Map(allSuppliers.map((s) => [s.name, s.id]));

  const dataRows = rawData.slice(1);

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2; // Excel 行号（含表头）

    try {
      const supplierName = String(row[colIndex.supplierName] || '').trim();
      if (!supplierName) {
        throw new Error(`第 ${rowNum} 行：供应商名称为空`);
      }

      const supplierId = supplierMap.get(supplierName);
      if (!supplierId) {
        throw new Error(`第 ${rowNum} 行：供应商「${supplierName}」不存在，请先创建供应商`);
      }

      const contractNo = colIndex.contractNo !== -1 ? String(row[colIndex.contractNo] || '').trim() : '';
      if (contractNo) {
        // 检查合同编号是否已存在
        const existing = await prisma.purchaseContract.findUnique({
          where: { contractNo },
          select: { id: true },
        });
        if (existing) {
          throw new Error(`第 ${rowNum} 行：合同编号「${contractNo}」已存在`);
        }
      }

      const signedAtInput = colIndex.signedAt !== -1 ? row[colIndex.signedAt] : undefined;
      const signedAt = parseExcelDate(signedAtInput);
      if (hasProvidedValue(signedAtInput) && signedAt === null) {
        throw new Error(`第 ${rowNum} 行：签订日期格式不正确`);
      }

      const totalAmountInput = colIndex.totalAmount !== -1 ? row[colIndex.totalAmount] : undefined;
      const totalAmount = parseAmount(totalAmountInput);
      if ((hasProvidedValue(totalAmountInput) && totalAmount === null) || (totalAmount !== null && totalAmount < 0)) {
        throw new Error(`第 ${rowNum} 行：总金额格式不正确`);
      }

      let status = 'DRAFT';
      if (colIndex.status !== -1) {
        const statusInput = String(row[colIndex.status] || '').trim();
        if (statusInput) {
          if (!VALID_STATUSES.includes(statusInput)) {
            throw new Error(
              `第 ${rowNum} 行：状态「${statusInput}」无效，可选值：${VALID_STATUSES.join('、')}`
            );
          }
          status = STATUS_VALUE_MAP[statusInput];
        }
      }

      if (['RECEIVED', 'COMPLETED'].includes(status) && !allowHistorical) {
        throw new Error('已收货/已完成仅管理员明确确认历史补录后可导入；普通采购请登记分批到货与验货');
      }

      const note = colIndex.note !== -1 ? String(row[colIndex.note] || '').trim() : '';

      await createImportedContract({
        contractNo,
        supplierId,
        signedAt,
        totalAmount: totalAmount ?? 0,
        status,
        note: note || null,
      });

      successRows++;
    } catch (error) {
      failedRows++;
      errors.push({
        row: rowNum,
        error: error.message,
      });
    }
  }

  return { successRows, failedRows, errors };
};

module.exports = {
  exportPurchasesExcel,
  importPurchasesExcel,
};
