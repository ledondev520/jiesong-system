const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { shardFiles, WEIGHTS, DEFAULT_WEIGHT } = require("./e2e-shard-files.cjs");

const dir = path.join(__dirname, "..", "frontend", "e2e");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".spec.ts"));

test("every spec runs in exactly one of the 4 shards", () => {
  const all = [1, 2, 3, 4].flatMap((i) => shardFiles(files, i, 4));
  assert.deepStrictEqual([...all].sort(), [...files].sort());
});

test("shard output is deterministic", () => {
  assert.deepStrictEqual(shardFiles(files, 2, 4), shardFiles([...files].reverse(), 2, 4));
});

test("4 shards stay within 1.15x by weight", () => {
  const loads = [1, 2, 3, 4].map((i) => shardFiles(files, i, 4).reduce((a, f) => a + (WEIGHTS[f] ?? DEFAULT_WEIGHT), 0));
  assert.ok(Math.max(...loads) / Math.min(...loads) <= 1.15, loads.join("/"));
});
