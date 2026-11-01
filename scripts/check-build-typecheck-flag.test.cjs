// Guard: E2E_SKIP_BUILD_TYPECHECK (Next typescript.ignoreBuildErrors) may only be set on the Playwright E2E step.
// Deploy workflows/scripts/package scripts must never set it, or a type error could ship.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const FLAG = 'E2E_SKIP_BUILD_TYPECHECK';
const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Everything that could build or start a deployed frontend.
function guardedFiles() {
  const files = ['deploy.sh', 'frontend/package.json', 'backend/package.json', 'package.json'];
  for (const dir of ['.github/workflows', 'scripts']) {
    for (const f of fs.readdirSync(path.join(root, dir))) {
      if (/\.(ya?ml|sh|cjs|js|mjs)$/.test(f)) files.push(`${dir}/${f}`);
    }
  }
  return files.filter(
    (f) => fs.existsSync(path.join(root, f)) && f !== 'scripts/check-build-typecheck-flag.test.cjs' && f !== '.github/workflows/test-and-acceptance.yml'
  );
}

test('flag is absent from deploy workflows, deploy scripts and package scripts', () => {
  const offenders = guardedFiles().filter((f) => read(f).includes(FLAG));
  assert.deepStrictEqual(offenders, []);
});

test('flag appears in test-and-acceptance.yml only on the Playwright acceptance step', () => {
  const lines = read('.github/workflows/test-and-acceptance.yml').split('\n');
  const hits = lines.map((l, i) => [l, i]).filter(([l]) => l.includes(FLAG) && !l.trim().startsWith('#'));
  assert.strictEqual(hits.length, 1);
  let i = hits[0][1];
  while (i >= 0 && !/^\s*- (name|uses):/.test(lines[i])) i--;
  assert.match(lines[i], /Run Playwright acceptance tests/);
});

test('next.config.ts enables ignoreBuildErrors only when the flag is exactly "1"', () => {
  const cfg = read('frontend/next.config.ts');
  assert.match(cfg, new RegExp(`ignoreBuildErrors:\\s*process\\.env\\.${FLAG}\\s*===\\s*'1'`));
  assert.strictEqual((cfg.match(/ignoreBuildErrors/g) || []).length, 1);
});
