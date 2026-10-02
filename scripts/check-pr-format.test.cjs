/**
 * Input: 临时合成 Git 仓库、锁定 Prettier 与 PR Review 摘要脚本
 * Output: 路径、历史和失败状态的真实回归结果
 * Pos: CI 工具测试；不读写业务数据，不更改全局 Git 配置
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { changedSourceFiles, checkFormatting } = require('./check-pr-format.cjs');
const prettier = createRequire(path.resolve(__dirname, '../frontend/package.json'))('prettier');

/** @param {object} t Node 测试上下文；@returns {object} 自动清理的合成 Git 仓库工具。 */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-format-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content = 'export const value = 1;\n') => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = () => {
    git('add', '--all');
    git('-c', 'user.name=Synthetic CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'Synthetic only');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  return { root, git, write, commit };
}

test('PR format: added/modified/renamed paths survive spaces and newlines; deletions and other paths are excluded', (t) => {
  const f = fixture(t);
  f.write('frontend/src/old.ts');
  f.write('frontend/src/deleted.ts');
  f.write('frontend/src/changed.ts');
  const base = f.commit();
  fs.renameSync(path.join(f.root, 'frontend/src/old.ts'), path.join(f.root, 'frontend/src/renamed with space.ts'));
  fs.unlinkSync(path.join(f.root, 'frontend/src/deleted.ts'));
  f.write('frontend/src/changed.ts', 'export const value = 2;\n');
  f.write('frontend/src/new\nline.tsx');
  f.write('frontend/e2e/outside.ts');
  f.write('frontend/src/outside.js');
  const head = f.commit();
  assert.deepEqual(changedSourceFiles(f.root, base, head).sort(), [
    'frontend/src/changed.ts', 'frontend/src/new\nline.tsx', 'frontend/src/renamed with space.ts',
  ].sort());
});

test('PR format: moving a previously existing outside file into src is checked', (t) => {
  const f = fixture(t);
  f.write('frontend/other.ts');
  const base = f.commit();
  fs.mkdirSync(path.join(f.root, 'frontend/src'));
  fs.renameSync(path.join(f.root, 'frontend/other.ts'), path.join(f.root, 'frontend/src/moved.ts'));
  assert.deepEqual(changedSourceFiles(f.root, base, f.commit()), ['frontend/src/moved.ts']);
});

test('PR format: real locked formatter rejects bad changed source and accepts formatted source', async (t) => {
  const f = fixture(t);
  f.write('README.md', 'Synthetic repository');
  const base = f.commit();
  f.write('frontend/src/bad file.ts', 'export const bad=1\n');
  f.write('frontend/src/good.ts');
  const result = await checkFormatting({ root: f.root, base, head: f.commit(), prettier });
  assert.equal(result.files.length, 2);
  assert.deepEqual(result.unformatted, ['frontend/src/bad file.ts']);
});

test('PR format: missing/invalid/unavailable commit references fail rather than returning an empty list', (t) => {
  const f = fixture(t);
  f.write('README.md');
  const head = f.commit();
  assert.throws(() => changedSourceFiles(f.root, undefined, head), /full commit SHAs/);
  assert.throws(() => changedSourceFiles(f.root, '--invalid', head), /full commit SHAs/);
  assert.throws(() => changedSourceFiles(f.root, '0'.repeat(40), head));
});

test('PR format: shallow checkout is explicitly rejected', (t) => {
  const f = fixture(t);
  f.write('README.md');
  f.commit();
  f.write('frontend/src/changed.ts');
  const head = f.commit();
  const shallow = path.join(f.root, 'shallow');
  execFileSync('git', ['clone', '--depth=1', `file://${f.root}`, shallow], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.throws(() => changedSourceFiles(shallow, head, head), /full Git history/);
});

for (const lintResult of ['success', 'failure', 'cancelled']) {
  test(`PR summary: ${lintResult} stays visible and keeps its failure status`, (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-summary-test-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const summary = path.join(root, 'summary.md');
    const workflow = fs.readFileSync(path.resolve(__dirname, '../.github/workflows/pr-review.yml'), 'utf8');
    const body = workflow.match(/node <<'NODE'\n([\s\S]*?)\n          NODE/)[1].replace(/^          /gm, '');
    const result = spawnSync(process.execPath, [], {
      input: body,
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary, TYPE_CHECK_RESULT: 'success', LINT_RESULT: lintResult },
      encoding: 'utf8',
    });
    assert.equal(result.status, lintResult === 'success' ? 0 : 1, result.stderr);
    assert.match(fs.readFileSync(summary, 'utf8'), new RegExp(`格式检查 \\(${lintResult}\\)`));
  });
}
