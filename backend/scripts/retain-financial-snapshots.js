#!/usr/bin/env node
/**
 * Input: 明确指定的会计报表/科目余额/明细账文件，可选 --confirm
 * Output: 只含计数/期间的预检或新增结果，不输出路径、文件名、哈希或原行
 * Pos: 本地财务资料留存 Adapter；确认前由操作者完成实际SQLite在线备份
 */
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes('--confirm');
  if (args.some(arg => arg.startsWith('--') && arg !== '--confirm')) throw new Error('不支持的参数');
  const files = args.filter(arg => arg !== '--confirm');
  if (!files.length) throw new Error('请指定待留存文件');
  // 配置模块先检查权限，再加载环境。原文件只读，全部解析成功后才可能写库。
  require('../src/config');
  const prisma = require('../src/utils/prisma');
  try {
    const service = require('../src/services/financialEvidenceService');
    const documents = files.map(file => service.parseFinancialEvidenceSnapshot({
      buffer: fs.readFileSync(file), fileName: path.basename(file),
    }));
    console.log(JSON.stringify({
      mode: confirm ? 'confirm' : 'preview',
      documents: documents.map(doc => ({
        category: doc.category, period: doc.categoryLabel, year: doc.periodYear, month: doc.periodMonth,
        sheets: doc.importedSheetCount, rows: doc.rowCount, redactions: doc.redactionCount,
      })),
    }));
    if (confirm) {
      const result = await service.appendFinancialEvidenceSnapshots(documents, prisma);
      console.log(JSON.stringify({ imported: result.imported, skipped: result.skipped, replaced: 0 }));
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch(() => {
  // 文件解析、数据库异常可能带来源/凭据参数，只给固定提示，不透传异常。
  console.error('财务快照留存失败：请核对格式、表内期间或数据库状态；本批未覆盖已有资料。');
  process.exitCode = 1;
});
