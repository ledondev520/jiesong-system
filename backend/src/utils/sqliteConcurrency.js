/**
 * Input: Prisma client + DATABASE_URL; Output: SQLite switched to WAL journal mode.
 * Pos: startup helper for the multi-process (PM2 cluster) deployment.
 *
 * journal_mode=WAL is stored in the database file, so one startup call is enough;
 * it needs no extra per-connection state. The 5000ms busy wait is already Prisma's
 * SQLite default (socket_timeout, verified: PRAGMA busy_timeout = 5000 and a write
 * waits out a competing lock), so it is deliberately NOT re-set here. Do not add
 * socket_timeout to DATABASE_URL without revisiting this.
 * Failure is non-fatal: the database simply stays in its current journal mode.
 */

const isSqliteUrl = (url) => typeof url === 'string' && url.startsWith('file:');

const ensureWalJournal = async (prisma, databaseUrl = process.env.DATABASE_URL) => {
  if (!isSqliteUrl(databaseUrl)) return null;
  try {
    const [row] = await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
    return String(row?.journal_mode ?? '').toLowerCase() || null;
  } catch (error) {
    console.warn(`SQLite WAL 模式未启用（保持原日志模式）：${error.code || error.name}`);
    return null;
  }
};

module.exports = { ensureWalJournal };
