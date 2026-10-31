/** Drift guard: committed migrations must produce exactly the schema.prisma datamodel.
 * Runs `prisma migrate diff` against a throwaway shadow database in a private temp directory.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('prisma migrations match schema.prisma (no drift)', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'schema-drift-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'diff', '--from-migrations', 'prisma/migrations',
      '--to-schema-datamodel', 'prisma/schema.prisma',
      '--shadow-database-url', `file:${path.join(directory, 'shadow.db')}`, '--exit-code'],
    // Explicit env: no .env is needed for a diff against a file shadow database.
    { cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 120000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: `file:${path.join(directory, 'unused.db')}` } },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, `schema drift:\n${result.stdout}\n${result.stderr}`);
});
