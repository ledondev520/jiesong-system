'use strict';

const { SecureJsonlMessageStore } = require('./messageStore');
const { WechatGroupSummaryService } = require('./summaryService');
const { SecureDraftAdapter } = require('./draftAdapter');
const { WechatGroupAgentRuntime } = require('./runtime');
const { detectSummaryTrigger } = require('./triggerPolicy');
const { parseOcrSnapshot } = require('./ocrSnapshotParser');
const { MacOcrCaptureAdapter } = require('./macOcrCaptureAdapter');
const { parseGroupAllowlist, assertAllowedGroup, assertSnapshotMatchesGroup } = require('./groupPolicy');
const {
  ListenerHealthStore,
  LocalListenerManager,
  classifyListenerError,
  detectWechatLoginRequired,
  runListener,
  superviseListener,
  summarizeListenerStatus,
} = require('./listenerSupervisor');

module.exports = {
  SecureJsonlMessageStore,
  WechatGroupSummaryService,
  SecureDraftAdapter,
  WechatGroupAgentRuntime,
  detectSummaryTrigger,
  parseOcrSnapshot,
  MacOcrCaptureAdapter,
  parseGroupAllowlist,
  assertAllowedGroup,
  assertSnapshotMatchesGroup,
  ListenerHealthStore,
  LocalListenerManager,
  classifyListenerError,
  detectWechatLoginRequired,
  runListener,
  superviseListener,
  summarizeListenerStatus,
};
