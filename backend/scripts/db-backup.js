/**
 * Input: prisma/dev.db 数据库文件
 * Output: prisma/backups/<timestamp>.db 备份文件
 * Pos: 数据库安全防护脚本
 *
 * 职责：在 Prisma 迁移/推送之前自动备份 SQLite 数据库文件。
 *       保留最近 10 个备份，自动清理更早的备份。
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.resolve(__dirname, '..', 'prisma', 'dev.db');
const BACKUP_DIR = path.resolve(__dirname, '..', 'prisma', 'backups');
const MAX_BACKUPS = 5;

/**
 * 职责：创建数据库备份并清理旧备份
 * 思路：
 *  0. 检查数据库文件是否存在
 *  1. 创建 backups 目录
 *  2. 以时间戳命名复制数据库文件
 *  3. 清理超出保留数量的旧备份
 */
function backup() {
  // 0. 检查数据库文件是否存在
  if (!fs.existsSync(DB_PATH)) {
    console.log('[db-backup] 数据库文件不存在，跳过备份:', DB_PATH);
    return;
  }

  // 1. 创建 backups 目录
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  // 2. 以时间戳命名复制数据库文件
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const backupFile = path.join(BACKUP_DIR, `dev_${timestamp}.db`);

  fs.copyFileSync(DB_PATH, backupFile);
  const sizeKB = Math.round(fs.statSync(backupFile).size / 1024);
  console.log(`[db-backup] 已备份 -> ${path.relative(process.cwd(), backupFile)} (${sizeKB} KB)`);

  // 3. 清理超出保留数量的旧备份
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('dev_') && f.endsWith('.db'))
    .sort()
    .reverse();

  if (backups.length > MAX_BACKUPS) {
    const toDelete = backups.slice(MAX_BACKUPS);
    for (const old of toDelete) {
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      console.log(`[db-backup] 已清理旧备份: ${old}`);
    }
  }
}

backup();
