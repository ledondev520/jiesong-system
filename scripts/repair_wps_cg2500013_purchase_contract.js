/**
 * Input: refreshed purchase_evidence_extracts.csv + purchase_evidence_items.csv + backend/prisma/dev.db
 * Output: tmp/wps_11_export_list_raw/parsed/cg2500013_purchase_contract_repair_plan.json; optional Prisma repair when --apply is passed
 * Pos: WPS CG2500013 采购合同错挂修复脚本；只在 PDF 正文、附件 SHA1、无付款/库存引用均通过时，把库中重复屏风合同修正为 PDF 证明的釉面砖合同
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
process.chdir(backendPath);

const { PrismaClient } = require(path.join(backendPath, 'node_modules/@prisma/client'));
const Papa = require(path.join(backendPath, 'node_modules/papaparse'));

const prisma = new PrismaClient();
const DEFAULT_PARSED_DIR = path.join(repoRoot, 'tmp/wps_11_export_list_raw/parsed');
const CONTRACT_NO = 'CG2500013';
const SOURCE_RELATIVE_PATH = '2025年6月/20250605 安娜汉姆3柜/购销合同 CG2500013 釉面砖.pdf';
const SOURCE_PATH = path.join(repoRoot, 'tmp/wps_11_export_list_raw/11-报关记录', SOURCE_RELATIVE_PATH);
const EXPECTED_SOURCE_SHA1 = '1115ea8a98d70369bae10c56aa4018332b4d8e90';

function parseArgs(argv) {
  const options = { parsedDir: DEFAULT_PARSED_DIR, out: null, apply: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--parsed-dir') {
      options.parsedDir = path.resolve(argv[++index]);
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--apply') {
      options.apply = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未知参数: ${arg}`);
    }
  }
  options.out = options.out || path.join(options.parsedDir, 'cg2500013_purchase_contract_repair_plan.json');
  return options;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/repair_wps_cg2500013_purchase_contract.js [options]

Options:
  --parsed-dir <dir>  解析产物目录，默认 tmp/wps_11_export_list_raw/parsed
  --out <file>        输出修复计划 JSON
  --apply             执行写库；不传则只 dry-run
`);
}

function readCsv(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = Papa.parse(content, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0];
    throw new Error(`${filePath} CSV 解析失败: ${first.message}`);
  }
  return parsed.data.map((row) => {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      normalized[key.replace(/^\uFEFF/, '')] = typeof value === 'string' ? value.trim() : value;
    }
    return normalized;
  });
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/[￥¥$,]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function closeEnough(left, right, tolerance = 0.02) {
  return left != null && right != null && Math.abs(left - right) <= tolerance;
}

function sha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function appendNote(existingNote, addition) {
  const existing = String(existingNote || '').trim();
  if (!existing) return addition;
  if (existing.includes(addition)) return existing;
  return `${existing}\n${addition}`;
}

function sourceContractNote(oldContract, evidence) {
  return [
    `[WPS_PURCHASE_EVIDENCE] ${SOURCE_RELATIVE_PATH}`,
    '[WPS_PURCHASE_PDF_TEXT_REPAIR]',
    `source_contract_no=${evidence.purchase_contract_no}`,
    `old_supplier=${oldContract.supplier.name}`,
    `old_total=${oldContract.totalAmount}`,
  ].join(' ');
}

function sourceItemNote(oldItem, itemEvidence) {
  return [
    `[WPS_PURCHASE_EVIDENCE] ${SOURCE_RELATIVE_PATH}#${itemEvidence.product_name}/${itemEvidence.quantity}${itemEvidence.unit || ''}`,
    '[WPS_PURCHASE_PDF_TEXT_REPAIR]',
    `old_product=${oldItem.product.customsName}`,
    `old_quantity=${oldItem.quantity}${oldItem.unit || ''}`,
    `old_total=${oldItem.totalPrice}`,
  ].join(' ');
}

function assertEvidence(extractRows, itemRows) {
  const evidence = extractRows.find((row) => row.relative_path === SOURCE_RELATIVE_PATH && row.purchase_contract_no === CONTRACT_NO);
  const itemEvidence = itemRows.find((row) => row.relative_path === SOURCE_RELATIVE_PATH && row.purchase_contract_no === CONTRACT_NO);
  if (!evidence) throw new Error('缺少 CG2500013 PDF 合同头抽取证据，请先重跑 extract_wps_purchase_evidence.py');
  if (!itemEvidence) throw new Error('缺少 CG2500013 PDF 明细抽取证据，请先重跑 extract_wps_purchase_evidence.py');
  const expected = {
    supplier_name: '临沂市宏宇艺术腰线有限公司',
    signed_at: '2025-05-26',
    total_amount: 11925,
    tax_rate: 13,
    supplier_tax_id: '913713113261836015',
    supplier_address: '山东省临沂市罗庄区傅庄街道劳模店村',
    bank_name: '中国建设银行股份有限公司临沂龙潭支行',
    bank_account: '37001826203050150099',
  };
  for (const [key, value] of Object.entries(expected)) {
    if (key === 'total_amount') {
      if (!closeEnough(numberOrNull(evidence[key]), value, 0.05)) throw new Error(`合同头证据 ${key} 不匹配`);
    } else if (String(evidence[key] || '') !== String(value)) {
      throw new Error(`合同头证据 ${key} 不匹配: ${evidence[key]} != ${value}`);
    }
  }
  const expectedItem = {
    product_name: '釉面砖',
    unit: '平方米',
    quantity: 70,
    unit_price: 150.758,
    total_amount: 11925,
  };
  for (const [key, value] of Object.entries(expectedItem)) {
    if (typeof value === 'number') {
      if (!closeEnough(numberOrNull(itemEvidence[key]), value, 0.05)) throw new Error(`明细证据 ${key} 不匹配`);
    } else if (String(itemEvidence[key] || '') !== String(value)) {
      throw new Error(`明细证据 ${key} 不匹配: ${itemEvidence[key]} != ${value}`);
    }
  }
  return { evidence, itemEvidence };
}

async function buildPlan(options) {
  const extractRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_extracts.csv'));
  const itemRows = readCsv(path.join(options.parsedDir, 'purchase_evidence_items.csv'));
  const { evidence, itemEvidence } = assertEvidence(extractRows, itemRows);
  if (!fs.existsSync(SOURCE_PATH)) throw new Error(`缺少源 PDF: ${SOURCE_PATH}`);
  const sourceSha1 = sha1(SOURCE_PATH);
  if (sourceSha1 !== EXPECTED_SOURCE_SHA1) throw new Error(`源 PDF SHA1 不匹配: ${sourceSha1}`);

  const contract = await prisma.purchaseContract.findUnique({
    where: { contractNo: CONTRACT_NO },
    include: {
      supplier: true,
      items: { include: { product: true, inventories: true } },
      files: true,
      payments: true,
    },
  });
  if (!contract) throw new Error(`数据库缺少采购合同 ${CONTRACT_NO}`);
  if (contract.items.length !== 1) throw new Error(`${CONTRACT_NO} 当前不是单明细，拒绝自动修复`);
  if (contract.payments.length > 0) throw new Error(`${CONTRACT_NO} 已有付款记录，拒绝自动修复`);
  const item = contract.items[0];
  if (item.inventories.length > 0) throw new Error(`${CONTRACT_NO} 明细已有库存引用，拒绝自动修复`);

  const sourceUpload = contract.files.find((file) => file.fileName === '购销合同 CG2500013 釉面砖.pdf');
  if (!sourceUpload) throw new Error(`${CONTRACT_NO} 缺少已上传 PDF 附件记录`);
  const uploadedPath = path.join(backendPath, 'uploads', sourceUpload.filePath.replace(/^contracts\//, 'contracts/'));
  const uploadedSha1 = sha1(uploadedPath);
  if (uploadedSha1 !== sourceSha1) throw new Error(`上传附件与 WPS 源 PDF SHA1 不一致: ${uploadedSha1}`);

  let supplier = await prisma.supplier.findFirst({ where: { name: evidence.supplier_name } });
  const supplierAction = supplier ? 'update_existing' : 'create';
  const product = await prisma.product.findFirst({ where: { customsName: itemEvidence.product_name } });
  if (!product) throw new Error(`数据库缺少商品 ${itemEvidence.product_name}`);

  const contractNote = sourceContractNote(contract, evidence);
  const itemNote = sourceItemNote(item, itemEvidence);
  const plan = {
    dryRun: !options.apply,
    source: {
      relativePath: SOURCE_RELATIVE_PATH,
      sha1: sourceSha1,
      uploadedFile: sourceUpload.filePath,
      uploadedSha1,
    },
    supplierAction,
    supplier: {
      currentId: supplier?.id || null,
      name: evidence.supplier_name,
      taxId: evidence.supplier_tax_id,
      address: evidence.supplier_address,
      bankName: evidence.bank_name,
      bankAccount: evidence.bank_account,
    },
    contractUpdate: {
      id: contract.id,
      contractNo: contract.contractNo,
      oldSupplier: contract.supplier.name,
      oldTotalAmount: contract.totalAmount,
      oldSignedAt: contract.signedAt,
      oldNote: contract.note || '',
      newSupplier: evidence.supplier_name,
      newTotalAmount: numberOrNull(evidence.total_amount),
      newTaxRate: numberOrNull(evidence.tax_rate),
      newSignedAt: `${evidence.signed_at}T00:00:00+08:00`,
      newNote: appendNote(contract.note, contractNote),
      statusPreserved: contract.status,
    },
    itemUpdate: {
      id: item.id,
      oldProduct: item.product.customsName,
      oldQuantity: item.quantity,
      oldUnit: item.unit,
      oldUnitPrice: item.unitPrice,
      oldTotalPrice: item.totalPrice,
      oldNote: item.note || '',
      newProduct: itemEvidence.product_name,
      newQuantity: numberOrNull(itemEvidence.quantity),
      newUnit: itemEvidence.unit,
      newUnitPrice: numberOrNull(itemEvidence.unit_price),
      newTotalPrice: numberOrNull(itemEvidence.total_amount),
      newNote: appendNote(item.note, itemNote),
    },
  };
  if (options.apply) {
    await prisma.$transaction(async (tx) => {
      supplier = await tx.supplier.findFirst({ where: { name: evidence.supplier_name } });
      if (!supplier) {
        supplier = await tx.supplier.create({
          data: {
            name: evidence.supplier_name,
            taxId: evidence.supplier_tax_id,
            address: evidence.supplier_address,
            bankName: evidence.bank_name,
            bankAccount: evidence.bank_account,
          },
        });
      } else {
        supplier = await tx.supplier.update({
          where: { id: supplier.id },
          data: {
            taxId: supplier.taxId || evidence.supplier_tax_id,
            address: supplier.address || evidence.supplier_address,
            bankName: supplier.bankName || evidence.bank_name,
            bankAccount: supplier.bankAccount || evidence.bank_account,
          },
        });
      }
      await tx.purchaseContract.update({
        where: { id: contract.id },
        data: {
          supplierId: supplier.id,
          totalAmount: plan.contractUpdate.newTotalAmount,
          taxRate: plan.contractUpdate.newTaxRate,
          signedAt: new Date(plan.contractUpdate.newSignedAt),
          note: plan.contractUpdate.newNote,
        },
      });
      await tx.purchaseItem.update({
        where: { id: item.id },
        data: {
          productId: product.id,
          quantity: plan.itemUpdate.newQuantity,
          unit: plan.itemUpdate.newUnit,
          unitPrice: plan.itemUpdate.newUnitPrice,
          totalPrice: plan.itemUpdate.newTotalPrice,
          note: plan.itemUpdate.newNote,
        },
      });
    });
  }
  return plan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = await buildPlan(options);
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(plan, null, 2)}\n`);
  console.log(JSON.stringify({
    dryRun: !options.apply,
    supplierAction: plan.supplierAction,
    contractUpdated: 1,
    itemUpdated: 1,
    out: options.out,
    mode: options.apply ? 'apply' : 'dry-run',
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
