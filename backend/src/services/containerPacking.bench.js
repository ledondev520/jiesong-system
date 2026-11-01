/**
 * Input: 确定性种子基准（1000 种互不相同箱规）
 * Output: 全部箱装下（correctness）+ 宽松耗时上限；CI 环境放宽，避免共享 runner 抖动
 * Pos: 排柜性能回归（opt-in：npm run test:bench，不在 npm test / test:all 内）；300 行用例与确定性仍在 containerPacking.bench.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLoadingPlan } = require('./shipmentReadinessService');
const { packContainers } = require('./containerPacking');
const { getContainerSpec, loadContainerConfig } = require('./containerSpecs');
const { makeBenchContract, makeOrderLines } = require('./containerPackingBench');

const CI_FACTOR = process.env.CI ? 2 : 1;
const timed = (contract) => {
  const started = process.hrtime.bigint();
  const { plan } = buildLoadingPlan(contract);
  return { plan, ms: Number(process.hrtime.bigint() - started) / 1e6 };
};
const placedOf = (plan) => plan.containers.reduce((sum, container) => sum + container.cartons, 0);

for (const maxQty of [2, 3]) {
  test(`1000 种箱规（每行最多 ${maxQty} 箱）：全部装下，不触发 compute-budget`, (t) => {
    const { plan, ms } = timed(makeBenchContract(1000, { maxQty }));
    t.diagnostic(JSON.stringify({ case: `1000:${maxQty}`, ms: Math.round(ms), placed: placedOf(plan), containers: plan.containers.length }));
    assert.equal(placedOf(plan), plan.totals.cartons);
    assert.deepEqual(plan.unplaced, []);
    assert.ok(ms < 4000 * CI_FACTOR, `took ${ms} ms`);
  });
}

const spec = getContainerSpec();
const config = loadContainerConfig();
const CASES = [
  { name: '1000×2 over', lines: () => makeOrderLines(1000, 2), limitMs: 4000 },
  { name: '1000×2 fit', lines: () => makeOrderLines(1000, 2, { fitCbm: 46 }), limitMs: 6000 },
];
for (const { name, lines, limitMs } of CASES) {
  test(`${name}：全部箱装下且不触发 compute-budget`, (t) => {
    const input = lines();
    const total = input.reduce((sum, line) => sum + line.cartons, 0);
    const cpu0 = process.cpuUsage();
    const started = process.hrtime.bigint();
    const result = packContainers(input, spec, config);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const cpu = process.cpuUsage(cpu0);
    t.diagnostic(JSON.stringify({ case: name, ms: Math.round(ms), cpuMs: Math.round((cpu.user + cpu.system) / 1000), containers: result.containers.length }));
    assert.equal(result.containers.reduce((sum, c) => sum + c.cartons, 0), total);
    assert.deepEqual(result.unplaced, []);
    assert.ok(ms < limitMs * CI_FACTOR, `took ${ms} ms`);
  });
}
