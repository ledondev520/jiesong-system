/**
 * CSV 导入脚本：将 hscode-live.csv 导入到 SQLite 数据库
 */

const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CSV_PATH = path.resolve(__dirname, '../data/hscode-live/hscode-live.csv');

// 解析百分比字符串（如 "13%" -> 13, "无" -> null）
const parsePercent = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '无' || trimmed === '') return null;
  const num = parseFloat(trimmed.replace('%', '').replace(' ', ''));
  return isNaN(num) ? null : num;
};

// 解析日期字符串
const parseDate = (value) => {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // 尝试解析 "2018/12/30" 格式
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/');
    if (parts.length === 3) {
      const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // ISO 格式
  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
};

// 去除 BOM 头
const removeBOM = (str) => {
  if (str.charCodeAt(0) === 0xFEFF) {
    return str.slice(1);
  }
  return str;
};

// 解析 CSV 行（处理引号内的逗号）
const parseCSVLine = (line) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // 转义的引号
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

// 主导入函数
async function importCSV() {
  console.log('🚀 开始导入 HSCode 数据...');
  console.log(`📁 CSV 文件: ${CSV_PATH}`);

  // 读取并解析 CSV
  const content = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = removeBOM(content).split('\n').filter(line => line.trim());

  if (lines.length < 2) {
    throw new Error('CSV 文件为空或格式错误');
  }

  // 解析表头
  const headers = parseCSVLine(lines[0]);
  console.log(`📊 字段数: ${headers.length}`);
  console.log(`📈 数据行数: ${lines.length - 1}`);

  // 清空现有数据
  console.log('🗑️  清空现有数据...');
  await prisma.hsCode.deleteMany({});

  // 批量导入
  const batchSize = 500;
  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i += batchSize) {
    const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
    const records = [];

    for (const line of batch) {
      try {
        const values = parseCSVLine(line);
        if (values.length < 5) continue;

        // 创建字段映射
        const getValue = (name) => {
          const idx = headers.indexOf(name);
          return idx >= 0 ? values[idx] || null : null;
        };

        const record = {
          hsCode: getValue('hs_code') || getValue('product_code'),
          productName: getValue('product_name') || '',
          title: getValue('title'),
          sourceUrl: getValue('source_url'),
          taxRate: parsePercent(getValue('export_refund_rate')) ?? 0,
          refundRate: parsePercent(getValue('export_refund_rate')),
          exportTaxRate: parsePercent(getValue('export_rate')),
          vatRate: parsePercent(getValue('vat_rate')),
          unit: getValue('unit'),
          note: getValue('status'),
          declarationElements: getValue('declaration_elements'),
          supervisionConditions: getValue('supervision_conditions'),
          inspectionQuarantine: getValue('inspection_quarantine'),
          chapterHierarchyJson: getValue('chapter_hierarchy'),
          ciqCodesJson: getValue('ciq_codes'),
          agreementRatesJson: getValue('agreement_rates_json'),
          rcepRatesJson: getValue('rcep_rates_json'),
          fetchedAt: new Date(getValue('fetched_at') || Date.now()),
          effectiveDate: parseDate(getValue('updated_date')) || new Date(),
        };

        if (record.hsCode && record.productName) {
          records.push(record);
        }
      } catch (err) {
        errorCount++;
        if (errors.length < 5) {
          errors.push(`行 ${i}: ${err.message}`);
        }
      }
    }

    // 批量插入
    if (records.length > 0) {
      try {
        // 使用 createMany 批量插入
        await prisma.hsCode.createMany({
          data: records,
          skipDuplicates: true,
        });
        successCount += records.length;
        process.stdout.write(`\r✅ 已导入: ${successCount}/${lines.length - 1}`);
      } catch (err) {
        console.error(`\n❌ 批次插入失败: ${err.message}`);
        // 降级为单条插入
        for (const record of records) {
          try {
            await prisma.hsCode.create({ data: record });
            successCount++;
          } catch (e) {
            errorCount++;
          }
        }
      }
    }
  }

  console.log('\n');
  console.log('✅ 导入完成！');
  console.log(`   成功: ${successCount}`);
  console.log(`   失败: ${errorCount}`);

  if (errors.length > 0) {
    console.log('\n⚠️  部分错误:');
    errors.forEach(e => console.log(`   ${e}`));
  }

  // 统计
  const total = await prisma.hsCode.count();
  console.log(`\n📊 数据库中 HSCode 总数: ${total}`);
}

// 执行
importCSV()
  .catch(err => {
    console.error('❌ 导入失败:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
