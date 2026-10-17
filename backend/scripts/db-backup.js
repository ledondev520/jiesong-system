/**
 * Input: explicit --database path or process DATABASE_URL (SQLite only)
 * Output: consistent private snapshot and manifest, retaining five managed pairs
 * Pos: pre-migration backup CLI; does not load .env or guess a source database
 */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const args = process.argv.slice(2);
if (!args.includes('--help')) {
  if (!args.includes('--database')) {
    const url = process.env.DATABASE_URL || '';
    if (!url.startsWith('file:') || !url.slice(5).split('?')[0]) {
      console.error('[db-backup] Set a SQLite DATABASE_URL in the process environment or pass --database explicitly.');
      process.exit(1);
    }
    const source = decodeURIComponent(url.slice(5).split('?')[0]);
    args.push('--database', path.resolve(__dirname, '../prisma', source));
  }
  if (!args.includes('--backup-dir')) args.push('--backup-dir', path.resolve(__dirname, '../prisma/backups'));
}
const result = spawnSync('python3', [path.join(__dirname, 'sqlite_snapshot.py'), 'backup', ...args], { stdio: 'inherit' });
if (result.error) console.error('[db-backup] Python 3 with sqlite3 is required.');
process.exitCode = result.status ?? 1;
