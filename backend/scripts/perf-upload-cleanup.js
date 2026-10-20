/**
 * Input: 显式测试上传目录 API_PERF_UPLOAD_DIR（必须是一次性压测后端自己的 UPLOAD_DIR）、需保护的真实上传目录
 * Output: 经校验的测试上传目录（真实路径 + dev/ino 身份）；仅限该目录内普通文件的清理
 * Pos: scripts/audit_api_write_success_times.js 的文件清理边界；不回退 backend/.env 或默认 backend/uploads 作为清理目录
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const { resolveWpsUploadRoot } = require('./wps-upload-dir');

/**
 * 职责：取路径的规范真实位置；末级不存在时解析最近的已存在祖先的真实路径再拼接剩余部分（避免符号链接祖先绕过重叠比对）；
 *       路径上存在悬空符号链接时抛错（fail-closed）
 */
const realOrResolved = (target) => {
  const resolved = path.resolve(target);
  const missing = [];
  let current = resolved;
  for (;;) {
    try {
      return path.join(fs.realpathSync(current), ...missing);
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
      // 悬空符号链接：条目存在但目标不可解析。其最终指向无法确定，按 fail-closed 拒绝，不能当作缺失的普通组件跳过
      let entry = null;
      try {
        entry = fs.lstatSync(current);
      } catch (lstatError) {
        if (lstatError.code !== 'ENOENT' && lstatError.code !== 'ENOTDIR') throw lstatError;
      }
      if (entry && entry.isSymbolicLink()) {
        throw new Error(`Refusing to run write audit: protected upload path contains an unresolvable symlink: ${current}`);
      }
      const parent = path.dirname(current);
      if (parent === current) return resolved;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
};

const isWithin = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const overlaps = (a, b) => a === b || isWithin(a, b) || isWithin(b, a);

/**
 * 职责：列出清理目录绝不能与之重叠的真实/默认上传目录
 * 思路：仓库默认 backend/uploads（按脚本位置与按调用方 cwd 两种旧口径）、backend/.env 或默认配置的 UPLOAD_DIR（仅用于拒绝，不作为清理目录）、
 *       启动环境中的 UPLOAD_DIR（避免把真实 UPLOAD_DIR 误当测试目录）
 */
function protectedUploadDirs({ repoRoot, cwd = process.cwd(), env = process.env }) {
  const backendDir = path.join(repoRoot, 'backend');
  const configured = resolveWpsUploadRoot({
    backendDir,
    env: { NODE_ENV: env.NODE_ENV, SECURITY_STRICT_CONFIG_PERMS: env.SECURITY_STRICT_CONFIG_PERMS },
  });
  const dirs = [
    path.join(backendDir, 'uploads'),
    path.resolve(cwd, 'backend/uploads'),
    configured,
  ];
  if (env.UPLOAD_DIR) dirs.push(path.resolve(backendDir, env.UPLOAD_DIR));
  return [...new Set(dirs.map(realOrResolved))];
}

/**
 * 职责：解析并校验显式测试上传目录
 * 思路：必须由 API_PERF_UPLOAD_DIR 显式给出绝对路径、已存在且为目录；其真实路径与任何受保护目录相同或互相包含时拒绝。
 *       返回冻结的 { root, dev, ino }，清理时据此确认根目录未被替换
 */
function resolvePerfUploadDir({ repoRoot, cwd = process.cwd(), env = process.env }) {
  const configured = env.API_PERF_UPLOAD_DIR;
  if (!configured || !path.isAbsolute(configured)) {
    throw new Error('Refusing to run write audit: API_PERF_UPLOAD_DIR must be the absolute UPLOAD_DIR of the disposable backend.');
  }
  let stats;
  try {
    stats = fs.statSync(configured);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Refusing to run write audit: API_PERF_UPLOAD_DIR is not an existing directory: ${configured}`);
  }
  const realRoot = fs.realpathSync(configured);
  for (const protectedDir of protectedUploadDirs({ repoRoot, cwd, env })) {
    if (overlaps(realRoot, protectedDir)) {
      throw new Error(`Refusing to run write audit: API_PERF_UPLOAD_DIR overlaps protected upload directory ${protectedDir}`);
    }
  }
  const rootStats = fs.statSync(realRoot);
  return Object.freeze({ root: realRoot, dev: rootStats.dev, ino: rootStats.ino });
}

/**
 * 职责：确认已校验的测试根目录仍是同一个目录（真实路径未漂移、dev/ino 未变）
 */
function assertSameRoot(validated) {
  if (!validated || typeof validated.root !== 'string') {
    throw new Error('Refusing to remove uploaded file: API_PERF_UPLOAD_DIR was not validated.');
  }
  let current;
  let stats;
  try {
    current = fs.realpathSync(validated.root);
    stats = fs.statSync(current);
  } catch (error) {
    throw new Error(`Refusing to remove uploaded file: validated API_PERF_UPLOAD_DIR is no longer accessible (${error.code || error.message})`);
  }
  if (current !== validated.root || !stats.isDirectory() || stats.dev !== validated.dev || stats.ino !== validated.ino) {
    throw new Error('Refusing to remove uploaded file: API_PERF_UPLOAD_DIR was replaced after validation.');
  }
}

/**
 * 职责：删除压测上传的残留文件，仅限已校验的测试上传目录内
 * 思路：
 *   1. 根目录身份复核（真实路径与 dev/ino 均与启动校验时一致）
 *   2. 相对与绝对路径统一 resolve 后必须严格位于测试根真实路径内（词法包含检查）
 *   3. 父目录真实路径仍须位于测试根内（拒绝中间层符号链接逃逸）；只删除普通文件，不跟随符号链接；
 *      删除前按真实父目录路径再次 lstat 并比对 dev/ino
 *   4. 文件不存在时与原行为一致直接返回
 * 残余风险：Node 无基于目录句柄的 unlinkat，路径检查与 unlink 是多次独立系统调用，竞态无法完全消除（窗口长度无保证，进程可能在检查后被调度暂停）。
 *   能改写测试根、其祖先或根内任一中间子目录的本地参与者都可能在检查后把路径转向根外；
 *   前提是整个删除路径上的相关目录只由可信本地操作者管理（一次性测试环境）
 */
function removeUploadedFileWithin(validated, filePath) {
  if (!filePath) return;
  if (typeof filePath !== 'string') throw new TypeError('Refusing to remove uploaded file: filePath must be a string.');
  assertSameRoot(validated);
  const realRoot = validated.root;
  const refuse = () => new Error(`Refusing to remove file outside API_PERF_UPLOAD_DIR: ${filePath}`);
  const candidate = path.resolve(realRoot, filePath);
  if (!isWithin(realRoot, candidate)) throw refuse();
  let stats;
  try {
    stats = fs.lstatSync(candidate);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return;
    throw error;
  }
  const realParent = fs.realpathSync(path.dirname(candidate));
  if (realParent !== realRoot && !isWithin(realRoot, realParent)) throw refuse();
  if (!stats.isFile()) {
    throw new Error(`Refusing to remove non-regular file in API_PERF_UPLOAD_DIR: ${filePath}`);
  }
  const target = path.join(realParent, path.basename(candidate));
  const targetStats = fs.lstatSync(target);
  if (!targetStats.isFile() || targetStats.dev !== stats.dev || targetStats.ino !== stats.ino) {
    throw new Error(`Refusing to remove file that changed during cleanup: ${filePath}`);
  }
  fs.unlinkSync(target);
}

module.exports = { resolvePerfUploadDir, removeUploadedFileWithin, protectedUploadDirs };
