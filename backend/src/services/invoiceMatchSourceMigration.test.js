const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// INVMATCH-5: backfill rules of 20261101030000_invoice_match_source, run on a throwaway in-memory SQLite via python3.
test('迁移回填：仅 MATCHED 且分数<100 为 AUTO；100/空分数为 MANUAL；未关联行保持 NULL', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../prisma/migrations/20261101030000_invoice_match_source/migration.sql'), 'utf8');
  const script = `
import sqlite3, sys, json
c = sqlite3.connect(':memory:')
c.execute('CREATE TABLE invoice_records (id TEXT, matchStatus TEXT, matchScore REAL)')
rows = [('auto','MATCHED',82),('edge','MATCHED',99.9),('full','MATCHED',100),('nullscore','MATCHED',None),('pending','PENDING',None),('ignored','IGNORED',None)]
c.executemany('INSERT INTO invoice_records VALUES (?,?,?)', rows)
c.executescript(sys.stdin.read())
print(json.dumps(dict(c.execute('SELECT id, matchSource FROM invoice_records'))))`;
  const result = spawnSync('python3', ['-c', script], { input: sql, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { auto: 'AUTO', edge: 'AUTO', full: 'MANUAL', nullscore: 'MANUAL', pending: null, ignored: null });
});
