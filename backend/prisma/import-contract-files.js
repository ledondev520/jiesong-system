/**
 * Input: Downloads/捷淞汇总 + Documents/捷淞/12-报关单 中的合同 PDF 文件
 * Output: 复制文件至 uploads/ + 创建 ContractFile 记录
 * Pos: 一次性脚本，为采购合同绑定 PDF 附件
 *
 * 运行: cd backend && node prisma/import-contract-files.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
const CONTRACT_DIR = path.join(UPLOAD_DIR, 'contracts');

/**
 * 职责：从文件名中提取 CG 合同编号
 * 思路：匹配 CG 后跟数字的模式
 */
function extractCGNo(filename) {
  const m = filename.match(/CG\d{5,}/);
  return m ? m[0] : null;
}

/**
 * 职责：递归扫描目录中的 PDF 文件
 */
function findPDFs(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findPDFs(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      results.push(fullPath);
    }
  }
  return results;
}

async function main() {
  console.log('=== 导入合同附件 ===\n');

  // 0. 确保目标目录存在
  fs.mkdirSync(CONTRACT_DIR, { recursive: true });

  // 1. 扫描所有来源目录
  const sources = [
    '/Users/helena/Downloads/捷淞汇总',
    '/Users/helena/Downloads',
    '/Users/helena/Documents/捷淞/12-报关单',
    '/Users/helena/Cursor/jiesong_system/docs',
  ];

  const allPDFs = [];
  for (const src of sources) {
    const files = findPDFs(src);
    allPDFs.push(...files);
  }

  console.log(`扫描到 ${allPDFs.length} 个 PDF 文件`);

  // 2. 提取 CG 编号并去重（优先归档版本）
  const cgFileMap = new Map();
  for (const filePath of allPDFs) {
    const filename = path.basename(filePath);
    const cgNo = extractCGNo(filename);
    if (!cgNo) continue;

    const isArchived = filename.includes('归档');
    const existing = cgFileMap.get(cgNo);
    if (!existing || (isArchived && !existing.isArchived)) {
      cgFileMap.set(cgNo, { filePath, filename, cgNo, isArchived });
    }
  }

  console.log(`找到 ${cgFileMap.size} 个唯一 CG 合同文件`);

  // 3. 加载所有采购合同
  const contracts = await prisma.purchaseContract.findMany({
    select: { id: true, contractNo: true },
  });
  const contractMap = new Map(contracts.map((c) => [c.contractNo, c.id]));

  let copied = 0;
  let linked = 0;
  let noContract = 0;

  for (const [cgNo, info] of cgFileMap) {
    const contractId = contractMap.get(cgNo);

    // 3.1 复制文件到 uploads/contracts/
    const targetName = `${cgNo}-${Date.now()}.pdf`;
    const targetPath = path.join(CONTRACT_DIR, targetName);
    const relPath = path.relative(UPLOAD_DIR, targetPath);

    try {
      fs.copyFileSync(info.filePath, targetPath);
      copied++;
    } catch (err) {
      console.log(`  [复制失败] ${info.filename}: ${err.message}`);
      continue;
    }

    // 3.2 创建 ContractFile（仅当合同存在时）
    if (contractId) {
      const stats = fs.statSync(targetPath);
      const existing = await prisma.contractFile.findFirst({
        where: { purchaseContractId: contractId },
      });
      if (!existing) {
        await prisma.contractFile.create({
          data: {
            purchaseContractId: contractId,
            fileName: info.filename,
            filePath: relPath,
            fileType: 'application/pdf',
            fileSize: stats.size,
          },
        });
        linked++;
      }
    } else {
      noContract++;
    }
  }

  console.log(`\n复制文件: ${copied}`);
  console.log(`关联到合同: ${linked}`);
  console.log(`无对应合同: ${noContract} (文件仍复制，待后续匹配)`);

  const totalFiles = await prisma.contractFile.count();
  console.log(`ContractFile 总数: ${totalFiles}`);

  await prisma.$disconnect();
}

main();
