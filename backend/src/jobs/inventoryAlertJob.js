/**
 * Input: 低库存预警服务
 * Output: 每日库存预警定时任务
 * Pos: 运行时任务编排，负责每天触发低库存检查并下发通知
 */

const { runDailyLowStockAlertCheck } = require('../services/inventoryAlertService');

const DAY_MS = 24 * 60 * 60 * 1000;

const state = {
  started: false,
  running: false,
  timeoutId: null,
  intervalId: null,
};

const parseBoundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
};

const parseBoolean = (value, fallback) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return fallback;
};

const getNextRunAt = (now, hour, minute) => {
  const runAt = new Date(now);
  runAt.setHours(hour, minute, 0, 0);
  if (runAt.getTime() <= now.getTime()) {
    runAt.setDate(runAt.getDate() + 1);
  }
  return runAt;
};

const executeInventoryAlertCheck = async (reason = 'scheduled') => {
  if (state.running) {
    console.warn(`[inventory-alert-job] skip ${reason} run because previous run is still executing`);
    return null;
  }

  state.running = true;
  try {
    const result = await runDailyLowStockAlertCheck();
    console.log(
      `[inventory-alert-job] ${reason} run completed: alerts=${result.alertCount}, notifications=${result.created}`,
    );
    return result;
  } catch (error) {
    console.error(`[inventory-alert-job] ${reason} run failed`, error);
    return null;
  } finally {
    state.running = false;
  }
};

const startInventoryAlertJob = (options = {}) => {
  if (state.started) {
    return;
  }

  const hour = parseBoundedInt(options.hour ?? process.env.INVENTORY_ALERT_SCHEDULE_HOUR, 9, 0, 23);
  const minute = parseBoundedInt(options.minute ?? process.env.INVENTORY_ALERT_SCHEDULE_MINUTE, 0, 0, 59);
  const runOnStart = parseBoolean(options.runOnStart ?? process.env.INVENTORY_ALERT_RUN_ON_START, true);

  const now = new Date();
  const firstRunAt = getNextRunAt(now, hour, minute);
  const delay = Math.max(0, firstRunAt.getTime() - now.getTime());

  state.timeoutId = setTimeout(() => {
    void executeInventoryAlertCheck('scheduled');
    state.intervalId = setInterval(() => {
      void executeInventoryAlertCheck('scheduled');
    }, DAY_MS);
  }, delay);

  state.started = true;

  if (runOnStart) {
    void executeInventoryAlertCheck('startup');
  }

  console.log(
    `[inventory-alert-job] started, next run at ${firstRunAt.toISOString()}, daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  );
};

const stopInventoryAlertJob = () => {
  if (state.timeoutId) {
    clearTimeout(state.timeoutId);
    state.timeoutId = null;
  }
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.started = false;
  state.running = false;
};

module.exports = {
  startInventoryAlertJob,
  stopInventoryAlertJob,
  executeInventoryAlertCheck,
  _internal: {
    getNextRunAt,
    parseBoundedInt,
    parseBoolean,
  },
};
