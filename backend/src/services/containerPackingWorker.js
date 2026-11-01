/**
 * Input: workerData { lines, spec, config }（可结构化克隆的纯数据）
 * Output: parentPort 消息 { ok: true, result } 或 { ok: false, error }
 * Pos: containerPackingPool 的 worker_threads 入口；只调用同步 packContainers，保证与进程内结果一致
 */

const { parentPort, workerData } = require('node:worker_threads');
const { packContainers } = require('./containerPacking');

try {
  parentPort.postMessage({ ok: true, result: packContainers(workerData.lines, workerData.spec, workerData.config) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: String(error?.message || error) });
}
