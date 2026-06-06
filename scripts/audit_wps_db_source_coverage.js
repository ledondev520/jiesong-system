/**
 * Input: backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/wps_db_source_coverage.{json,md}
 * Pos: WPS 历史导入只读来源覆盖审计；统计已入库出口/采购/报关/退税记录是否带 WPS 文件来源标记，不写库
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));

const prisma = new PrismaClient();
const parsedDir = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const sourceEvidencePattern = /\[WPS_|WPS_|11-报关记录|12-报关单|_wps_cloud_root|出货汇总|报关单|出口退税联/;

function hasSourceEvidence(note) {
  return sourceEvidencePattern.test(String(note || ''));
}

function sample(rows, describe, limit = 12) {
  return rows.slice(0, limit).map(describe);
}

function countBy(rows, keyFn) {
  const counts = new Map();
  for (const row of rows) {
    const key = keyFn(row) || '(empty)';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 20)
    .map(([key, count]) => ({ key, count }));
}

function coverage(name, rows, getNote, describe, grouping) {
  const withSource = rows.filter((row) => hasSourceEvidence(getNote(row)));
  const withoutSource = rows.filter((row) => !hasSourceEvidence(getNote(row)));
  return {
    name,
    total: rows.length,
    with_source: withSource.length,
    without_source: withoutSource.length,
    coverage_ratio: rows.length === 0 ? 1 : Number((withSource.length / rows.length).toFixed(4)),
    missing_samples: sample(withoutSource, describe),
    missing_by_contract: grouping ? countBy(withoutSource, grouping) : [],
  };
}

async function main() {
  const [
    salesContracts,
    salesItems,
    packingItems,
    purchaseContracts,
    purchaseItems,
    customsDeclarations,
    customsItems,
    taxRefunds,
  ] = await Promise.all([
    prisma.salesContract.findMany({
      select: { id: true, contractNo: true, note: true },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.salesItem.findMany({
      select: {
        id: true,
        quantity: true,
        unit: true,
        sellingPrice: true,
        specification: true,
        note: true,
        salesContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.packingItem.findMany({
      select: {
        id: true,
        quantity: true,
        unit: true,
        boxes: true,
        specification: true,
        manufacturer: true,
        note: true,
        salesContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
        store: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.purchaseContract.findMany({
      select: { id: true, contractNo: true, note: true, totalAmount: true, supplier: { select: { name: true } } },
      orderBy: { contractNo: 'asc' },
    }),
    prisma.purchaseItem.findMany({
      select: {
        id: true,
        quantity: true,
        unit: true,
        unitPrice: true,
        totalPrice: true,
        specification: true,
        note: true,
        purchaseContract: { select: { contractNo: true } },
        product: { select: { customsName: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.customsDeclaration.findMany({
      select: { id: true, declarationNo: true, note: true, salesContract: { select: { contractNo: true } } },
      orderBy: { declarationNo: 'asc' },
    }),
    prisma.customsDeclarationItem.findMany({
      select: {
        id: true,
        itemNo: true,
        customsName: true,
        hsCode: true,
        quantity: true,
        unit: true,
        customsDeclaration: {
          select: { declarationNo: true, note: true, salesContract: { select: { contractNo: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.taxRefund.findMany({
      select: {
        id: true,
        refundNo: true,
        note: true,
        salesContract: { select: { contractNo: true } },
        customsDeclaration: { select: { declarationNo: true } },
      },
      orderBy: { refundNo: 'asc' },
    }),
  ]);

  const sections = [
    coverage(
      'sales_contracts',
      salesContracts.filter((row) => row.contractNo.startsWith('EXP')),
      (row) => row.note,
      (row) => ({ contract_no: row.contractNo, note: row.note || '' }),
      (row) => row.contractNo,
    ),
    coverage(
      'sales_items',
      salesItems,
      (row) => row.note,
      (row) => ({
        contract_no: row.salesContract.contractNo,
        product: row.product.customsName,
        store: row.store.name,
        quantity: row.quantity,
        unit: row.unit,
        selling_price: row.sellingPrice,
        specification: row.specification,
        note: row.note || '',
      }),
      (row) => row.salesContract.contractNo,
    ),
    coverage(
      'packing_items',
      packingItems,
      (row) => row.note,
      (row) => ({
        contract_no: row.salesContract.contractNo,
        product: row.product.customsName,
        store: row.store?.name || '',
        quantity: row.quantity,
        unit: row.unit,
        boxes: row.boxes,
        specification: row.specification,
        manufacturer: row.manufacturer,
        note: row.note || '',
      }),
      (row) => row.salesContract.contractNo,
    ),
    coverage(
      'purchase_contracts',
      purchaseContracts.filter((row) => row.contractNo.startsWith('CG')),
      (row) => row.note,
      (row) => ({
        contract_no: row.contractNo,
        supplier: row.supplier.name,
        total_amount: row.totalAmount,
        note: row.note || '',
      }),
      (row) => row.contractNo,
    ),
    coverage(
      'purchase_items',
      purchaseItems,
      (row) => row.note,
      (row) => ({
        contract_no: row.purchaseContract.contractNo,
        product: row.product.customsName,
        quantity: row.quantity,
        unit: row.unit,
        unit_price: row.unitPrice,
        total_price: row.totalPrice,
        specification: row.specification,
        note: row.note || '',
      }),
      (row) => row.purchaseContract.contractNo,
    ),
    coverage(
      'customs_declarations',
      customsDeclarations,
      (row) => row.note,
      (row) => ({
        contract_no: row.salesContract.contractNo,
        declaration_no: row.declarationNo,
        note: row.note || '',
      }),
      (row) => row.salesContract.contractNo,
    ),
    coverage(
      'customs_declaration_items_inherit_declaration_note',
      customsItems,
      (row) => row.customsDeclaration.note,
      (row) => ({
        contract_no: row.customsDeclaration.salesContract.contractNo,
        declaration_no: row.customsDeclaration.declarationNo,
        item_no: row.itemNo,
        customs_name: row.customsName,
        hs_code: row.hsCode,
        quantity: row.quantity,
        unit: row.unit,
        declaration_note: row.customsDeclaration.note || '',
      }),
      (row) => row.customsDeclaration.salesContract.contractNo,
    ),
    coverage(
      'tax_refunds',
      taxRefunds,
      (row) => row.note,
      (row) => ({
        contract_no: row.salesContract.contractNo,
        declaration_no: row.customsDeclaration.declarationNo,
        refund_no: row.refundNo,
        note: row.note || '',
      }),
      (row) => row.salesContract.contractNo,
    ),
  ];

  const totalMissing = sections.reduce((sum, section) => sum + section.without_source, 0);
  const audit = {
    status: totalMissing > 0 ? 'source_gaps_present' : 'all_scoped_rows_have_source_evidence',
    evidence_pattern: sourceEvidencePattern.source,
    sections,
    total_without_source: totalMissing,
  };

  fs.mkdirSync(parsedDir, { recursive: true });
  const outJson = path.join(parsedDir, 'wps_db_source_coverage.json');
  const outMd = path.join(parsedDir, 'wps_db_source_coverage.md');
  fs.writeFileSync(outJson, `${JSON.stringify(audit, null, 2)}\n`);
  fs.writeFileSync(outMd, renderMarkdown(audit));
  console.log(JSON.stringify({ status: audit.status, total_without_source: totalMissing, out: { json: outJson, md: outMd } }, null, 2));
}

function renderMarkdown(audit) {
  const lines = [
    '# WPS 数据库来源覆盖审计',
    '',
    `- 状态：\`${audit.status}\``,
    `- 缺少 WPS/文件来源标记的记录数：\`${audit.total_without_source}\``,
    `- 来源识别正则：\`${audit.evidence_pattern}\``,
    '',
    '## 覆盖概览',
    '',
    '| 范围 | 总数 | 有来源 | 缺来源 | 覆盖率 |',
    '|---|---:|---:|---:|---:|',
  ];

  for (const section of audit.sections) {
    lines.push(
      `| ${section.name} | ${section.total} | ${section.with_source} | ${section.without_source} | ${(section.coverage_ratio * 100).toFixed(2)}% |`,
    );
  }

  lines.push('', '## 缺来源样本');
  for (const section of audit.sections) {
    lines.push('', `### ${section.name}`, '');
    if (section.without_source === 0) {
      lines.push('- 无');
      continue;
    }
    lines.push('缺来源最多的合同：');
    for (const item of section.missing_by_contract.slice(0, 8)) {
      lines.push(`- \`${item.key}\`: ${item.count}`);
    }
    lines.push('', '样本：');
    for (const item of section.missing_samples) {
      lines.push(`- ${JSON.stringify(item)}`);
    }
  }

  lines.push(
    '',
    '## 结论',
    '',
    '- 本报告只读数据库，不修改任何业务数据。',
    '- 缺来源不等于数据一定错误，但说明这部分记录还不能仅凭当前 note 字段证明与 WPS 文件正文对齐。',
    '- 后续可按合同分批补来源 note；补写前仍需要由源文件行号、商品、数量、规格、门店/供应商形成唯一匹配。',
    '',
  );
  return lines.join('\n');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
