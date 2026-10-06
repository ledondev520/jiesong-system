/**
 * Input: Private synthetic directory and committed migrations
 * Output: Generated XLS/XLSX sources, actual CLI imports and independent SQLite snapshots
 * Pos: Financial library HTTP/hosted-browser fixture; no real sources or providers
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const XLSX = require('xlsx');

/**
 * 职责：按固定字面量生成两类真实文件及专用/不支持来源，不复用解析服务。
 * @param {string} directory 独占0700合成根目录
 * @returns {object[]} 文件身份和原始字节，仅用于本地断言
 */
function createSources(directory) {
  const root = path.join(directory, 'sources');
  fs.mkdirSync(root, { mode: 0o700 });
  const ledger = XLSX.utils.book_new();
  const rows = [['合成总账'], [], ['摘要', '借方', '贷方', '余额', '关联号', '空值', '标记']];
  for (let index = 0; index < 53; index += 1) {
    rows.push([`合成账行${index + 1}`, index === 0 ? 125.5 : 10, 0, -20.25, 'SYNTHETIC-BIZ-ID', null, true]);
  }
  rows.push([], ['合计', 645.5, 0, -20.25]);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet.B4 = { t: 'n', v: 125.5, f: '100+25.5' };
  XLSX.utils.book_append_sheet(ledger, sheet, '总账');
  XLSX.utils.book_append_sheet(ledger, XLSX.utils.aoa_to_sheet([[], ['合成来源备注', true, null, 0], ...Array.from({ length: 9 }, () => []), ['保留尾注', -7.5]]), '备注');
  XLSX.utils.book_append_sheet(ledger, XLSX.utils.aoa_to_sheet([[]]), '空白');
  const payroll = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(payroll, XLSX.utils.aoa_to_sheet([
    ['序号', '姓名', '身份证号', '手机号码', '邮箱', '应发工资'],
    [1, '合成员工甲', '110101199001011234', '13800000000', 'synthetic-a@invalid.example', 1234.5],
    [2, '合成员工乙', '110101199001011235', '13900000000', 'synthetic-b@invalid.example', 0],
  ]), '工资');
  const sources = [
    { relativePath: '2026年10账期/总账.xlsx', workbook: ledger, bookType: 'xlsx' },
    { relativePath: '2026年09账期/工资表.xls', workbook: payroll, bookType: 'biff8' },
    { relativePath: '2026年10账期/会计报表.xlsx', workbook: ledger, bookType: 'xlsx' },
    { relativePath: '2026年10账期/未知合成资料.xlsx', workbook: ledger, bookType: 'xlsx' },
  ].map(({ relativePath, workbook, bookType }) => {
    const bytes = XLSX.write(workbook, { type: 'buffer', bookType });
    const absolutePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(absolutePath, bytes, { mode: 0o600 });
    return { relativePath, fileName: path.basename(relativePath), absolutePath, bytes };
  });
  return sources;
}

/**
 * 职责：只对空的临时数据库应用已提交迁移，不生成Prisma client或db push。
 * @param {string} database 私有合成SQLite路径
 * @returns {void}
 */
function applyMigrations(database) {
  const migrations = path.resolve(__dirname, '../../prisma/migrations');
  const ddl = fs.readdirSync(migrations).sort().filter(name => fs.statSync(path.join(migrations, name)).isDirectory())
    .map(name => fs.readFileSync(path.join(migrations, name, 'migration.sql'), 'utf8')).join('\n');
  execFileSync('python3', ['-c', 'import sqlite3,sys,os; os.umask(0o077); c=sqlite3.connect(sys.argv[1]); c.executescript(sys.stdin.read()); c.close()', database], { input: ddl, timeout: 30000 });
  fs.chmodSync(database, 0o600);
}

/**
 * 职责：执行原有资料库CLI入口，返回脱敏聚合输出。
 * @param {string} directory 合成根目录
 * @param {boolean} confirm 是否明确确认本地合成资料入库
 * @returns {string} CLI输出；不输出原行、文件名或哈希
 */
function runImport(directory, confirm = false) {
  return execFileSync(process.execPath, [path.resolve(__dirname, '../../scripts/import-financial-evidence.js'), path.join(directory, 'sources'), ...(confirm ? ['--confirm'] : [])], {
    env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, TZ: 'UTC', NODE_ENV: 'test', DATABASE_URL: `file:${path.join(directory, 'synthetic.db')}`, UPLOAD_DIR: path.join(directory, 'uploads'), JWT_SECRET: 'test-only-financial-library-never-production' },
    encoding: 'utf8', timeout: 30000,
  });
}

/**
 * 职责：通过独立只读SQLite连接回查全部持久化字段及时间戳。
 * @param {string} directory 私有合成目录
 * @returns {object} 按表名组织的全部数据库行
 */
function readDatabase(directory) {
  return JSON.parse(execFileSync('python3', ['-c', `import sqlite3,sys,json
c=sqlite3.connect('file:'+sys.argv[1]+'?mode=ro',uri=True)
c.row_factory=sqlite3.Row
tables=[row[0] for row in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
print(json.dumps({table:[dict(row) for row in c.execute('SELECT * FROM "'+table+'" ORDER BY rowid')] for table in tables}))
c.close()`, path.join(directory, 'synthetic.db')], { encoding: 'utf8', timeout: 10000 }));
}

module.exports = { createSources, applyMigrations, runImport, readDatabase };
