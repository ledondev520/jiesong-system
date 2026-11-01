/**
 * Input: 确定性种子基准（300 / 1000 种互不相同箱规）
 * Output: 全部箱装下（correctness）+ 宽松耗时上限；CI 环境放宽，避免共享 runner 抖动
 * Pos: 排柜性能回归；数值基线与对比见 handoff/CONTAINER-PERF-*.md，本地跑 scripts/bench-container-packing.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildLoadingPlan } = require('./shipmentReadinessService');
const { packContainers } = require('./containerPacking');
const { getContainerSpec, loadContainerConfig } = require('./containerSpecs');
const { makeBenchContract, makeOrderLines } = require('./containerPackingBench');

const LIMIT_MS = process.env.CI ? 30000 : 10000;
const CI_FACTOR = process.env.CI ? 2 : 1;
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

test('300 种箱规、1327 箱：全部装下（2 柜），不再耗尽预算', () => {
  const { plan, ms } = timed(makeBenchContract(300, { maxQty: 8 }));
  assert.equal(placedOf(plan), plan.totals.cartons);
  assert.deepEqual(plan.unplaced, []);
  assert.ok(ms < LIMIT_MS, `took ${ms} ms`);
});

for (const maxQty of [2, 3]) {
  test(`1000 种箱规（每行最多 ${maxQty} 箱）：全部装下，不触发 compute-budget`, (t) => {
    const { plan, ms } = timed(makeBenchContract(1000, { maxQty }));
    t.diagnostic(JSON.stringify({ case: `1000:${maxQty}`, ms: Math.round(ms), placed: placedOf(plan), containers: plan.containers.length }));
    assert.equal(placedOf(plan), plan.totals.cartons);
    assert.deepEqual(plan.unplaced, []);
    assert.ok(ms < 4000 * CI_FACTOR, `took ${ms} ms`);
  });
}

// 直接对 packContainers：随机大箱（多柜）与缩放到约 46 CBM（单柜量级）两类，行数越多越考验候选剪枝。
const spec = getContainerSpec();
const config = loadContainerConfig();
const CASES = [
  { name: '300×2 over', lines: () => makeOrderLines(300, 2), limitMs: 1500 },
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

test('300×2 fit：同输入两次结果完全相同（确定性）', () => {
  const run = () => JSON.stringify(packContainers(makeOrderLines(300, 2, { fitCbm: 46 }), spec, config));
  assert.equal(run(), run());
});
