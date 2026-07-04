/**
 * Input: exportReminderService（退税月度提醒 + 缺发票催票提醒）
 * Output: 每日定时触发的出口流程提醒任务（退税提醒自守卫仅每月5号生效）
 * Pos: 运行时任务编排，与 inventoryAlertJob 同构
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const {
  runMonthlyTaxRefundReminder,
  runInvoiceMissingReminder,
} = require('../services/exportReminderService');

const DAY_MS = 24 * 60 * 60 * 1000;

const state = {
  started: false,
  running: false,
  timeoutId: null,
  intervalId: null,
};

/** 职责：解析有界整数环境变量，非法时回退默认值 */
const parseBoundedInt = (value, fallback, min, max) => {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return parsed;
};

/** 职责：解析布尔环境变量（true/1/yes | false/0/no） */
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

/** 职责：计算下一次运行时间（今天 hour:minute，已过则明天） */
const getNextRunAt = (now, hour, minute) => {
  const runAt = new Date(now);
  runAt.setHours(hour, minute, 0, 0);
  if (runAt.getTime() <= now.getTime()) {
    runAt.setDate(runAt.getDate() + 1);
  }
  return runAt;
};

/**
 * 职责：执行一轮出口流程提醒（退税月度提醒 + 缺发票提醒）
 * @param {string} reason 触发原因（scheduled/startup/manual）
 */
const executeExportReminderCheck = async (reason = 'scheduled') => {
  if (state.running) {
    console.warn(`[export-reminder-job] skip ${reason} run because previous run is still executing`);
    return null;
  }

  state.running = true;
  try {
    // 1. 每月5号退税申报提醒（服务内部自守卫非5号跳过）
    const taxResult = await runMonthlyTaxRefundReminder();
    // 2. 已出货缺发票催票提醒（每日）
    const invoiceResult = await runInvoiceMissingReminder();
    console.log(
      `[export-reminder-job] ${reason} run completed: taxRefund=${taxResult.skipped ? `skipped(${taxResult.reason})` : `created ${taxResult.created}`}, invoiceMissing=${invoiceResult.skipped ? `skipped(${invoiceResult.reason})` : `created ${invoiceResult.created}`}`,
    );
    return { taxResult, invoiceResult };
  } catch (error) {
    console.error(`[export-reminder-job] ${reason} run failed`, error);
    return null;
  } finally {
    state.running = false;
  }
};

/**
 * 职责：启动出口流程提醒定时任务（每日 hour:minute 触发一次）
 * @param {object} options { hour?, minute?, runOnStart? }（默认 9:10，可用环境变量 EXPORT_REMINDER_* 覆盖）
 */
const startExportReminderJob = (options = {}) => {
  if (state.started) {
    return;
  }

  const hour = parseBoundedInt(options.hour ?? process.env.EXPORT_REMINDER_SCHEDULE_HOUR, 9, 0, 23);
  const minute = parseBoundedInt(options.minute ?? process.env.EXPORT_REMINDER_SCHEDULE_MINUTE, 10, 0, 59);
  const runOnStart = parseBoolean(options.runOnStart ?? process.env.EXPORT_REMINDER_RUN_ON_START, true);

  const now = new Date();
  const firstRunAt = getNextRunAt(now, hour, minute);
  const delay = Math.max(0, firstRunAt.getTime() - now.getTime());

  state.timeoutId = setTimeout(() => {
    void executeExportReminderCheck('scheduled');
    state.intervalId = setInterval(() => {
      void executeExportReminderCheck('scheduled');
    }, DAY_MS);
  }, delay);

  state.started = true;

  if (runOnStart) {
    void executeExportReminderCheck('startup');
  }

  console.log(
    `[export-reminder-job] started, next run at ${firstRunAt.toISOString()}, daily at ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  );
};

/** 职责：停止定时任务并清理计时器 */
const stopExportReminderJob = () => {
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
  startExportReminderJob,
  stopExportReminderJob,
  executeExportReminderCheck,
};
