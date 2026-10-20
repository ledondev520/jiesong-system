/**
 * Input: 临时目录中合成的仓库结构、上传目录、.env 与文件（不含真实数据或密钥）
 * Output: 压测脚本测试上传目录校验与清理边界的契约测试
 * Pos: backend/scripts/perf-upload-cleanup.js 的单元测试
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolvePerfUploadDir, removeUploadedFileWithin } = require('./perf-upload-cleanup');

function sandbox(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-upload-cleanup-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const repoRoot = path.join(dir, 'repo');
  const defaultUploads = path.join(repoRoot, 'backend', 'uploads');
  const testUploads = path.join(dir, 'disposable-uploads');
  fs.mkdirSync(defaultUploads, { recursive: true });
  fs.mkdirSync(testUploads);
  return { dir, repoRoot, defaultUploads, testUploads, cwd: repoRoot };
}

const resolveWith = (box, env) => resolvePerfUploadDir({ repoRoot: box.repoRoot, cwd: box.cwd, env });
const validatedRoot = (box) => resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads });

test('resolvePerfUploadDir: 必须显式提供存在的绝对目录，不回退 backend/.env 或默认目录', (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.repoRoot, 'backend', '.env'), `UPLOAD_DIR=${box.testUploads}\n`, { mode: 0o600 });
  assert.throws(() => resolveWith(box, {}), /API_PERF_UPLOAD_DIR must be the absolute UPLOAD_DIR/);
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: '' }), /API_PERF_UPLOAD_DIR must be the absolute UPLOAD_DIR/);
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: 'disposable-uploads' }), /API_PERF_UPLOAD_DIR must be the absolute UPLOAD_DIR/);
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: path.join(box.dir, 'missing') }), /not an existing directory/);
  const filePath = path.join(box.dir, 'plain-file');
  fs.writeFileSync(filePath, 'x');
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: filePath }), /not an existing directory/);
});

test('resolvePerfUploadDir: 与默认 backend/uploads 真实路径相同、经符号链接指向或互相包含时拒绝', (t) => {
  const box = sandbox(t);
  const link = path.join(box.dir, 'link-to-default');
  fs.symlinkSync(box.defaultUploads, link);
  const nested = path.join(box.defaultUploads, 'contracts');
  fs.mkdirSync(nested);
  for (const candidate of [box.defaultUploads, link, nested, path.join(box.repoRoot, 'backend'), box.dir]) {
    assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: candidate }), /overlaps protected upload directory/, candidate);
  }
});

test('resolvePerfUploadDir: 与按调用方 cwd 解析的旧默认 backend/uploads 重叠时拒绝', (t) => {
  const box = sandbox(t);
  const otherCwd = path.join(box.dir, 'other-checkout');
  fs.mkdirSync(path.join(otherCwd, 'backend', 'uploads'), { recursive: true });
  assert.throws(
    () => resolvePerfUploadDir({ repoRoot: box.repoRoot, cwd: otherCwd, env: { API_PERF_UPLOAD_DIR: path.join(otherCwd, 'backend', 'uploads') } }),
    /overlaps protected upload directory/
  );
});

test('resolvePerfUploadDir: 与 backend/.env 或启动环境配置的真实 UPLOAD_DIR 相同时拒绝', (t) => {
  const box = sandbox(t);
  const realUploads = path.join(box.dir, 'real-uploads');
  fs.mkdirSync(realUploads);
  fs.writeFileSync(path.join(box.repoRoot, 'backend', '.env'), `UPLOAD_DIR=${realUploads}\n`, { mode: 0o600 });
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: realUploads }), /overlaps protected upload directory/);

  const launchUploads = path.join(box.dir, 'launch-uploads');
  fs.mkdirSync(launchUploads);
  assert.throws(
    () => resolveWith(box, { API_PERF_UPLOAD_DIR: launchUploads, UPLOAD_DIR: launchUploads }),
    /overlaps protected upload directory/
  );
});

test('resolvePerfUploadDir: 独立测试目录返回其真实路径', (t) => {
  const box = sandbox(t);
  const link = path.join(box.dir, 'link-to-test');
  fs.symlinkSync(box.testUploads, link);
  const rootStats = fs.statSync(box.testUploads);
  const expected = { root: box.testUploads, dev: rootStats.dev, ino: rootStats.ino };
  assert.deepEqual({ ...resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads }) }, expected);
  assert.deepEqual({ ...resolveWith(box, { API_PERF_UPLOAD_DIR: link }) }, expected);
  assert.equal(Object.isFrozen(resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads })), true);
});

test('removeUploadedFileWithin: 删除测试目录内的相对/绝对普通文件，文件不存在时静默返回', (t) => {
  const box = sandbox(t);
  fs.mkdirSync(path.join(box.testUploads, '2026-10'));
  const relative = path.join('2026-10', 'perf-a.pdf');
  fs.writeFileSync(path.join(box.testUploads, relative), 'a');
  removeUploadedFileWithin(validatedRoot(box), relative);
  assert.equal(fs.existsSync(path.join(box.testUploads, relative)), false);

  const absolute = path.join(box.testUploads, '2026-10', 'perf-b.pdf');
  fs.writeFileSync(absolute, 'b');
  removeUploadedFileWithin(validatedRoot(box), absolute);
  assert.equal(fs.existsSync(absolute), false);

  removeUploadedFileWithin(validatedRoot(box), path.join('2026-10', 'missing.pdf'));
  removeUploadedFileWithin(validatedRoot(box), '');
  removeUploadedFileWithin(validatedRoot(box), null);
});

test('removeUploadedFileWithin: 拒绝测试目录外的相对穿越与绝对路径，外部文件保持不变', (t) => {
  const box = sandbox(t);
  const outside = path.join(box.defaultUploads, 'real.pdf');
  fs.writeFileSync(outside, 'real');
  const traversal = path.relative(box.testUploads, outside);
  assert.ok(traversal.startsWith('..'));
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), traversal), /outside API_PERF_UPLOAD_DIR/);
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), outside), /outside API_PERF_UPLOAD_DIR/);
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), '.'), /outside API_PERF_UPLOAD_DIR/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'real');
});

test('removeUploadedFileWithin: 拒绝经符号链接目录逃逸、符号链接文件与目录，目标保持不变', (t) => {
  const box = sandbox(t);
  const outside = path.join(box.defaultUploads, 'real.pdf');
  fs.writeFileSync(outside, 'real');
  fs.symlinkSync(box.defaultUploads, path.join(box.testUploads, 'escape'));
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), path.join('escape', 'real.pdf')), /outside API_PERF_UPLOAD_DIR/);
  fs.symlinkSync(outside, path.join(box.testUploads, 'link.pdf'));
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), 'link.pdf'), /non-regular file/);
  fs.mkdirSync(path.join(box.testUploads, 'subdir'));
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), 'subdir'), /non-regular file/);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'real');
  assert.equal(fs.existsSync(path.join(box.testUploads, 'link.pdf')), true);
  assert.equal(fs.existsSync(path.join(box.testUploads, 'subdir')), true);
});

test('removeUploadedFileWithin: 未校验的根或非字符串 filePath 拒绝', (t) => {
  const box = sandbox(t);
  fs.writeFileSync(path.join(box.testUploads, 'a.pdf'), 'a');
  assert.throws(() => removeUploadedFileWithin(box.testUploads, 'a.pdf'), /was not validated/);
  assert.throws(() => removeUploadedFileWithin(null, 'a.pdf'), /was not validated/);
  assert.throws(() => removeUploadedFileWithin(validatedRoot(box), ['a.pdf']), /filePath must be a string/);
  assert.equal(fs.existsSync(path.join(box.testUploads, 'a.pdf')), true);
});

test('removeUploadedFileWithin: 校验后根目录被替换为指向受保护目录的符号链接或新目录时拒绝', (t) => {
  const box = sandbox(t);
  const validated = validatedRoot(box);
  const victim = path.join(box.defaultUploads, 'victim.pdf');
  fs.writeFileSync(victim, 'real');
  fs.renameSync(box.testUploads, `${box.testUploads}-original`);
  fs.symlinkSync(box.defaultUploads, box.testUploads);
  assert.throws(() => removeUploadedFileWithin(validated, 'victim.pdf'), /replaced after validation/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'real');

  fs.unlinkSync(box.testUploads);
  fs.mkdirSync(box.testUploads);
  fs.writeFileSync(path.join(box.testUploads, 'new.pdf'), 'n');
  assert.throws(() => removeUploadedFileWithin(validated, 'new.pdf'), /replaced after validation/);
  assert.equal(fs.existsSync(path.join(box.testUploads, 'new.pdf')), true);
});

test('resolvePerfUploadDir: 尚不存在的受保护目录经符号链接祖先位于测试目录内时拒绝', (t) => {
  const box = sandbox(t);
  const alias = path.join(box.dir, 'protected-alias');
  fs.symlinkSync(box.testUploads, alias);
  const future = path.join(alias, 'future-real-uploads');
  fs.writeFileSync(path.join(box.repoRoot, 'backend', '.env'), `UPLOAD_DIR=${future}\n`, { mode: 0o600 });
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads }), /overlaps protected upload directory/);
});

test('resolvePerfUploadDir: 受保护目录路径上有悬空符号链接（默认目录、.env、启动环境三种来源）时拒绝', (t) => {
  const box = sandbox(t);
  const future = path.join(box.testUploads, 'future');
  fs.rmSync(box.defaultUploads, { recursive: true });
  fs.symlinkSync(future, box.defaultUploads);
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads }), /unresolvable symlink/);
  fs.unlinkSync(box.defaultUploads);
  fs.mkdirSync(box.defaultUploads);

  const envLink = path.join(box.dir, 'env-link');
  fs.symlinkSync(path.join(box.testUploads, 'future-env'), envLink);
  fs.writeFileSync(path.join(box.repoRoot, 'backend', '.env'), `UPLOAD_DIR=${path.join(envLink, 'uploads')}\n`, { mode: 0o600 });
  assert.throws(() => resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads }), /unresolvable symlink/);
  fs.rmSync(path.join(box.repoRoot, 'backend', '.env'));

  const launchLink = path.join(box.dir, 'launch-link');
  fs.symlinkSync(path.join(box.testUploads, 'future-launch'), launchLink);
  assert.throws(
    () => resolveWith(box, { API_PERF_UPLOAD_DIR: box.testUploads, UPLOAD_DIR: launchLink }),
    /unresolvable symlink/
  );
  assert.equal(fs.existsSync(future), false);
});

test('removeUploadedFileWithin: 经外部符号链接别名给出的绝对路径不在测试根内，拒绝且文件保持不变', (t) => {
  const box = sandbox(t);
  const validated = validatedRoot(box);
  const alias = path.join(box.dir, 'outside-alias');
  fs.symlinkSync(box.testUploads, alias);
  const victim = path.join(box.testUploads, 'victim.pdf');
  fs.writeFileSync(victim, 'v');
  assert.throws(() => removeUploadedFileWithin(validated, path.join(alias, 'victim.pdf')), /outside API_PERF_UPLOAD_DIR/);
  assert.throws(() => removeUploadedFileWithin(validated, path.join(box.dir, 'missing-outside.pdf')), /outside API_PERF_UPLOAD_DIR/);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'v');
});

test('removeUploadedFileWithin: 以 .. 开头的合法文件夹名不被误判为越界', (t) => {
  const box = sandbox(t);
  const validated = validatedRoot(box);
  fs.mkdirSync(path.join(box.testUploads, '..valid'));
  const relative = path.join('..valid', 'perf.pdf');
  fs.writeFileSync(path.join(box.testUploads, relative), 'x');
  removeUploadedFileWithin(validated, relative);
  assert.equal(fs.existsSync(path.join(box.testUploads, relative)), false);
  const absolute = path.join(box.testUploads, '..valid', 'perf-abs.pdf');
  fs.writeFileSync(absolute, 'y');
  removeUploadedFileWithin(validated, absolute);
  assert.equal(fs.existsSync(absolute), false);
});

test('压测脚本不再硬编码 backend/uploads，并在发出任何请求前校验测试上传目录', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', 'scripts', 'audit_api_write_success_times.js'), 'utf8');
  assert.equal(source.includes("'backend/uploads'"), false);
  assert.equal(source.includes('fs.unlinkSync'), false);
  const guardStart = source.indexOf('const requireDisposableTarget = () => {');
  const guardEnd = source.indexOf('\n};', guardStart);
  assert.notEqual(guardStart, -1);
  assert.ok(source.slice(guardStart, guardEnd).includes('perfUploadDir = resolvePerfUploadDir({ repoRoot: ROOT });'));
  const mainStart = source.indexOf('const main = async () => {');
  assert.ok(source.indexOf('requireDisposableTarget();', mainStart) < source.indexOf('await getToken()', mainStart));
});
