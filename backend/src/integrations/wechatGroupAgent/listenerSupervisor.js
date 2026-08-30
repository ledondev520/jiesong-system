'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

const ensurePrivateDir = (dirPath) => {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  fs.chmodSync(dirPath, 0o700);
};

const writePrivateFileAtomic = (filePath, content) => {
  ensurePrivateDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, content, { mode: 0o600 });
  fs.chmodSync(tempPath, 0o600);
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
};

const readJson = (filePath) => {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
};

const buildListenerEnv = ({ groupName }) => ({
  PATH: process.env.PATH || '/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',
  HOME: process.env.HOME || '',
  LANG: process.env.LANG || 'zh_CN.UTF-8',
  LC_ALL: process.env.LC_ALL || '',
  TMPDIR: process.env.TMPDIR || '/tmp',
  NODE_ENV: 'production',
  WECHAT_GROUP_AGENT_GROUP_ALLOWLIST: groupName,
  WECHAT_GROUP_AGENT_ALLOW_REMOTE: 'false',
});

const classifyListenerError = (error) => {
  const message = String(error?.message || 'unknown listener error');
  if (/login is required|重新登录/i.test(message)) return 'WECHAT_LOGIN_REQUIRED';
  if (/title does not match/i.test(message)) return 'GROUP_NOT_VISIBLE';
  if (/visible WeChat window not found/i.test(message)) return 'WECHAT_WINDOW_NOT_VISIBLE';
  if (/Screen Recording permission/i.test(message)) return 'SCREEN_RECORDING_PERMISSION';
  if (/timed out/i.test(message)) return 'CAPTURE_TIMEOUT';
  return 'CAPTURE_FAILED';
};

const safeErrorSummary = (code) => ({
  WECHAT_LOGIN_REQUIRED: 'WeChat login is required',
  GROUP_NOT_VISIBLE: 'The allowed WeChat group is not visible',
  WECHAT_WINDOW_NOT_VISIBLE: 'A visible WeChat window is required',
  SCREEN_RECORDING_PERMISSION: 'Screen Recording permission is required',
  CAPTURE_TIMEOUT: 'WeChat capture timed out',
  CAPTURE_FAILED: 'WeChat capture failed',
}[code] || 'WeChat capture failed');

class ListenerHealthStore {
  constructor(stateDir, { now = () => new Date() } = {}) {
    this.stateDir = path.resolve(stateDir);
    this.healthPath = path.join(this.stateDir, 'listener-health.json');
    this.now = now;
    ensurePrivateDir(this.stateDir);
  }

  read() {
    return readJson(this.healthPath);
  }

  write(value) {
    writePrivateFileAtomic(this.healthPath, `${JSON.stringify(value, null, 2)}\n`);
    return value;
  }

  begin({ groupName, intervalSeconds, pid = process.pid }) {
    const previous = this.read() || {};
    const at = this.now().toISOString();
    return this.write({
      schemaVersion: 1,
      status: 'starting',
      mode: 'draft',
      groupName,
      intervalSeconds,
      pid,
      runCount: Number(previous.runCount || 0) + 1,
      startedAt: at,
      stoppedAt: null,
      heartbeatAt: at,
      lastCaptureAt: null,
      lastSuccessAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
      lastError: null,
      consecutiveErrors: 0,
      totalCaptureAttempts: 0,
      totalCaptureSuccesses: 0,
      totalNewMessages: 0,
      totalTriggers: 0,
    });
  }

  recordSuccess({ observations = 0, newMessages = 0, triggers = 0 }) {
    const current = this.read() || {};
    const at = this.now().toISOString();
    return this.write({
      ...current,
      status: 'healthy',
      heartbeatAt: at,
      lastCaptureAt: at,
      lastSuccessAt: at,
      lastObservationCount: Number(observations || 0),
      lastErrorCode: null,
      lastError: null,
      consecutiveErrors: 0,
      totalCaptureAttempts: Number(current.totalCaptureAttempts || 0) + 1,
      totalCaptureSuccesses: Number(current.totalCaptureSuccesses || 0) + 1,
      totalNewMessages: Number(current.totalNewMessages || 0) + Number(newMessages || 0),
      totalTriggers: Number(current.totalTriggers || 0) + Number(triggers || 0),
    });
  }

