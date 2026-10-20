/**
 * Input: 显式测试上传目录 API_PERF_UPLOAD_DIR（必须是一次性压测后端自己的 UPLOAD_DIR）、需保护的真实上传目录
 * Output: 经校验的测试上传目录真实路径；仅限该目录内普通文件的清理
 * Pos: scripts/audit_api_write_success_times.js 的文件清理边界；不回退 backend/.env 或默认 backend/uploads 作为清理目录
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const { resolveWpsUploadRoot } = require('./wps-upload-dir');

const realOrResolved = (target) => {
  const resolved = path.resolve(target);
  try {
    return fs.realpathSync(resolved);
  } catch (error) {
    if (error.code === 'ENOENT') return resolved;
    throw error;
  }
};

const isWithin = (root, target) => {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
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
 * 思路：必须由 API_PERF_UPLOAD_DIR 显式给出绝对路径、已存在且为目录；其真实路径与任何受保护目录相同或互相包含时拒绝
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
  return realRoot;
}

/**
 * 职责：删除压测上传的残留文件，仅限测试上传目录内
 * 思路：相对路径按测试目录解析且不得以 .. 逃逸；绝对路径与相对路径一样，最终以“父目录真实路径位于测试目录真实路径内”为准（拒绝符号链接逃逸）；
 *       只删除普通文件（不跟随符号链接）；文件不存在时与原行为一致直接返回
 */
function removeUploadedFileWithin(uploadRoot, filePath) {
  if (!filePath) return;
  const realRoot = fs.realpathSync(uploadRoot);
  const refuse = () => new Error(`Refusing to remove file outside API_PERF_UPLOAD_DIR: ${filePath}`);
  if (!path.isAbsolute(filePath) && !isWithin(realRoot, path.resolve(realRoot, filePath))) throw refuse();
  const candidate = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(realRoot, filePath);
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
  fs.unlinkSync(path.join(realParent, path.basename(candidate)));
}

module.exports = { resolvePerfUploadDir, removeUploadedFileWithin, protectedUploadDirs };
