/**
 * Input: 完整 Git 历史、PR base/head SHA 与前端锁定的 Prettier
 * Output: PR 改动的 TS/TSX 源码格式结果，历史/文件错误不能当作无改动
 * Pos: PR Review 格式门禁，使用 NUL 路径及参数数组支持特殊文件名
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');

const ROOT = path.resolve(__dirname, '..');
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * 获取 PR 的源码路径；删除项不检查，重命名按目标新文件检查。
 * @param {string} root 仓库根目录
 * @param {string} base PR base 的完整 SHA
 * @param {string} head PR head 的完整 SHA
 * @returns {string[]} 保留特殊字符的相对源码路径
 * @throws 缺失引用、浅历史或 Git 比较失败
 */
function changedSourceFiles(root, base, head) {
  if (![base, head].every((sha) => /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(sha || ''))) {
    throw new Error('PR_BASE_SHA and PR_HEAD_SHA must be full commit SHAs');
  }
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('PR formatting requires full Git history; use checkout fetch-depth: 0');
  }
  // 禁用重命名合并：移动到 src 的文件也会以新增目标进入检查。
  return git(root, ['diff', '--name-only', '--no-renames', '--diff-filter=ACMT', '-z', `${base}...${head}`, '--', 'frontend/src/'])
    .split('\0')
    .filter((file) => file.startsWith('frontend/src/') && (file.endsWith('.ts') || file.endsWith('.tsx')));
}

/**
 * 检查完整目标文件，使用前端锁定的 formatter，保留读文件/解析异常。
 * @param {object} options 仓库、PR SHA 与可选测试 formatter
 * @returns {Promise<{files: string[], unformatted: string[]}>} 检查文件及失败清单
 * @throws 历史不完整、非普通文件或解析/读取失败
 */
async function checkFormatting({ root = ROOT, base, head, prettier }) {
  const files = changedSourceFiles(root, base, head);
  const formatter = prettier || createRequire(path.join(ROOT, 'frontend/package.json'))('prettier');
  const unformatted = [];
  for (const file of files) {
    const absolute = path.join(root, file);
    if (!fs.lstatSync(absolute).isFile()) throw new Error(`Source must be a regular file: ${JSON.stringify(file)}`);
    const config = await formatter.resolveConfig(absolute, { editorconfig: true });
    if (!await formatter.check(fs.readFileSync(absolute, 'utf8'), { ...config, filepath: absolute })) {
      unformatted.push(file);
    }
  }
  return { files, unformatted };
}

if (require.main === module) {
  checkFormatting({ base: process.env.PR_BASE_SHA, head: process.env.PR_HEAD_SHA })
    .then(({ files, unformatted }) => {
      console.log(`Checked ${files.length} changed frontend source file(s).`);
      for (const file of unformatted) console.error(`Formatting required: ${JSON.stringify(file)}`);
      if (unformatted.length) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { changedSourceFiles, checkFormatting };
