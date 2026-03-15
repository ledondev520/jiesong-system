/**
 * Input: 任务提醒处理器
 * Output: 任务提醒轮询任务
 * Pos: 运行时每分钟扫描一次到期任务提醒
 */

const { processDueTaskReminders } = require('../services/opsTaskReminderService');

const state = {
  started: false,
  running: false,
  intervalId: null,
};

const executeOpsTaskReminderCheck = async (reason = 'scheduled') => {
  if (state.running) {
    return null;
  }

  state.running = true;
  try {
    const result = await processDueTaskReminders();
    console.log(`[ops-task-reminder-job] ${reason} run completed: processed=${result.processed}, notifications=${result.created}`);
    return result;
  } catch (error) {
    console.error(`[ops-task-reminder-job] ${reason} run failed`, error);
    return null;
  } finally {
    state.running = false;
  }
};

const startOpsTaskReminderJob = (options = {}) => {
  if (state.started) {
    return;
  }

  const intervalMs = Number.isFinite(Number(options.intervalMs))
    ? Number(options.intervalMs)
    : 60 * 1000;
  const runOnStart = options.runOnStart !== false;

  state.intervalId = setInterval(() => {
    void executeOpsTaskReminderCheck('scheduled');
  }, intervalMs);
  state.started = true;

  if (runOnStart) {
    void executeOpsTaskReminderCheck('startup');
  }
};

const stopOpsTaskReminderJob = () => {
  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
  state.started = false;
  state.running = false;
};

module.exports = {
  startOpsTaskReminderJob,
  stopOpsTaskReminderJob,
  executeOpsTaskReminderCheck,
};
