#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  SecureJsonlMessageStore,
  WechatGroupSummaryService,
  SecureDraftAdapter,
  WechatGroupAgentRuntime,
  MacOcrCaptureAdapter,
  parseGroupAllowlist,
  assertAllowedGroup,
  assertSnapshotMatchesGroup,
  ListenerHealthStore,
  LocalListenerManager,
  runListener,
  superviseListener,
  summarizeListenerStatus,
} = require('../../integrations/wechatGroupAgent');

const PROJECT_ROOT = path.resolve(__dirname, '../../../..');
const DEFAULT_STATE_DIR = path.join(PROJECT_ROOT, 'state', 'wechat-group-agent');

const readArgs = (argv) => {
  const [command = 'doctor', ...rest] = argv;
  const values = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (rest[index + 1] && !rest[index + 1].startsWith('--')) {
      values[key] = rest[index + 1];
      index += 1;
    } else {
      values[key] = true;
    }
  }
  return { command, values };
};

const requireValue = (values, key) => {
  const value = String(values[key] || '').trim();
  if (!value) throw new Error(`--${key} is required`);
  return value;
};

const buildRuntime = (stateDir) => {
  const store = new SecureJsonlMessageStore(stateDir);
  return new WechatGroupAgentRuntime({
    store,
    summaryService: new WechatGroupSummaryService(),
    outputAdapter: new SecureDraftAdapter(stateDir),
  });
};

const buildCaptureAdapter = (stateDir) => new MacOcrCaptureAdapter({
  sourcePath: path.join(
    PROJECT_ROOT,
    'backend', 'src', 'integrations', 'wechatGroupAgent', 'macos', 'wechat_vision_ocr.m',
  ),
  binaryPath: path.join(stateDir, 'bin', 'wechat-vision-ocr'),
});

const main = async () => {
  const { command, values } = readArgs(process.argv.slice(2));
  const stateDir = path.resolve(values.state || process.env.WECHAT_GROUP_AGENT_STATE_DIR || DEFAULT_STATE_DIR);
  const runtime = buildRuntime(stateDir);
  const allowedGroups = parseGroupAllowlist();
  const localListenerManager = new LocalListenerManager(stateDir);
  const healthStore = new ListenerHealthStore(stateDir);

  if (command === 'status') {
    const managerStatus = localListenerManager.status();
    process.stdout.write(`${JSON.stringify({ ...summarizeListenerStatus({
      health: healthStore.read(),
      loaded: managerStatus.running,
    }), ...managerStatus }, null, 2)}\n`);
    return;
  }

  if (command === 'stop') {
    process.stdout.write(`${JSON.stringify(localListenerManager.stop(), null, 2)}\n`);
    return;
  }

  if (command === 'doctor') {
    process.stdout.write(`${JSON.stringify({
      ready: true,
      mode: 'draft',
      stateDir,
      remoteSummaryEnabled: process.env.WECHAT_GROUP_AGENT_ALLOW_REMOTE === 'true',
      autoSendEnabled: false,
      groupAllowlistConfigured: allowedGroups.length > 0,
      allowedGroupCount: allowedGroups.length,
    }, null, 2)}\n`);
    return;
  }

  const groupName = assertAllowedGroup(requireValue(values, 'group'), allowedGroups);

  if (command === 'start') {
    const intervalSeconds = Math.max(2, Math.min(Number(values.interval) || 4, 60));
    const result = localListenerManager.start({
      nodePath: process.execPath,
      scriptPath: __filename,
      workingDirectory: path.join(PROJECT_ROOT, 'backend'),
      groupName,
      intervalSeconds,
    });
    process.stdout.write(`${JSON.stringify({
      ...result,
      groupName,
      intervalSeconds,
      mode: 'draft',
      autoSendEnabled: false,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'supervise-child') {
    const intervalSeconds = Math.max(2, Math.min(Number(values.interval) || 4, 60));
    await superviseListener({
      nodePath: process.execPath,
      scriptPath: __filename,
      workingDirectory: path.join(PROJECT_ROOT, 'backend'),
      stateDir,
      groupName,
      intervalSeconds,
    });
    return;
  }

  if (command === 'ingest') {
    const result = await runtime.ingest({
      groupName,
      sender: requireValue(values, 'sender'),
      text: requireValue(values, 'text'),
      isOwn: values.own === true || values.own === 'true',
      source: 'cli',
    });
    process.stdout.write(`${JSON.stringify({
      created: result.created,
      triggered: result.triggered,
      draftPath: result.summaryResult?.delivery?.path || null,
      summarizedMessages: result.summaryResult?.messageCount || 0,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'snapshot') {
    const filePath = path.resolve(requireValue(values, 'file'));
    const snapshot = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    assertSnapshotMatchesGroup(snapshot, groupName);
    const results = await runtime.ingestSnapshot({
      groupName,
      snapshot,
      includeCurrent: values['include-current'] === true || values['include-current'] === 'true',
    });
    process.stdout.write(`${JSON.stringify({
      newMessages: results.filter((item) => item.created).length,
      triggers: results.filter((item) => item.triggered).length,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'capture') {
    const snapshot = buildCaptureAdapter(stateDir).captureWechatWindow();
    assertSnapshotMatchesGroup(snapshot, groupName);
    const results = await runtime.ingestSnapshot({
      groupName,
      snapshot,
      includeCurrent: values['include-current'] === true || values['include-current'] === 'true',
    });
    process.stdout.write(`${JSON.stringify({
      observations: snapshot.observations.length,
      newMessages: results.filter((item) => item.created).length,
      triggers: results.filter((item) => item.triggered).length,
    }, null, 2)}\n`);
    return;
  }

  if (command === 'ack-draft') {
    const result = new SecureDraftAdapter(stateDir).markSent({
      groupName,
      expectedCreatedAt: values['created-at'] ? String(values['created-at']) : null,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (command === 'watch' || command === 'run-supervised') {
    const captureAdapter = buildCaptureAdapter(stateDir);
    const intervalSeconds = Math.max(2, Math.min(Number(values.interval) || 4, 60));
    let stopped = false;
    process.once('SIGINT', () => { stopped = true; });
    process.once('SIGTERM', () => { stopped = true; });
    process.stdout.write(`${JSON.stringify({
      watching: true,
      groupName,
      intervalSeconds,
      mode: 'draft',
    })}\n`);
    let lastEventKey = null;
    await runListener({
      groupName,
      intervalSeconds,
      capture: () => captureAdapter.captureWechatWindow(),
      validate: assertSnapshotMatchesGroup,
      ingestSnapshot: (input) => runtime.ingestSnapshot(input),
      healthStore,
      shouldStop: () => stopped,
      onEvent: (event) => {
        const eventKey = event.degraded ? `degraded:${event.errorCode}` : 'messages';
        if (eventKey === lastEventKey && event.degraded) return;
        lastEventKey = eventKey;
        process.stdout.write(`${JSON.stringify(event)}\n`);
      },
    });
    return;
  }

  if (command === 'summarize') {
    const result = await runtime.summarize({
      groupName,
      trigger: { keyword: 'manual', scope: values.scope || 'recent' },
    });
    process.stdout.write(`${JSON.stringify({
      draftPath: result.delivery.path,
      summarizedMessages: result.messageCount,
    }, null, 2)}\n`);
    return;
  }

  throw new Error(`unsupported command: ${command}`);
};

main().catch((error) => {
  process.stderr.write(`wechat-group-agent: ${error.message}\n`);
  process.exitCode = 1;
});
