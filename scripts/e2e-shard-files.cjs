// Weighted E2E sharding (BL-4-FIX): Playwright's --shard splits by file count, which left one
// shard 1.84x slower than another. Prints the spec files of shard <i> of <n>, one per line.
// Weights = seconds per spec from CI run 41269387437; specs not listed get DEFAULT_WEIGHT.
// shortcut: weights are hand-copied, refresh them when a shard drifts past ~1.3x the fastest.
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_WEIGHT = 5;
const WEIGHTS = {
  "mobile.spec.ts": 129, "button-coverage.spec.ts": 55, "real-export-3d.spec.ts": 44,
  "real-role-lifecycle.spec.ts": 35, "real-menu-export-documents.spec.ts": 27,
  "real-financial-library.spec.ts": 20, "real-sales-header.spec.ts": 17,
  "profile-preference-lifecycle.spec.ts": 14, "product-editor.spec.ts": 12,
  "real-hs-catalog.spec.ts": 12, "smoke.spec.ts": 9,
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

module.exports = { shardFiles };

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
