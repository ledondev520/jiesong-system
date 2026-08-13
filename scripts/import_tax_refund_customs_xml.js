#!/usr/bin/env node
/**
 * Input: 海关解密 XML 目录、目标 EXP 合同范围、可选报关单号到合同号的人工确认映射
 * Output: 受限 dry-run 计划；显式 --apply 后幂等写入报关单及明细
 * Pos: 出口退税报关 XML 关联 CLI Adapter；只关联正式 XML 能逐项命中的装箱明细
 *
 * Note: 我被更新时，必须同步更新本头注释 + scripts/README.md。
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
const DEFAULT_OUT_DIR = path.join(repoRoot, 'tmp', 'tax-refund-customs-xml-import');
const AMOUNT_TOLERANCE = 0.1;
const NUMBER_TOLERANCE = 0.000001;
const UNIT_BY_CODE = Object.freeze({
  '001': '台',
  '006': '套',
  '007': '个',
  '011': '件',
  '012': '支',
  '032': '平方米',
  '035': '千克',
  '121': '批',
});

function usage() {
  return `
用法:
  node scripts/import_tax_refund_customs_xml.js --source-dir <目录> [参数]

参数:
  --source-dir <dir>       海关解密 XML 所在目录；也可设置 TAX_REFUND_CUSTOMS_XML_DIR
  --contracts <selection>  允许关联的合同范围/列表，例如 EXP260004-EXP260009
  --map <报关单号=合同号>   可重复；仅用于 XML 合同号与业务确认合同号不一致的例外
  --out-dir <dir>          受限计划目录，默认 tmp/tax-refund-customs-xml-import
  --apply                  执行写库；省略时只生成 dry-run 计划
  -h, --help               显示帮助

示例:
  node scripts/import_tax_refund_customs_xml.js \\
    --source-dir "$HOME/Downloads/解密报关单" \\
    --contracts EXP260004-EXP260009 \\
    --map 530420260000000000=EXP260009

说明:
  默认不写数据库。写库前必须先执行 npm --prefix backend run db:backup。
  映射必须通过报关品名、数量、已有 HS 编码和已有金额校验；不会创建退税草稿。
`;
}

function resolvePath(value) {
  if (!value) throw new Error('路径参数不能为空');
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function parseArgs(argv) {
  const options = {
    sourceDir: process.env.TAX_REFUND_CUSTOMS_XML_DIR
      ? resolvePath(process.env.TAX_REFUND_CUSTOMS_XML_DIR)
      : null,
    contracts: null,
    mappings: new Map(),
    outDir: DEFAULT_OUT_DIR,
    apply: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} 缺少参数值`);
      index += 1;
      return value;
    };
    if (arg === '--source-dir') options.sourceDir = resolvePath(next());
    else if (arg === '--contracts') options.contracts = expandContracts(next());
    else if (arg === '--map') {
      const mapping = next().match(/^([^=]+)=([^=]+)$/);
      if (!mapping) throw new Error('--map 格式必须为 报关单号=合同号');
      const declarationNo = cleanText(mapping[1]);
      const contractNo = cleanText(mapping[2]).toUpperCase();
      if (!/^\d{18}$/.test(declarationNo) || !/^EXP\d+$/.test(contractNo)) {
        throw new Error('--map 中的报关单号或合同号格式不正确');
      }
      if (options.mappings.has(declarationNo)) throw new Error('同一报关单号不能重复映射');
      options.mappings.set(declarationNo, contractNo);
    } else if (arg === '--out-dir') options.outDir = resolvePath(next());
    else if (arg === '--apply') options.apply = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`未知参数: ${arg}`);
  }
  if (!options.help && !options.sourceDir) throw new Error('缺少 --source-dir');
  if (!options.help && !options.contracts) throw new Error('缺少 --contracts，必须显式限制写入范围');
  return options;
}

function expandContracts(selection) {
  const result = new Set();
  for (const rawPart of String(selection || '').split(',')) {
    const part = rawPart.trim().toUpperCase();
    if (!part) continue;
    const range = part.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/);
    if (range) {
      const [, leftPrefix, leftDigits, rightPrefix, rightDigits] = range;
      if (leftPrefix !== rightPrefix || leftDigits.length !== rightDigits.length) {
        throw new Error(`合同范围格式不一致: ${part}`);
      }
      const start = Number(leftDigits);
      const end = Number(rightDigits);
      if (end < start || end - start > 500) throw new Error(`合同范围无效或过大: ${part}`);
      for (let value = start; value <= end; value += 1) {
        result.add(`${leftPrefix}${String(value).padStart(leftDigits.length, '0')}`);
      }
      continue;
    }
    if (!/^EXP\d+$/.test(part)) throw new Error(`无法识别合同号: ${part}`);
    result.add(part);
  }
  if (result.size === 0) throw new Error('合同范围不能为空');
  return result;
}

function cleanText(value) {
  return String(value == null ? '' : value).replace(/\u0000/g, '').trim();
}

function decodeXmlEntities(value) {
  return cleanText(value)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlBlocks(xml, tagName) {
  const pattern = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi');
  return Array.from(String(xml).matchAll(pattern), (match) => match[1]);
}

function xmlText(xml, tagName) {
  const full = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'i').exec(xml);
  if (full) return decodeXmlEntities(full[1].replace(/<[^>]+>/g, ''));
  const empty = new RegExp(`<${tagName}(?:\\s[^>]*)?\\s*/>`, 'i').exec(xml);
  return empty ? '' : null;
}

function requiredText(xml, tagName, context) {
  const value = xmlText(xml, tagName);
  if (!value) throw new Error(`${context} 缺少 ${tagName}`);
  return value;
}

function numberValue(value, context, { allowZero = true } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (!allowZero && parsed <= 0) || (allowZero && parsed < 0)) {
    throw new Error(`${context} 数值无效`);
  }
  return parsed;
}

function parseDate8(value, context) {
  if (!/^\d{8}$/.test(value)) throw new Error(`${context} 日期格式无效`);
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${context} 日期无效`);
  }
  return date;
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function parseDeclarationXml(xml, sourceName, sourceSha256) {
  const declarations = [];
  for (const [declarationIndex, dec] of xmlBlocks(xml, 'Dec').entries()) {
    const context = `${sourceName} 第 ${declarationIndex + 1} 票`;
    const head = xmlBlocks(dec, 'DecHead')[0];
    if (!head) throw new Error(`${context} 缺少 DecHead`);
    const declarationNo = requiredText(head, 'bgd_no', context);
    const xmlContractNo = requiredText(head, 'ht_no', context).toUpperCase();
    const exportDate = parseDate8(requiredText(head, 'lj_date', context), context);
    if (!/^\d{18}$/.test(declarationNo)) throw new Error(`${context} 报关单号格式无效`);
    if (!/^EXP\d+$/.test(xmlContractNo)) throw new Error(`${context} 合同号格式无效`);
    const items = xmlBlocks(dec, 'DecList').map((itemXml, itemIndex) => {
      const itemContext = `${context} 第 ${itemIndex + 1} 项`;
      const itemNo = numberValue(requiredText(itemXml, 'spxh', itemContext), itemContext, { allowZero: false });
      const currency = requiredText(itemXml, 'Yb_bz', itemContext).toUpperCase();
      const quantity = numberValue(requiredText(itemXml, 'Cj_qnt', itemContext), itemContext, { allowZero: false });
      const totalPrice = numberValue(requiredText(itemXml, 'yb_amt', itemContext), itemContext, { allowZero: false });
      const unitCode = requiredText(itemXml, 'Cj_unit', itemContext);
      const firstUnitCode = cleanText(xmlText(itemXml, 'Fd_unit'));
      const firstQuantity = numberValue(cleanText(xmlText(itemXml, 'Fd_qnt')) || '0', itemContext);
      const secondUnitCode = cleanText(xmlText(itemXml, 'No2_Fd_unit'));
      const secondQuantity = numberValue(cleanText(xmlText(itemXml, 'No2_Fd_qnt')) || '0', itemContext);
      return {
        itemNo,
        customsName: requiredText(itemXml, 'cm_name', itemContext),
        hsCode: requiredText(itemXml, 'cmcode', itemContext),
        currency,
        quantity,
        unitCode,
        unit: UNIT_BY_CODE[unitCode] || `海关单位${unitCode}`,
        unitPrice: totalPrice / quantity,
        totalPrice,
        netWeight: firstUnitCode === '035'
          ? firstQuantity
          : secondUnitCode === '035' ? secondQuantity : 0,
      };
    });
    if (items.length === 0) throw new Error(`${context} 没有 DecList`);
    const currencies = new Set(items.map((item) => item.currency));
    if (currencies.size !== 1 || !currencies.has('USD')) throw new Error(`${context} 仅支持单一 USD 币种`);
    declarations.push({
      declarationNo,
      xmlContractNo,
      exportDate,
      sourceName,
      sourceSha256,
      items,
    });
  }
  if (declarations.length === 0) throw new Error(`${sourceName} 没有可识别的 Dec`);
  return declarations;
}

