/**
 * Input: 归一化箱型行、柜型规格、配置（同 containerPacking.packContainers）
 * Output: packContainersAsync —— 在 worker_threads 中排柜，主事件循环不被占用
 * Pos: 排柜 API 层入口；每次请求一个 worker，并发上限 + 排队，超时/崩溃/异常一律 fail-closed（抛 503，绝不返回 ready）
 *
 * shortcut: 每请求新建 worker（约数十 ms 启动开销），不常驻；排柜请求量上升到秒级多次时改为常驻小池。
 */

const crypto = require('node:crypto');
const path = require('node:path');
const { Worker } = require('node:worker_threads');

const WORKER_FILE = path.join(__dirname, 'containerPackingWorker.js');
const intEnv = (name, fallback, min, max) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};
const MAX_CONCURRENT = intEnv('CONTAINER_PACK_MAX_WORKERS', 2, 1, 8);
const MAX_QUEUED = intEnv('CONTAINER_PACK_MAX_QUEUE', 16, 0, 256);
const DEFAULT_TIMEOUT_MS = intEnv('CONTAINER_PACK_TIMEOUT_MS', 4000, 500, 120000);
// 每 worker 堆上限：2 个 worker × 此值须明显低于 PM2 max_memory_restart（deploy.sh 为 500M），否则病态订单会先重启整个实例；真实排柜仅数十 MB。
const HEAP_MB = intEnv('CONTAINER_PACK_HEAP_MB', 128, 64, 512);
// timeoutMs 是「入队到出结果」的总时限（含排队）：出货门禁在 Prisma 交互事务内等待排柜，事务超时设为 15 s（salesService），本时限默认 4 s；实测最慢 1000 种箱规约 1 s。
// 结果缓存（进程内存、不落盘不记录）：仪表盘每次加载会为所有未发货合同排柜，输入未变时直接命中。
const CACHE_SIZE = 200;
const cache = new Map();

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

const cacheGet = (key) => {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value); // LRU：命中移到最新
  return structuredClone(value);
};
const cacheSet = (key, value) => {
  cache.set(key, structuredClone(value));
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value);
};

const drain = () => {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    clearTimeout(job.queueTimer);
    running += 1;
    runWorker(job.payload, Math.max(1, job.deadline - Date.now()), job.workerFile).then(job.resolve, job.reject).finally(() => { running -= 1; drain(); });
  }
};

/**
 * workerFile 仅供测试注入崩溃 worker（注入时不走缓存）；priority 让出货确认插队到仪表盘任务之前。
 * @returns {Promise<{ containers: object[], unplaced: object[] }>} 与 packContainers 同形；失败 reject（statusCode 503）。
 */
const packContainersAsync = (lines, spec, config, { timeoutMs = DEFAULT_TIMEOUT_MS, workerFile = WORKER_FILE, priority = false } = {}) => new Promise((resolve, reject) => {
  const key = workerFile === WORKER_FILE
    ? crypto.createHash('sha256').update(JSON.stringify([lines, spec, config])).digest('hex')
    : null;
  const hit = key && cacheGet(key);
  if (hit) { resolve(hit); return; }
  if (queue.length >= MAX_QUEUED) { reject(failure('排柜请求过多，请稍后重试')); return; }
  const job = {
    payload: { lines, spec, config }, deadline: Date.now() + timeoutMs, workerFile, reject,
    resolve: (result) => { if (key) cacheSet(key, result); resolve(result); },
  };
  // 排队期间也受时限约束：到点仍未开工就出队并 503，不再占用调用方的事务。
  job.queueTimer = setTimeout(() => {
    const index = queue.indexOf(job);
    if (index >= 0) { queue.splice(index, 1); reject(failure('排柜计算超时，请稍后重试或拆分订单')); }
  }, timeoutMs);
  if (priority) queue.unshift(job); else queue.push(job);
  drain();
});

module.exports = { packContainersAsync };
