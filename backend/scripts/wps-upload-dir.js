/**
 * Input: 运行环境 UPLOAD_DIR、backend/.env 中的 UPLOAD_DIR（仅在环境变量未设置时读取）
 * Output: WPS 附件导入脚本使用的上传根目录绝对路径，以及已存在附件子目录的校验
 * Pos: scripts/import_wps_*_files.js 与 import_wps_202607_update.js 的共享路径解析；与 backend/src/config/index.js 的
 *      `process.env.UPLOAD_DIR || './uploads'` 及后端以 backend/ 为工作目录解析相对路径的规则保持一致
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_UPLOAD_DIR = './uploads';

function isStrictPermissionMode(env) {
  return env.NODE_ENV === 'production' || env.SECURITY_STRICT_CONFIG_PERMS === 'true';
}

/**
 * 职责：在环境变量未提供 UPLOAD_DIR 时，按后端相同来源（backend/.env）读取该键
 * 思路：与 config/index.js 一致，先检查 .env 权限（<= 0600），严格模式下权限过宽直接失败；只返回 UPLOAD_DIR，不写入 process.env、不打印取值
 */
function readUploadDirFromEnvFile(envPath, env) {
  let stats;
  try {
    stats = fs.statSync(envPath);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error(`[wps-import] 无法读取 .env: ${error.message}`);
  }
  const mode = stats.mode & 0o777;
  if ((mode & ~0o600 & 0o777) !== 0) {
    const message = `[wps-import] .env 权限过宽 (当前: ${mode.toString(8)}, 建议 <= 600), 文件: ${envPath}`;
    if (isStrictPermissionMode(env)) throw new Error(message);
    console.warn(message);
  }
  return dotenv.parse(fs.readFileSync(envPath)).UPLOAD_DIR;
}

/**
 * 职责：解析后端实际使用的上传根目录
 * 思路：进程环境优先（dotenv 不覆盖已存在的键），否则读 backend/.env，最后回退 './uploads'；相对路径按后端工作目录 backend/ 解析
 */
function resolveWpsUploadRoot({ backendDir, env = process.env } = {}) {
  if (!backendDir) throw new Error('[wps-import] 缺少 backendDir');
  const configured = Object.prototype.hasOwnProperty.call(env, 'UPLOAD_DIR')
    ? env.UPLOAD_DIR
    : readUploadDirFromEnvFile(path.join(backendDir, '.env'), env);
  return path.resolve(backendDir, configured || DEFAULT_UPLOAD_DIR);
}

/**
 * 职责：确认附件子目录（contracts / sales-contracts）已存在且为目录；不存在时直接失败，不自动创建
 */
function assertUploadSubdir(uploadRoot, subdir) {
  const target = path.join(uploadRoot, subdir);
  let stats;
  try {
    stats = fs.statSync(target);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (!stats || !stats.isDirectory()) {
    throw new Error(
      `[wps-import] 附件目录不存在或不是目录: ${target}（UPLOAD_DIR 解析为 ${uploadRoot}）。` +
      '请确认在后端实际运行的部署目录执行，或显式设置 UPLOAD_DIR 指向后端的上传目录。'
    );
  }
  return target;
}

module.exports = { resolveWpsUploadRoot, assertUploadSubdir, DEFAULT_UPLOAD_DIR };