function readXmlDirectory(sourceDir) {
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error('XML 来源目录不存在或不是目录');
  }
  const files = fs.readdirSync(sourceDir)
    .filter((name) => !name.startsWith('.') && name.toLowerCase().endsWith('.xml'))
    .sort();
  if (files.length === 0) throw new Error('XML 来源目录没有正式 XML 文件');
  const declarations = [];
  for (const sourceName of files) {
    const filePath = path.join(sourceDir, sourceName);
    const sourceSha256 = sha256(filePath);
    const xml = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    declarations.push(...parseDeclarationXml(xml, sourceName, sourceSha256));
  }
  const duplicateNumbers = declarations
    .map((item) => item.declarationNo)
    .filter((value, index, values) => values.indexOf(value) !== index);
  if (duplicateNumbers.length > 0) throw new Error('来源目录包含重复报关单号');
  return { files, declarations };
}

function normalizeName(value) {
  return cleanText(value).replace(/[\s·・,，。()（）\-_/]/g, '').toLowerCase();
}

function normalizeHsCode(value) {
  return cleanText(value).replace(/\D/g, '');
}

function closeEnough(left, right, tolerance = NUMBER_TOLERANCE) {
  return Math.abs(Number(left) - Number(right)) <= tolerance;
}

function matchPackingItem(contract, xmlItem) {
  const name = normalizeName(xmlItem.customsName);
  const named = contract.packingItems.filter((item) => normalizeName(item.product.customsName) === name);
  const quantityMatched = named.filter((item) => closeEnough(item.quantity, xmlItem.quantity));
  if (quantityMatched.length !== 1) {
    throw new Error(`合同 ${contract.contractNo} 的报关商品无法按品名和数量唯一命中装箱明细`);
  }
  const packingItem = quantityMatched[0];
  const existingHsCode = normalizeHsCode(packingItem.product.hsCode);
  if (existingHsCode && existingHsCode !== normalizeHsCode(xmlItem.hsCode)) {
    throw new Error(`合同 ${contract.contractNo} 的装箱商品 HS 编码与 XML 不一致`);
  }
  if (packingItem.totalPrice != null
      && !closeEnough(packingItem.totalPrice, xmlItem.totalPrice, AMOUNT_TOLERANCE)) {
    throw new Error(`合同 ${contract.contractNo} 的装箱商品金额与 XML 不一致`);
  }
  const foreignReferences = packingItem.customsDeclarationItems
    .filter((item) => item.customsDeclaration.declarationNo !== xmlItem.declarationNo);
  if (foreignReferences.length > 0) {
    throw new Error(`合同 ${contract.contractNo} 的装箱商品已关联其他报关单`);
  }
  return packingItem;
}

