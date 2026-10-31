#!/usr/bin/env node
/**
 * Input: 旧结构 pricing.json（mode/refundableMarkup/noRefundMarkup/multiplier）、--spot-rate、--file
 * Output: 新结构 pricing.json（exchangeRate/exchangeAdjustment/defaultMarkup/categoryMarkups/roundUpTo）
 * Pos: 运行时 pricing.json 的一次性迁移（部署保留服务器文件，合并不会转换它）。默认 dry-run，只打印结果；
 *      --confirm 需同时给 --backup-dir：先备份(0700 目录/0600 文件)，再原子替换，最后用后端同一校验器核对。
 *  取整步长默认取仓库 config/pricing.json 的 roundUpTo（负责人终版 5），不另定规则。
 * 不读取 .env 和数据库；分类加价（如瓷砖 10%）需转换后由 ADMIN 在 设置 > 报价规则 中添加。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { validatePricingConfig } = require('../src/services/pricingConfigService');

const NEW_KEYS = ['exchangeRate', 'exchangeAdjustment', 'defaultMarkup', 'categoryMarkups', 'roundUpTo'];

/**
 * 取整步长的唯一默认值 = 仓库提交的 config/pricing.json（负责人锁定为 5）。
 * 服务器上的运行时文件是旧结构，所以读 git HEAD 里提交的版本；读不到时必须显式给 --round-up-to。
 */
const repoRoundUpTo = () => {
  try {
    const committed = execFileSync('git', ['show', 'HEAD:config/pricing.json'], {
      cwd: path.resolve(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return validatePricingConfig(JSON.parse(committed)).roundUpTo;
  } catch {
    throw new Error('读不到仓库提交的 config/pricing.json 默认值，请显式传 --round-up-to <整数>（锁定规则为 5）');
  }
};

/** 纯函数：旧结构 → 新结构；已是新结构返回 null；缺现汇或结构不明时抛错 */
const convertPricingConfig = (old, spotRate, roundUpTo = repoRoundUpTo()) => {
  if (!old || typeof old !== 'object' || Array.isArray(old)) throw new Error('配置必须是 JSON 对象');
  if (NEW_KEYS.every((key) => Object.hasOwn(old, key))) return null;
  const oldKeys = ['mode', 'exchangeAdjustment', 'refundableMarkup', 'noRefundMarkup', 'multiplier'];
  if (!oldKeys.every((key) => Object.hasOwn(old, key))) throw new Error('不是已知的旧结构，拒绝转换');
  const defaultMarkup = old.mode === 'multiplier'
    ? Math.round((old.multiplier - 1) * 1e10) / 1e10
    : old.refundableMarkup;
  return validatePricingConfig({
    exchangeRate: spotRate, exchangeAdjustment: old.exchangeAdjustment, defaultMarkup, categoryMarkups: [], roundUpTo,
  });
};

const parseArgs = (argv) => {
  const args = { confirm: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--confirm') args.confirm = true;
    else if (key === '--dry-run') args.confirm = false;
    else if (['--file', '--spot-rate', '--backup-dir', '--round-up-to'].includes(key)) args[key.slice(2)] = argv[(i += 1)];
    else throw new Error(`未知参数 ${key}`);
  }
  return args;
};

const main = (argv) => {
  const args = parseArgs(argv);
  if (!args.file) throw new Error('必须用 --file 指定要转换的 pricing.json');
  const spotRate = Number(args['spot-rate']);
  if (!Number.isFinite(spotRate)) throw new Error('必须用 --spot-rate 给出当前现汇（数字）');
  const file = path.resolve(args.file);
  const contents = fs.readFileSync(file);
  const roundUpTo = args['round-up-to'] === undefined ? undefined : Number(args['round-up-to']);
  const converted = convertPricingConfig(JSON.parse(contents.toString('utf8')), spotRate, roundUpTo);
  if (converted === null) return console.log('已是新结构，无需转换');
  const output = `${JSON.stringify(converted, null, 2)}\n`;
  if (!args.confirm) {
    console.log(`dry-run：${file} 将替换为\n${output}（未写入；确认请加 --confirm --backup-dir <目录>）`);
    return undefined;
  }
  if (!args['backup-dir']) throw new Error('--confirm 必须同时给 --backup-dir');
  const backupDir = path.resolve(args['backup-dir']);
  fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(backupDir, 0o700);
  const backup = path.join(backupDir, `pricing.${crypto.createHash('sha256').update(contents).digest('hex').slice(0, 12)}.json`);
  fs.writeFileSync(backup, contents, { flag: 'wx', mode: 0o600 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, output, { flag: 'wx', mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  validatePricingConfig(JSON.parse(fs.readFileSync(file, 'utf8')));
  return console.log(`已转换 ${file}；备份：${backup}（回滚：把备份复制回原路径并重启后端旧版本）`);
};

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(`转换失败：${error.message}`); process.exit(1); }
}

module.exports = { convertPricingConfig };
