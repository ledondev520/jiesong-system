/**
 * Input: 确定性种子基准（300 / 1000 种互不相同箱规）
 * Output: 全部箱装下（correctness）+ 宽松耗时上限；CI 环境放宽，避免共享 runner 抖动
 * Pos: 排柜性能回归；数值基线与对比见 handoff/CONTAINER-PERF-*.md，本地跑 scripts/bench-container-packing.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLoadingPlan } = require('./shipmentReadinessService');
const { makeBenchContract } = require('./containerPackingBench');

const LIMIT_MS = process.env.CI ? 30000 : 10000;
const timed = (contract) => {
  const started = process.hrtime.bigint();
  const { plan } = buildLoadingPlan(contract);
  return { plan, ms: Number(process.hrtime.bigint() - started) / 1e6 };
};
const placedOf = (plan) => plan.containers.reduce((sum, container) => sum + container.cartons, 0);

test('300 种箱规、884 箱：全部装入一个 40HQ，未耗尽预算', () => {
  const { plan, ms } = timed(makeBenchContract(300, { maxQty: 5 }));
  assert.equal(placedOf(plan), plan.totals.cartons);
  assert.deepEqual(plan.unplaced, []);
  assert.equal(plan.containers.length, 1);
  assert.ok(ms < LIMIT_MS, `took ${ms} ms`);
});
