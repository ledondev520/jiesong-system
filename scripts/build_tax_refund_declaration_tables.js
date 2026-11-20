#!/usr/bin/env node
/**
 * Input: 已人工核验的 cases.json、申报年月/批次/购方税号；可选 overrides.json（分摊指定）、used.json（历史正式占用台账）、--as-of、--out-dir
 * Output: 受限目录下的进货/出口明细申报表（官方版式 xlsx）、plan.json、核对结果.md；控制台只输出条数摘要与目录路径
 * Pos: 出口退税两表生成 CLI Adapter；复用 backend/src/services/taxRefundDeclarationTableService，
 *      不读 .env、不连数据库、不联网、不触达税局，输出只是核对/填写稿，不代表已录入或正式申报
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const backendPath = path.join(repoRoot, 'backend');
const {
  buildDeclarationPlan,
  writeDeclarationFiles,
} = require(path.join(backendPath, 'src/services/taxRefundDeclarationTableService'));

const MAX_INPUT_BYTES = 50 * 1024 * 1024; // 输入 JSON 上限，防止误传超大文件
const DEFAULT_OUT_ROOT = path.join(repoRoot, 'tmp', 'tax-refund-declaration-tables');
const VALUE_OPTIONS = new Set(['cases', 'period', 'batch', 'buyer-tax-id', 'as-of', 'overrides', 'used', 'out-dir']);

/** 职责：返回命令帮助文本。 */
function usage() {
  return `
用法:
  npm --prefix backend run refund:tables -- [参数]
  node scripts/build_tax_refund_declaration_tables.js [参数]

必填参数:
  --cases <json>          已人工核验的归并结果 cases.json
  --period <YYYYMM>       申报年月（保持你选定的月份，未来月只提示、不会自动改）
  --batch <NNN>           申报批次（3 位，如 001）
  --buyer-tax-id <税号>   本次企业（购方）税号，须与原票购方识别号一致

可选参数:
  --as-of <YYYY-MM-DD>    核对基准日，默认今天（Asia/Shanghai）；仅用于“未来月份”提示
  --overrides <json>      按完整关联号指定的分摊/数量（须写明 reason），只用于本次草稿
  --used <json>           历史正式占用台账（status=submitted 才扣占用）
  --out-dir <dir>         全新的输出目录，默认 tmp/tax-refund-declaration-tables/<申报年月>-<批次>
  -h, --help              显示帮助

输出（目录权限 0700、文件 0600，已存在的目录拒绝覆盖）:
  外贸企业出口退税进货明细申报表_<年月>-<批次>.xlsx   官方样表版式（Sheet「数据」）
  外贸企业出口退税出口明细申报表_<年月>-<批次>.xlsx   官方样表版式（Sheet「Sheet1」）
  plan.json                                            可录入 entries / 待核 pending / 未列入 excluded / 余额 balances
  核对结果.md                                          条数、金额、待核项与分批余额

说明: 相对路径按执行命令时的目录解析，也支持 ~/ 开头。控制台不打印税号、票号或金额；
      金额汇总在 核对结果.md。本命令只生成核对/填写稿，不代表已录入、自检通过或正式申报。
`;
}

/**
 * 职责：解析命令行参数（仅支持 --key value 形式），遇到未知参数/缺值直接报错。
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{help: boolean, options: Record<string, string>}} help 标志与参数表
 * @throws {Error} 未知参数、缺少参数值
 */
function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '-h' || arg === '--help') return { help: true, options };
    const key = arg.startsWith('--') ? arg.slice(2) : null;
    if (!key || !VALUE_OPTIONS.has(key)) throw new Error(`未知参数：${arg}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数 --${key} 缺少值`);
    options[key] = value;
    index += 1;
  }
  return { help: false, options };
}

/**
 * 职责：把用户给出的路径解析为绝对路径（支持 ~/；相对路径按 npm 调用时的目录解析）。
 * @param {string} value 路径参数
 * @returns {string} 绝对路径
 */
function resolvePath(value) {
  if (!value) throw new Error('路径参数不能为空');
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return path.resolve(process.env.INIT_CWD || process.cwd(), value);
}

/**
 * 职责：读取并解析输入 JSON；错误信息不回显文件内容，避免泄露业务数据。
 * @param {string} file 文件路径
 * @param {string} label 错误信息中的名称
 * @returns {unknown} 解析后的 JSON
 * @throws {Error} 文件不存在/过大/不是合法 JSON
 */
function readJson(file, label) {
  const absolute = resolvePath(file);
  let stat;
  try {
    stat = fs.statSync(absolute);
  } catch {
    throw new Error(`${label}文件不存在或无法读取`);
  }
  if (!stat.isFile() || stat.size > MAX_INPUT_BYTES) throw new Error(`${label}必须是不超过 50MB 的普通文件`);
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch {
    throw new Error(`${label}不是合法的 JSON`);
  }
}

/** 职责：Asia/Shanghai 的今天（YYYY-MM-DD），与系统其他出口单证口径一致。 */
function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/**
 * 职责：执行一次生成——读输入、构建计划、落受限文件，返回仅含计数/路径的摘要。
 * 思路：0. 校验必填参数 → 1. 读 cases/overrides/used → 2. buildDeclarationPlan → 3. writeDeclarationFiles → 4. 汇总摘要。
 * @param {string[]} argv 命令行参数（不含 node 与脚本名）
 * @returns {Promise<{help: true} | {outputDir: string, files: string[], ready: number, pending: number, excluded: number, warnings: string[], formalSubmission: false}>} 摘要
 * @throws {Error} 参数/数据非法、输出目录已存在
 */
async function run(argv) {
  // 0. 参数
  const { help, options } = parseArgs(argv);
  if (help) return { help: true };
  for (const key of ['cases', 'period', 'batch', 'buyer-tax-id']) {
    if (!options[key]) throw new Error(`缺少必填参数 --${key}（--help 查看用法）`);
  }
  // 1. 读输入
  const cases = readJson(options.cases, 'cases');
  const overrides = options.overrides ? readJson(options.overrides, 'overrides') : {};
  const used = options.used ? readJson(options.used, 'used 台账') : [];
  // 2. 构建计划（所有业务校验与错误码在 service 内）
  const plan = buildDeclarationPlan(cases, {
    period: options.period,
    batch: options.batch,
    buyerTaxId: options['buyer-tax-id'],
    asOf: options['as-of'] || todayInShanghai(),
    overrides,
    used,
  });
  // 3. 落文件（受限目录，拒绝覆盖）
  const outDir = options['out-dir']
    ? resolvePath(options['out-dir'])
    : path.join(DEFAULT_OUT_ROOT, `${plan.period}-${plan.batch}`);
  const { outputDir, files } = await writeDeclarationFiles(plan, outDir);
  // 4. 摘要：只含条数与提示码，金额在受限的 核对结果.md
  return {
    outputDir,
    files,
    ready: plan.entries.length,
    pending: plan.pending.length,
    excluded: plan.excluded.length,
    warnings: plan.warnings,
    formalSubmission: false,
  };
}

async function main() {
  const summary = await run(process.argv.slice(2));
  console.log(summary.help ? usage() : JSON.stringify(summary, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[tax-refund-declaration-tables] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, resolvePath, run, usage };
