/** Input: --backup and new --database path; Output: checksum/integrity-verified private restore. */
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync('python3', [path.join(__dirname, 'sqlite_snapshot.py'), 'restore', ...process.argv.slice(2)], { stdio: 'inherit' });
if (result.error) console.error('[db-restore] Python 3 with sqlite3 is required.');
process.exitCode = result.status ?? 1;
