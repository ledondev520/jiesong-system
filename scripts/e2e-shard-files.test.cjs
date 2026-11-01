const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { shardFiles, WEIGHTS, DEFAULT_WEIGHT } = require("./e2e-shard-files.cjs");

const dir = path.join(__dirname, "..", "frontend", "e2e");
const N = 5;
const shards = Array.from({ length: N }, (_, i) => i + 1);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));

test("every spec runs in exactly one of the 5 shards", () => {
  const all = shards.flatMap((i) => shardFiles(files, i, N));
  assert.deepStrictEqual([...all].sort(), [...files].sort());
});

test("shard output is deterministic", () => {
  assert.deepStrictEqual(shardFiles(files, 2, N), shardFiles([...files].reverse(), 2, N));
});

test("5 shards stay within 1.15x by weight", () => {
  const loads = shards.map((i) => shardFiles(files, i, N).reduce((a, f) => a + (WEIGHTS[f] ?? DEFAULT_WEIGHT), 0));
  assert.ok(Math.max(...loads) / Math.min(...loads) <= 1.15, loads.join("/"));
});
