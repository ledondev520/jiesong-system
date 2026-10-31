/**
 * Input: 临时合成 Git 仓库与 scripts/check-ui-only.cjs
 * Output: §14.1 允许/拒绝清单、重命名、浅历史和 backend-gate fail-safe 回归
 * Pos: CI 工具测试；不读写业务数据，不更改全局 Git 配置
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { isUiOnlyPath, classify, changedFiles, backendChanged } = require('./check-ui-only.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jiesong-ui-only-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const write = (file, content = 'x\n') => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  const commit = () => {
    git('add', '--all');
    git('-c', 'user.name=Synthetic CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'Synthetic only');
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  write('README.md');
  return { root, git, write, commit, base: commit() };
}

test('allowlist: UI paths pass', () => {
  for (const file of [
    'frontend/src/app/dashboard/page.tsx', 'frontend/src/app/globals.css', 'frontend/src/components/ui/button.tsx',
    'frontend/src/lib/format.ts', 'frontend/src/lib/format-money.ts', 'frontend/e2e/home.spec.ts',
    'frontend/public/logo.svg', 'docs/redesign/UX-REDESIGN-2026.md', 'DESIGN.md',
  ]) assert.equal(isUiOnlyPath(file), true, file);
});

test('denylist wins inside the allowlist and everything else is rejected', () => {
  for (const file of [
    'frontend/src/lib/auth-session.ts', 'frontend/src/lib/api-base-url.ts', 'frontend/src/lib/axios.ts',
    'frontend/src/services/api.ts', 'frontend/middleware.ts', 'frontend/src/app/proxy.ts', 'frontend/src/app/middleware.ts',
    'frontend/next.config.ts', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/src/app/package.json',
    'frontend/src/components/Package.json', 'package-lock.json',
    'backend/src/app.js', 'config/pricing.json', 'scripts/check-ui-only.cjs', 'lifecycle/resources.json', '.github/workflows/ci.yml',
    'backend/prisma/schema.prisma', 'frontend/src/app/prisma/x.tsx', 'frontend/src/app/x.prisma',
    'AGENTS.md', 'docs/operations/x.md', 'docs/redesign-evil/x.md', 'design.md', 'frontend/src/lib/utils.ts',
    'frontend/src/app/../services/x.ts', 'frontend/src/app\\x.tsx', '',
  ]) assert.equal(isUiOnlyPath(file), false, JSON.stringify(file));
});

test('classify: empty diff is not UI-only and offenders are listed', () => {
  assert.deepEqual(classify([]), { ok: false, offending: [] });
  assert.deepEqual(classify(['frontend/src/app/a.tsx', 'backend/x.js']), { ok: false, offending: ['backend/x.js'] });
  assert.equal(classify(['frontend/src/app/a.tsx']).ok, true);
});

test('changedFiles: renames count both paths, deletions count, special names survive', (t) => {
  const f = fixture(t);
  f.write('frontend/src/app/a.tsx');
  f.write('backend/old.js');
  const base = f.commit();
  fs.renameSync(path.join(f.root, 'backend/old.js'), path.join(f.root, 'frontend/src/app/moved.tsx'));
  f.write('frontend/src/app/new\nline.tsx');
  const head = f.commit();
  assert.deepEqual(changedFiles(f.root, base, head).sort(), ['backend/old.js', 'frontend/src/app/moved.tsx', 'frontend/src/app/new\nline.tsx']);
  assert.equal(classify(changedFiles(f.root, base, head)).ok, false);
});

test('backendChanged: false only when the whole diff is UI-only; every error is true', (t) => {
  const f = fixture(t);
  f.write('frontend/src/app/a.tsx');
  const ui = f.commit();
  assert.equal(backendChanged(f.root, f.base, ui), false);
  f.write('backend/src/x.js');
  const mixed = f.commit();
  assert.equal(backendChanged(f.root, f.base, mixed), true);
  assert.equal(backendChanged(f.root, undefined, undefined), true); // push event: no PR SHAs
  assert.equal(backendChanged(f.root, 'abc', 'def'), true);
  assert.equal(backendChanged(f.root, '0'.repeat(40), ui), true); // missing ref
  assert.equal(backendChanged(f.root, ui, ui), true); // empty diff
});

test('shallow history is rejected', (t) => {
  const f = fixture(t);
  f.write('frontend/src/app/a.tsx');
  const head = f.commit();
  const shallow = path.join(f.root, '..', path.basename(f.root) + '-shallow');
  t.after(() => fs.rmSync(shallow, { recursive: true, force: true }));
  execFileSync('git', ['clone', '-q', '--depth', '1', `file://${f.root}`, shallow], { stdio: 'ignore' });
  assert.throws(() => changedFiles(shallow, f.base, head), /full Git history/);
  assert.equal(backendChanged(shallow, f.base, head), true);
});

test('CLI exit codes and GITHUB_OUTPUT', (t) => {
  const f = fixture(t);
  f.write('frontend/src/app/a.tsx');
  const head = f.commit();
  const out = path.join(f.root, 'gh-output');
  const script = path.join(__dirname, 'check-ui-only.cjs');
  // CLI always inspects the real repo; with unknown SHAs the gate is fail-safe and ui-only fails.
  const env = { ...process.env, PR_BASE_SHA: head, PR_HEAD_SHA: head, GITHUB_OUTPUT: out };
  const gate = require('node:child_process').spawnSync('node', [script, 'backend-gate'], { env, encoding: 'utf8' });
  assert.equal(gate.status, 0);
  assert.match(fs.readFileSync(out, 'utf8'), /^backend_changed=true\n$/);
  assert.equal(require('node:child_process').spawnSync('node', [script, 'ui-only'], { env, encoding: 'utf8' }).status, 1);
  assert.equal(require('node:child_process').spawnSync('node', [script, 'bogus'], { env, encoding: 'utf8' }).status, 2);
});