function existingDeclarationMatches(existing, operation) {
  if (!existing || existing.salesContractId !== operation.salesContractId) return false;
  if (existing.items.length !== operation.items.length) return false;
  return operation.items.every((planned) => existing.items.some((item) => (
    item.itemNo === planned.itemNo
    && item.packingItemId === planned.packingItemId
    && normalizeName(item.customsName) === normalizeName(planned.customsName)
    && normalizeHsCode(item.hsCode) === normalizeHsCode(planned.hsCode)
    && closeEnough(item.quantity, planned.quantity)
    && closeEnough(item.totalPrice, planned.totalPrice, AMOUNT_TOLERANCE)
  )));
}

async function buildImportPlan(options, prisma) {
  const source = readXmlDirectory(options.sourceDir);
  const resolved = source.declarations.map((declaration) => ({
    ...declaration,
    targetContractNo: options.mappings.get(declaration.declarationNo) || declaration.xmlContractNo,
  })).filter((declaration) => options.contracts.has(declaration.targetContractNo));
  if (resolved.length === 0) throw new Error('XML 中没有命中允许合同范围的报关单');

  for (const declarationNo of options.mappings.keys()) {
    if (!source.declarations.some((item) => item.declarationNo === declarationNo)) {
      throw new Error('存在未命中 XML 的人工确认映射');
    }
  }

  const targetContractNos = Array.from(new Set(resolved.map((item) => item.targetContractNo)));
  const [contracts, existingDeclarations] = await Promise.all([
    prisma.salesContract.findMany({
      where: { contractNo: { in: targetContractNos } },
      include: {
        packingItems: {
          include: {
            product: { select: { id: true, customsName: true, hsCode: true } },
            customsDeclarationItems: {
              select: {
                customsDeclaration: { select: { declarationNo: true } },
              },
            },
          },
        },
      },
    }),
    prisma.customsDeclaration.findMany({
      where: { declarationNo: { in: resolved.map((item) => item.declarationNo) } },
      include: { items: true },
    }),
  ]);
  const contractByNo = new Map(contracts.map((item) => [item.contractNo, item]));
  const existingByNo = new Map(existingDeclarations.map((item) => [item.declarationNo, item]));
  if (contracts.length !== targetContractNos.length) throw new Error('至少一个目标出口合同不存在');

  const creates = [];
  const unchanged = [];
  for (const declaration of resolved) {
    const contract = contractByNo.get(declaration.targetContractNo);
    const items = declaration.items.map((xmlItem) => {
      const packingItem = matchPackingItem(contract, { ...xmlItem, declarationNo: declaration.declarationNo });
      return {
        productId: packingItem.productId,
        packingItemId: packingItem.id,
        itemNo: xmlItem.itemNo,
        customsName: xmlItem.customsName,
        hsCode: xmlItem.hsCode,
        quantity: xmlItem.quantity,
        unit: xmlItem.unit,
        unitPrice: xmlItem.unitPrice,
        totalPrice: xmlItem.totalPrice,
      };
    });
    const xmlMismatch = declaration.xmlContractNo !== declaration.targetContractNo;
    const noteParts = [
      `[CUSTOMS_XML] ${declaration.sourceName}`,
      `sha256=${declaration.sourceSha256}`,
      `xml_ht_no=${declaration.xmlContractNo}`,
      `target_contract=${declaration.targetContractNo}`,
    ];
    if (xmlMismatch) noteParts.push('business_confirmed_mapping=2026-08-14');
    const operation = {
      declarationNo: declaration.declarationNo,
      salesContractId: contract.id,
      contractNo: contract.contractNo,
      xmlContractNo: declaration.xmlContractNo,
      exportDate: declaration.exportDate,
      customsBroker: contract.customsBroker || '捷淞',
      currency: 'USD',
      totalAmount: items.reduce((sum, item) => sum + item.totalPrice, 0),
      totalQuantity: items.reduce((sum, item) => sum + item.quantity, 0),
      totalNetWeight: declaration.items.reduce((sum, item) => sum + item.netWeight, 0),
      totalGrossWeight: 0,
      status: 'RELEASED',
      note: noteParts.join('; '),
      items,
    };
    const existing = existingByNo.get(declaration.declarationNo);
    if (!existing) creates.push(operation);
    else if (existingDeclarationMatches(existing, operation)) unchanged.push(operation);
    else throw new Error('现有报关单与本次 XML 关联不一致，已停止写入');
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun: !options.apply,
    source: {
      directoryName: path.basename(options.sourceDir),
      xmlFiles: source.files.length,
      declarationsParsed: source.declarations.length,
    },
    summary: {
      selectedDeclarations: resolved.length,
      createDeclarations: creates.length,
      createItems: creates.reduce((sum, item) => sum + item.items.length, 0),
      unchangedDeclarations: unchanged.length,
      businessConfirmedMappings: resolved.filter((item) => item.xmlContractNo !== item.targetContractNo).length,
      taxRefundDrafts: 0,
    },
    operations: { creates, unchanged },
  };
}

