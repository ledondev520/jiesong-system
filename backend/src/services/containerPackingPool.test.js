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

test('结果缓存：相同输入第二次命中且返回独立副本', async () => {
  const lines = linesOf(40, 3);
  const first = await packContainersAsync(lines, spec, config);
  const started = Date.now();
  const second = await packContainersAsync(lines, spec, config);
  assert.deepEqual(second, first);
  assert.notEqual(second, first);
  second.containers.length = 0;
  assert.ok(Date.now() - started < 20, '命中不应再起 worker');
  assert.equal((await packContainersAsync(lines, spec, config)).containers.length, first.containers.length);
});

test('priority 任务插队到排队任务之前', async () => {
  // 池只保证启动顺序：busy2 长期占住一个 worker，busy1 先空出后 P、A、B 在同一 worker 上串行启动，日志顺序即出队顺序（无线程竞争）。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-pool-'));
  try {
    const logFile = path.join(dir, 'started.log');
    const workerFile = path.join(dir, 'record.js');
    fs.writeFileSync(workerFile, `const { parentPort, workerData } = require('node:worker_threads');
require('node:fs').appendFileSync(${JSON.stringify(logFile)}, workerData.lines[0].tag + '\\n');
setTimeout(() => parentPort.postMessage({ ok: true, result: { containers: [], unplaced: [] } }), { busy1: 100, busy2: 800 }[workerData.lines[0].tag] ?? 20);`);
    const run = (tag, options) => packContainersAsync([{ tag }], spec, config, { ...options, workerFile, timeoutMs: 5000 });
    // 同一 tick 内先占满两个 worker 再排队，排队顺序为 A、B、P。
    await Promise.all([run('busy1'), run('busy2'), run('A'), run('B'), run('P', { priority: true })]);
    const started = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.deepEqual(started.slice(0, 2).sort(), ['busy1', 'busy2']);
    assert.deepEqual(started.slice(2), ['P', 'A', 'B']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('排队等待计入总时限：worker 全忙时到点即 503，不等 worker 空出', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-pool-'));
  try {
    const slowFile = path.join(dir, 'slow.js');
    fs.writeFileSync(slowFile, "const { parentPort } = require('node:worker_threads'); setTimeout(() => parentPort.postMessage({ ok: true, result: { containers: [], unplaced: [] } }), 1500);");
    const lines = linesOf(3, 2);
    const busy = Array.from({ length: 2 }, () => packContainersAsync(lines, spec, config, { workerFile: slowFile, timeoutMs: 5000 }));
    const started = Date.now();
    await assert.rejects(
      packContainersAsync(linesOf(333, 5), spec, config, { timeoutMs: 300, priority: true }),
      (error) => error.statusCode === 503,
    );
    assert.ok(Date.now() - started < 1200, '排队超时应在约 300 ms 返回，而不是等 worker 空出');
    await Promise.all(busy);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
