/**
 * Input: 完整 Git 历史与 PR base/head SHA（环境变量 PR_BASE_SHA / PR_HEAD_SHA）
 * Output: UI-only 判定（docs/redesign/UX-REDESIGN-2026.md §14.1）；`ui-only` 模式不通过则退出 1，`backend-gate` 模式输出 backend_changed=true|false
 * Pos: 轻量 UI PR 流程的 CI 门禁；标签只会"增加"检查，不会放宽任何必过检查
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const FULL_SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

// 允许前缀（§14.1 第一组）；`frontend/src/lib/format` 是前缀，覆盖 format*.ts 与 format*/ 目录。
const ALLOW_PREFIXES = [
  'frontend/src/app/',
  'frontend/src/components/',
  'frontend/src/lib/format',
  'frontend/e2e/',
  'frontend/public/',
  'docs/redesign/',
];

// 拒绝项优先于允许项（§14.1 第二组）；比较前统一小写，防止大小写别名绕过。
const DENY_PREFIXES = [
  'frontend/src/lib/auth-session',
  'frontend/src/lib/api-base-url',
  'frontend/src/lib/axios',
  'frontend/src/services/',
  'backend/', 'config/', 'scripts/', 'lifecycle/', '.github/',
];
const DENY_BASENAME = /^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|next\.config\.[^/]*|(?:middleware|proxy)\.[cm]?[jt]sx?)$/;

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/**
 * 判断单个仓库相对路径是否可出现在 UI-only PR 中。
 * @param {string} file git 输出的相对路径
 * @returns {boolean} 在允许范围内且不命中拒绝项
 */
function isUiOnlyPath(file) {
  const lower = file.toLowerCase();
  if (file.includes('\\') || file.split('/').some((part) => part === '..' || part === '.' || part === '')) return false;
  const base = lower.slice(lower.lastIndexOf('/') + 1);
  if (DENY_BASENAME.test(base) || lower.endsWith('.prisma') || lower.split('/').includes('prisma')) return false;
  if (DENY_PREFIXES.some((prefix) => lower.startsWith(prefix))) return false;
  return file === 'DESIGN.md' || ALLOW_PREFIXES.some((prefix) => file.startsWith(prefix));
}

/**
 * 空改动按失败处理：没有证据证明这是 UI-only。
 * @param {string[]} files 改动路径
 * @returns {{ok: boolean, offending: string[]}} 判定及越界路径
 */
function classify(files) {
  const offending = files.filter((file) => !isUiOnlyPath(file));
  return { ok: files.length > 0 && offending.length === 0, offending };
}

/**
 * 读取 PR 全部改动路径；禁用重命名合并，新旧路径都参与判定，删除也计入。
 * @throws SHA 非完整、浅历史或 Git 比较失败
 */
function changedFiles(root, base, head) {
  if (![base, head].every((sha) => FULL_SHA.test(sha || ''))) throw new Error('PR_BASE_SHA and PR_HEAD_SHA must be full commit SHAs');
  if (git(root, ['rev-parse', '--is-shallow-repository']).trim() === 'true') throw new Error('UI-only check requires full Git history; use checkout fetch-depth: 0');
  return git(root, ['diff', '--name-only', '--no-renames', '-z', `${base}...${head}`, '--']).split('\0').filter(Boolean);
}

/** backend-gate：只有证明 UI-only 才返回 false；任何错误、非 PR 事件均视为有后端改动（fail-safe，宁可多跑测试）。 */
function backendChanged(root, base, head) {
  try {
    return !classify(changedFiles(root, base, head)).ok;
  } catch {
    return true;
  }
}

function main(mode, env = process.env) {
  const { PR_BASE_SHA: base, PR_HEAD_SHA: head } = env;
  if (mode === 'backend-gate') {
    const line = `backend_changed=${backendChanged(ROOT, base, head)}`;
    console.log(line);
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `${line}\n`);
    return 0;
  }
  if (mode !== 'ui-only') {
    console.error('Usage: check-ui-only.cjs ui-only|backend-gate');
    return 2;
  }
  try {
    const files = changedFiles(ROOT, base, head);
    const { ok, offending } = classify(files);
    if (ok) {
      console.log(`UI-only OK: ${files.length} changed path(s) are inside the allowlist.`);
      return 0;
    }
    if (!files.length) console.error('No changed paths: cannot verify a UI-only PR.');
    for (const file of offending) console.error(`Not allowed in a UI-only PR: ${JSON.stringify(file)}`);
    console.error('Remove the `ui-only` label and use the full PR process, or move these changes to another PR.');
  } catch (error) {
    console.error(error.message);
  }
  return 1;
}

if (require.main === module) process.exitCode = main(process.argv[2]);

module.exports = { isUiOnlyPath, classify, changedFiles, backendChanged, main };