function writeRestrictedPlan(outDir, plan) {
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(outDir, 0o700);
  const planPath = path.join(outDir, 'import_plan.json');
  fs.writeFileSync(planPath, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(planPath, 0o600);
  return planPath;
}

async function applyImportPlan(plan, prisma) {
  if (plan.summary.createDeclarations === 0) return { createdDeclarations: 0, createdItems: 0 };
  return prisma.$transaction(async (tx) => {
    let createdItems = 0;
    for (const operation of plan.operations.creates) {
      const { contractNo: _contractNo, xmlContractNo: _xmlContractNo, items, ...data } = operation;
      await tx.customsDeclaration.create({
        data: {
          ...data,
          items: { create: items },
        },
      });
      createdItems += items.length;
    }
    return { createdDeclarations: plan.operations.creates.length, createdItems };
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const dotenv = require(path.join(backendPath, 'node_modules', 'dotenv'));
  dotenv.config({ path: path.join(backendPath, '.env'), override: false });
  if (process.env.NODE_ENV === 'development') process.env.NODE_ENV = 'tax-refund-customs-xml-import';
  const prisma = require(path.join(backendPath, 'src', 'utils', 'prisma'));
  try {
    const plan = await buildImportPlan(options, prisma);
    const planPath = writeRestrictedPlan(options.outDir, plan);
    const result = options.apply
      ? await applyImportPlan(plan, prisma)
      : { createdDeclarations: 0, createdItems: 0 };
    process.stdout.write(`${JSON.stringify({
      mode: options.apply ? 'applied' : 'dry-run',
      xmlFiles: plan.source.xmlFiles,
      selectedDeclarations: plan.summary.selectedDeclarations,
      createDeclarations: plan.summary.createDeclarations,
      createItems: plan.summary.createItems,
      unchangedDeclarations: plan.summary.unchangedDeclarations,
      businessConfirmedMappings: plan.summary.businessConfirmedMappings,
      applied: result,
      planPath,
    }, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`导入失败: ${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  applyImportPlan,
  buildImportPlan,
  expandContracts,
  parseArgs,
  parseDeclarationXml,
};