  recordFailure(error) {
    const current = this.read() || {};
    const at = this.now().toISOString();
    const code = classifyListenerError(error);
    return this.write({
      ...current,
      status: 'degraded',
      heartbeatAt: at,
      lastErrorAt: at,
      lastErrorCode: code,
      lastError: safeErrorSummary(code),
      consecutiveErrors: Number(current.consecutiveErrors || 0) + 1,
      totalCaptureAttempts: Number(current.totalCaptureAttempts || 0) + 1,
    });
  }

  markStopped() {
    const current = this.read() || {};
    const at = this.now().toISOString();
    return this.write({ ...current, status: 'stopped', heartbeatAt: at, stoppedAt: at });
  }
}

const detectWechatLoginRequired = (snapshot) => {
  const observations = Array.isArray(snapshot?.observations) ? snapshot.observations : [];
  return observations.some((item) => (
    /重新登录|登录微信|扫码登录|手机上完成登录/.test(String(item?.text || item?.value || ''))
  ));
};

const runListener = async ({
  groupName,
  intervalSeconds,
  capture,
  validate,
  ingestSnapshot,
  healthStore,
  shouldStop = () => false,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxIterations = Infinity,
  onEvent = () => {},
}) => {
  healthStore.begin({ groupName, intervalSeconds });
  let iterations = 0;
  while (!shouldStop() && iterations < maxIterations) {
    iterations += 1;
    try {
      const snapshot = capture();
      if (detectWechatLoginRequired(snapshot)) throw new Error('WeChat login is required');
      validate(snapshot, groupName);
      const results = await ingestSnapshot({ groupName, snapshot });
      const newMessages = results.filter((item) => item.created).length;
      const triggers = results.filter((item) => item.triggered).length;
      const health = healthStore.recordSuccess({
        observations: snapshot.observations?.length || 0,
        newMessages,
        triggers,
      });
      if (newMessages > 0 || triggers > 0) onEvent({ newMessages, triggers, at: health.heartbeatAt });
    } catch (error) {
      const health = healthStore.recordFailure(error);
      onEvent({ degraded: true, errorCode: health.lastErrorCode, at: health.heartbeatAt });
    }
    if (!shouldStop() && iterations < maxIterations) await wait(intervalSeconds * 1_000);
  }
  return healthStore.markStopped();
};

class LocalListenerManager {
  constructor(stateDir) {
    this.stateDir = path.resolve(stateDir);
    this.supervisorPath = path.join(this.stateDir, 'listener-supervisor.json');
    this.stdoutPath = path.join(this.stateDir, 'listener.stdout.log');
    this.stderrPath = path.join(this.stateDir, 'listener.stderr.log');
    ensurePrivateDir(this.stateDir);
  }

  read() {
    return readJson(this.supervisorPath);
  }

  isRunning() {
    const state = this.read();
    if (!state?.pid) return false;
    const result = spawnSync('/bin/ps', ['-p', String(state.pid), '-o', 'command='], {
      encoding: 'utf8',
      timeout: 5_000,
    });
    return result.status === 0
      && result.stdout.includes('wechat-group/index.js supervise-child');
  }

  status() {
    const state = this.read() || {};
    return {
      manager: 'local-supervisor',
      running: this.isRunning(),
      supervisorPid: state.pid || null,
      childPid: state.childPid || null,
      restartCount: Number(state.restartCount || 0),
    };
  }

