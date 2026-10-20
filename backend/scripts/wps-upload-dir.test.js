/**
 * Input: 临时目录中的合成 backend/.env 与上传目录（不含真实数据或密钥）
 * Output: WPS 附件导入脚本上传根目录解析与目录存在性校验的契约测试
 * Pos: backend/scripts/wps-upload-dir.js 的单元测试；同时校验脚本写入的相对 filePath 经后端 getFullPath 解析回同一文件
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { resolveWpsUploadRoot, assertUploadSubdir } = require('./wps-upload-dir');

function makeBackendDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wps-upload-dir-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeEnv(dir, content, mode = 0o600) {
  const envPath = path.join(dir, '.env');
  fs.writeFileSync(envPath, content);
  fs.chmodSync(envPath, mode);
}

test('resolveWpsUploadRoot: 环境变量 UPLOAD_DIR 优先，绝对路径原样使用', (t) => {
  const backendDir = makeBackendDir(t);
  writeEnv(backendDir, 'UPLOAD_DIR=/from/env-file\n');
  assert.equal(resolveWpsUploadRoot({ backendDir, env: { UPLOAD_DIR: '/srv/app/uploads' } }), '/srv/app/uploads');
});

test('resolveWpsUploadRoot: 相对 UPLOAD_DIR 按 backend 目录解析，而非调用方工作目录', (t) => {
  const backendDir = makeBackendDir(t);
  assert.equal(resolveWpsUploadRoot({ backendDir, env: { UPLOAD_DIR: './files' } }), path.join(backendDir, 'files'));
});

test('resolveWpsUploadRoot: 环境变量未设置时读取 backend/.env 的 UPLOAD_DIR', (t) => {
  const backendDir = makeBackendDir(t);
  writeEnv(backendDir, 'OTHER=x\nUPLOAD_DIR=/opt/example/current/backend/uploads\n');
  assert.equal(resolveWpsUploadRoot({ backendDir, env: {} }), '/opt/example/current/backend/uploads');
});

test('resolveWpsUploadRoot: 未配置时回退后端默认 ./uploads；空字符串环境变量同后端一样回退默认', (t) => {
  const backendDir = makeBackendDir(t);
  assert.equal(resolveWpsUploadRoot({ backendDir, env: {} }), path.join(backendDir, 'uploads'));
  writeEnv(backendDir, 'UPLOAD_DIR=/from/env-file\n');
  assert.equal(resolveWpsUploadRoot({ backendDir, env: { UPLOAD_DIR: '' } }), path.join(backendDir, 'uploads'));
});

test('resolveWpsUploadRoot: 严格模式下 .env 权限过宽直接失败', (t) => {
  const backendDir = makeBackendDir(t);
  writeEnv(backendDir, 'UPLOAD_DIR=/from/env-file\n', 0o644);
  assert.throws(
    () => resolveWpsUploadRoot({ backendDir, env: { NODE_ENV: 'production' } }),
    /\.env 权限过宽/
  );
});

test('resolveWpsUploadRoot: 启动环境已设置 UPLOAD_DIR 时仍检查 .env 权限（同后端 config）', (t) => {
  const backendDir = makeBackendDir(t);
  writeEnv(backendDir, 'UPLOAD_DIR=/from/env-file\n', 0o644);
  assert.throws(
    () => resolveWpsUploadRoot({ backendDir, env: { NODE_ENV: 'production', UPLOAD_DIR: '/srv/app/uploads' } }),
    /\.env 权限过宽/
  );
});

test('resolveWpsUploadRoot: 与后端 dotenv.config 一样不展开 .env 中的变量引用', (t) => {
  const backendDir = makeBackendDir(t);
  writeEnv(backendDir, 'UPLOAD_DIR=${WPS_TEST_BASE}/uploads\n');
  assert.equal(
    resolveWpsUploadRoot({ backendDir, env: { WPS_TEST_BASE: '/srv/synthetic' } }),
    path.join(backendDir, '${WPS_TEST_BASE}', 'uploads')
  );
});

test('导入脚本在加载 Prisma 之前解析上传目录（避免 Prisma 注入/展开的 .env 值被当作启动环境）', () => {
  const repoRoot = path.join(__dirname, '..', '..');
  for (const script of ['import_wps_export_files.js', 'import_wps_purchase_files.js', 'import_wps_202607_update.js']) {
    const source = fs.readFileSync(path.join(repoRoot, 'scripts', script), 'utf8');
    const resolveIndex = source.indexOf('resolveWpsUploadRoot({ backendDir: backendPath })');
    const prismaIndex = source.indexOf("node_modules/@prisma/client'");
    assert.notEqual(resolveIndex, -1, `${script} 未调用 resolveWpsUploadRoot`);
    assert.notEqual(prismaIndex, -1, `${script} 未加载 Prisma`);
    assert.ok(resolveIndex < prismaIndex, `${script} 必须在 require Prisma 之前解析上传目录`);
    assert.equal(source.includes("path.join(backendPath, 'uploads"), false, `${script} 仍硬编码 backend/uploads`);
  }
});

test('assertUploadSubdir: 子目录不存在或不是目录时直接失败，存在时返回绝对路径', (t) => {
  const uploadRoot = makeBackendDir(t);
  assert.throws(() => assertUploadSubdir(uploadRoot, 'contracts'), /附件目录不存在或不是目录/);
  fs.writeFileSync(path.join(uploadRoot, 'sales-contracts'), 'not a dir');
  assert.throws(() => assertUploadSubdir(uploadRoot, 'sales-contracts'), /附件目录不存在或不是目录/);
  fs.mkdirSync(path.join(uploadRoot, 'contracts'));
  assert.equal(assertUploadSubdir(uploadRoot, 'contracts'), path.join(uploadRoot, 'contracts'));
  assert.equal(fs.existsSync(path.join(uploadRoot, 'missing')), false);
});

test('脚本写入的相对 filePath 经后端 getFullPath 解析到脚本复制的同一位置', (t) => {
  const backendDir = makeBackendDir(t);
  const configuredRoot = path.join(backendDir, 'shared-uploads');
  fs.mkdirSync(configuredRoot);
  const originalUploadDir = process.env.UPLOAD_DIR;
  process.env.UPLOAD_DIR = configuredRoot;
  t.after(() => {
    if (originalUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = originalUploadDir;
  });
  const { getFullPath } = require('../src/utils/upload');
  const scriptRoot = resolveWpsUploadRoot({ backendDir: path.join(backendDir, 'other-checkout'), env: process.env });
  assert.equal(scriptRoot, configuredRoot);
  for (const filePath of [
    path.join('contracts', 'WPS-CG2600001-0123456789ab.pdf'),
    path.join('sales-contracts', 'WPS-EXP260008-0123456789ab.pdf'),
  ]) {
    assert.equal(path.isAbsolute(filePath), false);
    assert.equal(path.resolve(getFullPath(filePath)), path.join(scriptRoot, filePath));
  }
});
