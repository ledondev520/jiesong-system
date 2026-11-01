/**
 * Input: 归一化箱型行、柜型规格、配置（同 containerPacking.packContainers）
 * Output: packContainersAsync —— 在 worker_threads 中排柜，主事件循环不被占用
 * Pos: 排柜 API 层入口；每次请求一个 worker，并发上限 + 排队，超时/崩溃/异常一律 fail-closed（抛 503，绝不返回 ready）
 *
 * shortcut: 每请求新建 worker（约数十 ms 启动开销），不常驻；排柜请求量上升到秒级多次时改为常驻小池。
 */

const path = require('node:path');
const { Worker } = require('node:worker_threads');

const WORKER_FILE = path.join(__dirname, 'containerPackingWorker.js');
const intEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};
const MAX_CONCURRENT = intEnv('CONTAINER_PACK_MAX_WORKERS', 2, 1, 8);
const MAX_QUEUED = intEnv('CONTAINER_PACK_MAX_QUEUE', 16, 0, 256);
const DEFAULT_TIMEOUT_MS = intEnv('CONTAINER_PACK_TIMEOUT_MS', 15000, 500, 120000);
const HEAP_MB = 512;

const failure = (message) => Object.assign(new Error(message), { statusCode: 503 });

let running = 0;
const queue = [];

const runWorker = (payload, timeoutMs, workerFile) => new Promise((resolve, reject) => {
  let settled = false;
  const worker = new Worker(workerFile, { workerData: payload, resourceLimits: { maxOldGenerationSizeMb: HEAP_MB } });
  const finish = (fn, value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker.terminate().catch(() => {});
    fn(value);
  };
  const timer = setTimeout(() => finish(reject, failure('排柜计算超时，请稍后重试或拆分订单')), timeoutMs);
  worker.once('message', (msg) => (msg?.ok ? finish(resolve, msg.result) : finish(reject, failure('排柜计算失败'))));
  worker.once('error', () => finish(reject, failure('排柜计算失败')));
  worker.once('exit', () => finish(reject, failure('排柜计算异常终止')));
});

const drain = () => {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    running += 1;
    runWorker(job.payload, job.timeoutMs, job.workerFile).then(job.resolve, job.reject).finally(() => { running -= 1; drain(); });
  }
};

/** workerFile 仅供测试注入崩溃 worker。 @returns {Promise<{ containers: object[], unplaced: object[] }>} 与 packContainers 同形；失败 reject（statusCode 503）。 */
const packContainersAsync = (lines, spec, config, { timeoutMs = DEFAULT_TIMEOUT_MS, workerFile = WORKER_FILE } = {}) => new Promise((resolve, reject) => {
  if (queue.length >= MAX_QUEUED) { reject(failure('排柜请求过多，请稍后重试')); return; }
  queue.push({ payload: { lines, spec, config }, timeoutMs, workerFile, resolve, reject });
  drain();
});

module.exports = { packContainersAsync };
