/**
 * Input: 确定性基准明细（containerPackingBench）、真实 worker 与注入的故障 worker
 * Output: worker 与进程内结果一致、主事件循环不被占用、超时/崩溃/异常 fail-closed、队列有界
 * Pos: containerPackingPool.js / buildLoadingPlanAsync 的回归测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { packContainers, toCartonLines } = require('./containerPacking');
const { packContainersAsync } = require('./containerPackingPool');
const { buildLoadingPlan, buildLoadingPlanAsync, evaluateShipmentReadinessAsync } = require('./shipmentReadinessService');
const { getContainerSpec, loadContainerConfig } = require('./containerSpecs');
const { makeBenchContract } = require('./containerPackingBench');

const spec = getContainerSpec();
const config = loadContainerConfig();
const linesOf = (sizes, maxQty) => toCartonLines(makeBenchContract(sizes, { maxQty }).packingItems, spec, config);

test('worker 排柜结果与进程内逐字段一致', async () => {
  const lines = linesOf(60, 4);
  assert.deepEqual(await packContainersAsync(lines, spec, config), packContainers(lines, spec, config));
  const contract = makeBenchContract(60, { maxQty: 4 });
  assert.deepEqual((await buildLoadingPlanAsync(contract)).plan, buildLoadingPlan(contract).plan);
});

test('大订单排柜期间主事件循环保持响应', async () => {
  const contract = makeBenchContract(1000, { maxQty: 3 });
  let maxGap = 0;
  let last = Date.now();
  const timer = setInterval(() => { const now = Date.now(); maxGap = Math.max(maxGap, now - last); last = now; }, 10);
  const result = await evaluateShipmentReadinessAsync(contract);
  clearInterval(timer);
  assert.ok(result.plan.containers.length >= 1);
  assert.ok(maxGap < (process.env.CI ? 500 : 250), `event loop blocked for ${maxGap} ms`);
});

test('超时：worker 被终止，reject 503 且不给出计划', async () => {
  await assert.rejects(
    packContainersAsync(linesOf(300, 5), spec, config, { timeoutMs: 1 }),
    (error) => error.statusCode === 503,
  );
});

test('worker 崩溃/抛错：reject 503，不挂起', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-pool-'));
  try {
    const exitFile = path.join(dir, 'exit.js');
    const throwFile = path.join(dir, 'throw.js');
    fs.writeFileSync(exitFile, 'process.exit(1);');
    fs.writeFileSync(throwFile, 'throw new Error("boom");');
    for (const workerFile of [exitFile, throwFile]) {
      await assert.rejects(
        packContainersAsync(linesOf(3, 2), spec, config, { workerFile, timeoutMs: 5000 }),
        (error) => error.statusCode === 503,
      );
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('并发有界：超出 worker+队列上限的请求立即 503', async () => {
  const lines = linesOf(300, 5);
  const burst = Array.from({ length: 40 }, () => packContainersAsync(lines, spec, config, { timeoutMs: 1 }).then(
    () => 'ok',
    (error) => error.message,
  ));
  const outcomes = await Promise.all(burst);
  assert.ok(outcomes.some((message) => message.includes('请求过多')), '超过上限的请求被拒绝');
  assert.ok(!outcomes.includes('ok'));
});
