/**
 * Input: docs/20260101.xlsx（2026年出口商品编码目录）、Prisma HsCode 表
 * Output: 更新/新增 HS 编码记录到数据库（以 Excel 数据为准）
 * Pos: 一次性脚本，用于导入 2026 年最新出口目录
 *
 * 使用方式：cd backend && node scripts/import-hs-codes-2026.js [--dry-run]
 *
 * 策略：
 *   1. 解析 Excel 文件（跳过表头）
 *   2. 对每行数据做清洗（单位提取、申报要素保留原始格式）
 *   3. 数据库中已有该编码 → UPDATE（以 Excel 数据为准，保留现有税率）
 *   4. 数据库中没有该编码 → INSERT（税率默认 0，后续可用 HSCIQ 补充）
 *   5. 清除过期备注（若 Excel 中备注为空，则清空数据库中的 note 字段）
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const path = require('path');
const ExcelJS = require('exceljs');

const EXCEL_PATH = path.join(__dirname, '../../docs/20260101.xlsx');
const DRY_RUN = process.argv.includes('--dry-run');
const EFFECTIVE_DATE = new Date('2026-01-01T00:00:00.000Z');

/**
 * 职责：从 "035 千克" 格式中提取单位名称
 * @param {string|null} raw
 * @returns {string}
 */
function extractUnitName(raw) {
  if (!raw) return '';
  const s = String(raw).trim();
  const match = s.match(/^\d+\s+(.+)$/);
  return match ? match[1].trim() : s;
}

/**
 * 职责：清洗申报要素字符串
 * 思路：保留原始管道分隔格式，去除多余空白
 * @param {string|null} raw
 * @returns {string}
 */
function cleanDeclarationElements(raw) {
  if (!raw) return '';
  return String(raw).trim();
}

/**
 * 职责：解析 Excel 文件，返回结构化记录数组
 * @returns {Promise<Array<{hsCode, productName, declarationElements, unit, supervisionConditions, inspectionQuarantine, note}>>}
 */
async function parseExcel() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);
  const ws = workbook.worksheets[0];

  if (!ws) throw new Error('Excel 无工作表');

  const records = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const hsCode = String(row.getCell(1).value || '').trim();
    if (!hsCode || !/^\d{8,12}$/.test(hsCode)) return;

    const productName = String(row.getCell(2).value || '').trim();
    const declarationElements = cleanDeclarationElements(row.getCell(3).value);
    const unit1 = extractUnitName(row.getCell(4).value);
    const unit2 = extractUnitName(row.getCell(5).value);
    const supervisionConditions = String(row.getCell(6).value || '').trim();
    const inspectionQuarantine = String(row.getCell(7).value || '').trim();
    const note = String(row.getCell(8).value || '').trim();

    const unit = [unit1, unit2].filter(Boolean).join('/') || null;

    records.push({
      hsCode,
      productName,
      declarationElements: declarationElements || null,
      unit,
      supervisionConditions: supervisionConditions || null,
      inspectionQuarantine: inspectionQuarantine || null,
      note: note || null,
    });
  });

  return records;
}

async function main() {
  console.log(`[import] 开始导入 2026 年出口目录${DRY_RUN ? '（DRY RUN 模式）' : ''}`);
  console.log(`[import] Excel 文件: ${EXCEL_PATH}`);

  // 0. 解析 Excel
  const records = await parseExcel();
  console.log(`[import] 解析到 ${records.length} 条有效记录`);

  if (DRY_RUN) {
    console.log('[import] DRY RUN: 前 5 条:');
    records.slice(0, 5).forEach((r) => {
      console.log(`  ${r.hsCode} | ${r.productName} | unit: ${r.unit} | 监管: ${r.supervisionConditions}`);
    });
    console.log('[import] DRY RUN 结束，未写入数据库');
    return;
  }

  // 1. 加载 Prisma（延迟加载避免 dotenv 问题）
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();

  try {
    // 2. 预加载现有编码 Set，用于判断 insert vs update
    const existing = await prisma.hsCode.findMany({
      select: { hsCode: true, id: true },
    });
    const existingMap = new Map(existing.map((e) => [e.hsCode, e.id]));
    console.log(`[import] 数据库现有 ${existingMap.size} 条记录`);

    let updated = 0;
    let created = 0;
    let errors = 0;
    const excelCodes = new Set();

    // 3. 批量 upsert
    const BATCH_SIZE = 100;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const ops = batch.map((r) => {
        excelCodes.add(r.hsCode);
        const isUpdate = existingMap.has(r.hsCode);
        return prisma.hsCode.upsert({
          where: { hsCode: r.hsCode },
          update: {
            productName: r.productName,
            declarationElements: r.declarationElements,
            unit: r.unit,
            supervisionConditions: r.supervisionConditions,
            inspectionQuarantine: r.inspectionQuarantine,
            note: r.note,
            effectiveDate: EFFECTIVE_DATE,
          },
          create: {
            hsCode: r.hsCode,
            productName: r.productName,
            taxRate: 0,
            declarationElements: r.declarationElements,
            unit: r.unit,
            supervisionConditions: r.supervisionConditions,
            inspectionQuarantine: r.inspectionQuarantine,
            note: r.note,
            effectiveDate: EFFECTIVE_DATE,
          },
        }).then(() => {
          if (isUpdate) updated++;
          else created++;
        });
      });

      try {
        await Promise.all(ops);
      } catch (err) {
        console.error(`[import] 批次 ${i}~${i + batch.length} 失败:`, err.message);
        errors += batch.length;
      }

      if ((i + BATCH_SIZE) % 1000 === 0 || i + BATCH_SIZE >= records.length) {
        console.log(`[import] 进度: ${Math.min(i + BATCH_SIZE, records.length)}/${records.length} (更新: ${updated}, 新增: ${created}, 错误: ${errors})`);
      }
    }

    // 4. 统计不在 Excel 中的旧编码
    const obsoleteCodes = [];
    for (const [code] of existingMap) {
      if (!excelCodes.has(code)) {
        obsoleteCodes.push(code);
      }
    }
    console.log(`[import] 数据库中有 ${obsoleteCodes.length} 条编码不在 2026 目录中（未删除，保留兼容）`);

    // 5. 最终统计
    const finalCount = await prisma.hsCode.count();
    console.log(`[import] 导入完成！更新: ${updated}, 新增: ${created}, 错误: ${errors}`);
    console.log(`[import] 数据库最终记录数: ${finalCount}`);

  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[import] 致命错误:', err);
  process.exit(1);
});
