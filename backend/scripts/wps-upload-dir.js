/**
 * Input: 启动环境 UPLOAD_DIR、backend/.env 中的 UPLOAD_DIR（仅在启动环境未设置时读取；.env 权限总是先检查）
 * Output: WPS 附件导入脚本使用的上传根目录绝对路径，以及已存在附件子目录的校验
 * Pos: scripts/import_wps_*_files.js、import_wps_202607_update.js、audit_wps_*_file_retention.js、recover_wps_purchase_orphan_files.js、repair_wps_cg2500013_purchase_contract.js 的共享路径解析；与 backend/src/config/index.js 的
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
 * 职责：与 config/index.js 一致，在读取任何键之前检查 backend/.env 权限（<= 0600）
 * 思路：无论 UPLOAD_DIR 是否已由启动环境提供都检查；严格模式下权限过宽直接失败，否则告警；文件不存在返回 false
 */
function assertEnvFilePermissions(envPath, env) {
  let stats;
  try {
    stats = fs.statSync(envPath);
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw new Error(`[wps-import] 无法读取 .env: ${error.message}`);
  }
  const mode = stats.mode & 0o777;
  if ((mode & ~0o600 & 0o777) !== 0) {
    const message = `[wps-import] .env 权限过宽 (当前: ${mode.toString(8)}, 建议 <= 600), 文件: ${envPath}`;
    if (isStrictPermissionMode(env)) throw new Error(message);
    console.warn(message);
  }
  return true;
}

/**
 * 职责：解析后端实际使用的上传根目录
 * 思路：先检查 backend/.env 权限；启动环境优先（dotenv 不覆盖已存在的键），否则读 backend/.env（不展开变量），最后回退 './uploads'；
 *       相对路径按后端工作目录 backend/ 解析。调用方须在加载 Prisma 之前调用，避免 Prisma 自动注入/展开的 .env 值被当作启动环境
 */
function resolveWpsUploadRoot({ backendDir, env = process.env } = {}) {
  if (!backendDir) throw new Error('[wps-import] 缺少 backendDir');
  const envPath = path.join(backendDir, '.env');
  const envFileExists = assertEnvFilePermissions(envPath, env);
  // 与后端 dotenv.config 相同：不展开变量、不覆盖启动环境已有的键；只取 UPLOAD_DIR，不写入 process.env、不打印取值
  let configured;
  if (Object.prototype.hasOwnProperty.call(env, 'UPLOAD_DIR')) configured = env.UPLOAD_DIR;
  else if (envFileExists) configured = dotenv.parse(fs.readFileSync(envPath)).UPLOAD_DIR;
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
