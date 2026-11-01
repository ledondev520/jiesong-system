// Weighted E2E sharding (BL-4-FIX): Playwright's --shard splits by file count, which left one
// shard 1.84x slower than another. Prints the spec files of shard <i> of <n>, one per line.
// Weights = seconds per spec from CI run 41274550136 (mobile.spec.ts 132s split into per-viewport files, ~35s each + 19s rest, measured in CI run 41279254648); specs not listed get DEFAULT_WEIGHT.
// shortcut: weights are hand-copied, refresh them when a shard drifts past ~1.3x the fastest.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WEIGHT = 5;
const WEIGHTS = {
  "mobile-320.spec.ts": 35, "mobile-390.spec.ts": 35, "mobile-430.spec.ts": 35,
  "mobile.spec.ts": 19, "button-coverage.spec.ts": 51, "real-role-lifecycle.spec.ts": 49,
  "real-export-3d.spec.ts": 43, "real-menu-export-documents.spec.ts": 34,
  "real-financial-library.spec.ts": 27, "profile-preference-lifecycle.spec.ts": 19,
  "product-editor.spec.ts": 12, "real-hs-catalog.spec.ts": 12, "real-sales-header.spec.ts": 11,
  "smoke.spec.ts": 8, "real-receipt-pool.spec.ts": 7, "contract-attachment-auth.spec.ts": 7,
  "tax-navigation.spec.ts": 7, "supplier-editor.spec.ts": 6,
};

function shardFiles(files, index, count) {
  const bins = Array.from({ length: count }, () => ({ load: 0, files: [] }));
  const byWeight = [...files].sort((a, b) => (WEIGHTS[b] ?? DEFAULT_WEIGHT) - (WEIGHTS[a] ?? DEFAULT_WEIGHT) || a.localeCompare(b));
  for (const f of byWeight) {
    const bin = bins.reduce((m, b) => (b.load < m.load ? b : m));
    bin.load += WEIGHTS[f] ?? DEFAULT_WEIGHT;
    bin.files.push(f);
  }
  return bins[index - 1].files.sort();
}

module.exports = { shardFiles, WEIGHTS, DEFAULT_WEIGHT };

if (require.main === module) {
  const [index, count] = process.argv.slice(2).map(Number);
  if (!Number.isInteger(index) || !Number.isInteger(count) || index < 1 || index > count) {
    console.error("usage: e2e-shard-files.cjs <index> <count>");
    process.exit(2);
  }
  const dir = path.join(__dirname, "..", "frontend", "e2e");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));
  for (const f of shardFiles(files, index, count)) console.log(`e2e/${f}`);
}
