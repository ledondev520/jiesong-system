/**
 * Input: `backend/data/hscode-live/records/*.json`
 * Output: Live HSCode records imported into `hs_codes`
 * Pos: 后端真实 HSCode 数据导入脚本
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const DEFAULT_INPUT_DIR = path.resolve(__dirname, '../data/hscode-live/records');

const parsePercent = (value) => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized === '无') {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const stringifyJson = (value) => JSON.stringify(value ?? null);

const flattenDeclarationElements = (elements) => {
  if (!Array.isArray(elements)) {
    return '';
  }

  return elements
    .map((item) => (item && typeof item.value === 'string' ? item.value.trim() : ''))
    .filter(Boolean)
    .join(' | ');
};

const flattenLabeledValues = (entries) => {
  if (!Array.isArray(entries)) {
    return '';
  }

  return entries
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return '';
      }

      const code = typeof item.code === 'string' && item.code.trim() ? item.code.trim() : '';
      const value = typeof item.value === 'string' ? item.value.trim() : '';
      if (!value) {
        return '';
      }
      return code ? `${code}:${value}` : value;
    })
    .filter(Boolean)
    .join(' | ');
};

const resolveEffectiveDate = (record) => {
  const fetchedAt = record?.fetched_at ? new Date(record.fetched_at) : null;
  if (fetchedAt && !Number.isNaN(fetchedAt.getTime())) {
    return fetchedAt;
  }
  return new Date();
};

const normalizeLiveRecord = (record) => {
  const basicInfo = record?.basic_info || {};
  const taxInfo = record?.tax_info || {};

  const hsCode = String(record?.hs_code || basicInfo['商品编码'] || '').trim();

  // Try to get product name from basic_info first, then fall back to chapter_hierarchy
  let productName = String(basicInfo['商品名称'] || '').trim();
  if (!productName && Array.isArray(record?.chapter_hierarchy)) {
    // Use the most specific level from chapter hierarchy (last entry with meaningful value)
    const hierarchy = record.chapter_hierarchy;
    for (let i = hierarchy.length - 1; i >= 0; i--) {
      const entry = hierarchy[i];
      const value = typeof entry?.value === 'string' ? entry.value.trim() : '';
      // Skip generic category names, look for specific product names
      if (value && !value.includes('类') && !value.match(/^第?\d+/)) {
        productName = value;
        break;
      }
    }
  }

  const declarationElements = flattenDeclarationElements(record?.declaration_elements);
  const supervisionConditions = flattenLabeledValues(record?.supervision_conditions);
  const inspectionQuarantine = flattenLabeledValues(record?.inspection_quarantine);
  const fetchedAt = record?.fetched_at ? new Date(record.fetched_at) : null;
  const effectiveDate = resolveEffectiveDate(record);
  const refundRate = parsePercent(taxInfo['出口退税税率']);
  const exportTaxRate = parsePercent(taxInfo['出口税率']);
  const vatRate = parsePercent(taxInfo['增值税率']);

  return {
    hsCode,
    productName,
    taxRate: refundRate ?? 0,
    refundRate,
    exportTaxRate,
    vatRate,
    unit: typeof taxInfo['计量单位'] === 'string' ? taxInfo['计量单位'].trim() : null,
    note: typeof basicInfo['编码状态'] === 'string' ? basicInfo['编码状态'].trim() : null,
    title: typeof record?.title === 'string' ? record.title.trim() : null,
    sourceUrl: typeof record?.source_url === 'string' ? record.source_url.trim() : null,
    declarationElements,
    supervisionConditions,
    inspectionQuarantine,
    chapterHierarchyJson: stringifyJson(record?.chapter_hierarchy || []),
    ciqCodesJson: stringifyJson(record?.ciq_codes || []),
    agreementRatesJson: stringifyJson(record?.agreement_rates || {}),
    rcepRatesJson: stringifyJson(record?.rcep_rates || {}),
    basicInfoJson: stringifyJson(basicInfo),
    taxInfoJson: stringifyJson(taxInfo),
    rawPayloadJson: stringifyJson(record),
    fetchedAt: fetchedAt && !Number.isNaN(fetchedAt.getTime()) ? fetchedAt : null,
    effectiveDate,
  };
};

const listJsonFiles = async (inputDir) => {
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(inputDir, entry.name))
    .sort();
};

const importLiveHsCodes = async (client = prisma, options = {}) => {
  const inputDir = options.inputDir || DEFAULT_INPUT_DIR;
  const files = await listJsonFiles(inputDir);
  const replaceAll = options.replaceAll !== false;
  let upserted = 0;

  if (replaceAll) {
    await client.hsCode.deleteMany({});
  }

  for (const filePath of files) {
    const rawText = await fs.readFile(filePath, 'utf8');
    const record = JSON.parse(rawText);
    const normalized = normalizeLiveRecord(record);

    if (!normalized.hsCode || !normalized.productName) {
      continue;
    }

    await client.hsCode.upsert({
      where: { hsCode: normalized.hsCode },
      create: normalized,
      update: normalized,
    });
    upserted += 1;
  }

  return {
    processed: files.length,
    upserted,
    replacedAll: replaceAll,
    inputDir,
  };
};

async function main() {
  const result = await importLiveHsCodes(prisma);
  console.log(`HSCode live import complete: processed=${result.processed}, upserted=${result.upserted}`);
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error('HSCode live import failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  DEFAULT_INPUT_DIR,
  parsePercent,
  flattenDeclarationElements,
  normalizeLiveRecord,
  importLiveHsCodes,
  main,
};