  start({ nodePath, scriptPath, workingDirectory, groupName, intervalSeconds }) {
    if (this.isRunning()) {
      throw new Error('wechat group listener supervisor is already running');
    }
    const stdoutFd = fs.openSync(this.stdoutPath, 'a', 0o600);
    const stderrFd = fs.openSync(this.stderrPath, 'a', 0o600);
    fs.chmodSync(this.stdoutPath, 0o600);
    fs.chmodSync(this.stderrPath, 0o600);
    const child = spawn(nodePath, [
      scriptPath,
      'supervise-child',
      '--group', groupName,
      '--interval', String(intervalSeconds),
      '--state', this.stateDir,
    ], {
      cwd: workingDirectory,
      detached: true,
      stdio: ['ignore', stdoutFd, stderrFd],
      env: buildListenerEnv({ groupName }),
    });
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);
    child.unref();
    writePrivateFileAtomic(this.supervisorPath, `${JSON.stringify({
      status: 'starting',
      pid: child.pid,
      childPid: null,
      groupName,
      intervalSeconds,
      startedAt: new Date().toISOString(),
      restartCount: 0,
      scriptPath,
    }, null, 2)}\n`);
    return { managed: true, manager: 'local-supervisor', pid: child.pid };
  }

  stop() {
    const state = this.read();
    const wasRunning = this.isRunning();
    if (wasRunning) process.kill(state.pid, 'SIGTERM');
    writePrivateFileAtomic(this.supervisorPath, `${JSON.stringify({
      ...(state || {}),
      status: 'stopped',
      stoppedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    const healthStore = new ListenerHealthStore(this.stateDir);
    if (healthStore.read()) healthStore.markStopped();
    return { managed: false, manager: 'local-supervisor', alreadyStopped: !wasRunning };
  }
}

const superviseListener = async ({
  nodePath,
  scriptPath,
  workingDirectory,
  stateDir,
  groupName,
  intervalSeconds,
  restartDelayMs = 3_000,
}) => {
  const supervisorPath = path.join(stateDir, 'listener-supervisor.json');
  let stopping = false;
  let activeChild = null;
  let restartCount = Number(readJson(supervisorPath)?.restartCount || 0);
  const stop = () => {
    stopping = true;
    if (activeChild && activeChild.exitCode === null) activeChild.kill('SIGTERM');
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  while (!stopping) {
    activeChild = spawn(nodePath, [
      scriptPath,
      'run-supervised',
      '--group', groupName,
      '--interval', String(intervalSeconds),
      '--state', stateDir,
    ], {
      cwd: workingDirectory,
      stdio: 'inherit',
      env: buildListenerEnv({ groupName }),
    });
    writePrivateFileAtomic(supervisorPath, `${JSON.stringify({
      status: 'running',
      pid: process.pid,
      childPid: activeChild.pid,
      groupName,
      intervalSeconds,
      startedAt: readJson(supervisorPath)?.startedAt || new Date().toISOString(),
      restartCount,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    await new Promise((resolve) => {
      activeChild.once('exit', resolve);
      activeChild.once('error', resolve);
    });
    activeChild = null;
    if (!stopping) {
      restartCount += 1;
      await new Promise((resolve) => setTimeout(resolve, restartDelayMs));
    }
  }
  writePrivateFileAtomic(supervisorPath, `${JSON.stringify({
    ...(readJson(supervisorPath) || {}),
    status: 'stopped',
    childPid: null,
    stoppedAt: new Date().toISOString(),
  }, null, 2)}\n`);
};

const summarizeListenerStatus = ({ health, loaded, now = new Date() }) => {
  if (!health) return { status: loaded ? 'starting' : 'not-started', loaded, heartbeatFresh: false };
  const heartbeatMs = Date.parse(health.heartbeatAt || '');
  const intervalSeconds = Math.max(2, Number(health.intervalSeconds) || 4);
  const staleAfterSeconds = Math.max(60, intervalSeconds * 4 + 30);
  const heartbeatAgeSeconds = Number.isFinite(heartbeatMs)
    ? Math.max(0, Math.round((now.getTime() - heartbeatMs) / 1_000))
    : null;
  const heartbeatFresh = heartbeatAgeSeconds !== null && heartbeatAgeSeconds <= staleAfterSeconds;
  let status = health.status;
  if (!loaded && status !== 'stopped') status = 'not-loaded';
  else if (loaded && !heartbeatFresh) status = 'stale';
  return {
    ...health,
    status,
    loaded,
    heartbeatFresh,
    heartbeatAgeSeconds,
    staleAfterSeconds,
  };
};

module.exports = {
  ListenerHealthStore,
  LocalListenerManager,
  classifyListenerError,
  detectWechatLoginRequired,
  runListener,
  superviseListener,
  summarizeListenerStatus,
};
