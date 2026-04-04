/**
 * Input: patrolService
 * Output: 定时巡检任务调度器（每小时业务+系统巡检）
 * Pos: 运行时任务编排，负责定时触发巡检并记录结果
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const { runFullPatrol } = require('../services/patrolService');

const HOUR_MS = 60 * 60 * 1000;

const state = {
  started: false,
  running: false,
  intervalId: null,
  lastResult: null,
};

/**
 * 职责：执行一次巡检
 * @param {string} reason - 触发原因标签
 */
const executePatrol = async (reason = 'scheduled') => {
  if (state.running) {
    console.warn(`[patrol-job] skip ${reason} run because previous run is still executing`);
    return null;
  }

  state.running = true;
  try {
    const result = await runFullPatrol();
    state.lastResult = { ...result, reason, completedAt: new Date().toISOString() };
    return result;
  } catch (error) {
    console.error(`[patrol-job] ${reason} run failed`, error);
    return null;
  } finally {
    state.running = false;
  }
};

/**
 * 职责：启动定时巡检
 * 思路：
 *   1. 启动时立即执行一次
 *   2. 之后每小时执行一次
 * @param {Object} [options]
 * @param {number} [options.intervalMs] - 巡检间隔（毫秒），默认 1 小时
 * @param {boolean} [options.runOnStart] - 是否启动时立即执行，默认 true
 */
const startPatrolJob = (options = {}) => {
  if (state.started) return;

  const intervalMs = options.intervalMs ?? HOUR_MS;
  const runOnStart = options.runOnStart ?? true;

  state.intervalId = setInterval(() => {
    void executePatrol('scheduled');
  }, intervalMs);
  state.intervalId.unref();

  state.started = true;

  if (runOnStart) {
    void executePatrol('startup');
  }

  console.log(`[patrol-job] started, interval=${Math.round(intervalMs / 60000)}min`);
};

const stopPatrolJob = () => {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.started = false;
  state.running = false;
};

const getPatrolStatus = () => ({
  started: state.started,
  running: state.running,
  lastResult: state.lastResult,
});

module.exports = {
  startPatrolJob,
  stopPatrolJob,
  executePatrol,
  getPatrolStatus,
};
