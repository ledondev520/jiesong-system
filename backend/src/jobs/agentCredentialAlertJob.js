const { runDailyAgentCredentialAlertCheck } = require('../services/agentCredentialAlertService');

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
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
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

const executeAgentCredentialAlertCheck = async (reason = 'scheduled') => {
  if (state.running) return null;
  state.running = true;
  try {
    const result = await runDailyAgentCredentialAlertCheck();
    console.log(`[agent-credential-job] ${reason} run completed: alerts=${result.alertCount}, notifications=${result.created}`);
    return result;
  } catch (error) {
    console.error(`[agent-credential-job] ${reason} run failed`, error);
    return null;
  } finally {
    state.running = false;
  }
};

const startAgentCredentialAlertJob = (options = {}) => {
  if (state.started) return;

  const hour = parseBoundedInt(options.hour ?? process.env.AGENT_CREDENTIAL_ALERT_SCHEDULE_HOUR, 10, 0, 23);
  const minute = parseBoundedInt(options.minute ?? process.env.AGENT_CREDENTIAL_ALERT_SCHEDULE_MINUTE, 0, 0, 59);
  const runOnStart = parseBoolean(options.runOnStart ?? process.env.AGENT_CREDENTIAL_ALERT_RUN_ON_START, true);

  const now = new Date();
  const firstRunAt = getNextRunAt(now, hour, minute);
  const delay = Math.max(0, firstRunAt.getTime() - now.getTime());

  state.timeoutId = setTimeout(() => {
    void executeAgentCredentialAlertCheck('scheduled');
    state.intervalId = setInterval(() => {
      void executeAgentCredentialAlertCheck('scheduled');
    }, DAY_MS);
  }, delay);

  state.started = true;

  if (runOnStart) {
    void executeAgentCredentialAlertCheck('startup');
  }
};

const stopAgentCredentialAlertJob = () => {
  if (state.timeoutId) clearTimeout(state.timeoutId);
  if (state.intervalId) clearInterval(state.intervalId);
  state.timeoutId = null;
  state.intervalId = null;
  state.started = false;
  state.running = false;
};

module.exports = {
  startAgentCredentialAlertJob,
  stopAgentCredentialAlertJob,
  executeAgentCredentialAlertCheck,
  _internal: {
    parseBoundedInt,
    parseBoolean,
    getNextRunAt,
  },
};
