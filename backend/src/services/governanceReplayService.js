/**
 * Input: agent metadata
 * Output: AI 治理回放分类结果
 * Pos: 后端服务层
 */

const getPersistedGovernanceReplayProfile = (metadata = {}, options = {}) => {
  const profile = metadata?.governanceReplayProfile || options?.persistedProfile;
  if (!profile || typeof profile !== 'object') return null;
  return profile;
};

const hasGovernanceReplayMetadata = (metadata = {}) => (
  false
  || Boolean(metadata?.toolTraceSummary?.totalCalls)
  || Boolean(Array.isArray(metadata?.actionRecommendations) && metadata.actionRecommendations.length > 0)
  || Boolean(Array.isArray(metadata?.pendingActionSummary) && metadata.pendingActionSummary.length > 0)
);

const hasOperationLogReplayEvidence = (pendingActionSummary = []) => (
  (Array.isArray(pendingActionSummary) ? pendingActionSummary : []).some((item) => (
    Array.isArray(item?.timeline)
    && item.timeline.some((event) => event?.type && event.type !== 'created')
  ))
);

const buildGovernanceReplayEvidence = (pendingActionSummary = []) => {
  const normalized = Array.isArray(pendingActionSummary) ? pendingActionSummary : [];
  const actionLifecycleCount = normalized.filter((item) => (
    Array.isArray(item?.timeline)
    && item.timeline.some((event) => event?.type && event.type !== 'created')
  )).length;
  const operationLogEvents = normalized.reduce((count, item) => (
    count + ((Array.isArray(item?.timeline) ? item.timeline : []).filter((event) => event?.type && event.type !== 'created').length)
  ), 0);

  return {
    operationLogEvents,
    actionLifecycleCount,
  };
};

const buildGovernanceReplaySummary = (metadata = {}, options = {}) => {
  const persisted = getPersistedGovernanceReplayProfile(metadata, options)?.summary;
  if (persisted) {
    return {
      tools: Boolean(persisted.tools),
      recommendations: Boolean(persisted.recommendations),
      actions: Boolean(persisted.actions),
    };
  }

  return {
    tools: Boolean(metadata?.toolTraceSummary?.totalCalls),
    recommendations: Boolean(Array.isArray(metadata?.actionRecommendations) && metadata.actionRecommendations.length > 0),
    actions: Boolean(Array.isArray(metadata?.pendingActionSummary) && metadata.pendingActionSummary.length > 0),
  };
};

const buildGovernanceReplayCounts = (metadata = {}, options = {}) => {
  const persisted = getPersistedGovernanceReplayProfile(metadata, options)?.counts;
  if (persisted) {
    return {
      tools: Number(persisted.tools || 0),
      recommendations: Number(persisted.recommendations || 0),
      actions: Number(persisted.actions || 0),
    };
  }

  return {
    tools: Number(metadata?.toolTraceSummary?.totalCalls || 0),
    recommendations: Array.isArray(metadata?.actionRecommendations) ? metadata.actionRecommendations.length : 0,
    actions: Array.isArray(metadata?.pendingActionSummary) ? metadata.pendingActionSummary.length : 0,
  };
};

const buildGovernanceReplayLevel = (summary = {}) => {
  if (summary.tools) return 'tools';
  if (summary.recommendations) return 'recommendations';
  if (summary.actions) return 'actions';
  return 'none';
};

const buildGovernanceReplaySource = (metadata = {}, options = {}) => {
  const persisted = getPersistedGovernanceReplayProfile(metadata, options);
  const hasMetadata = hasGovernanceReplayMetadata(metadata);
  if (!hasMetadata && !persisted) return 'none';
  const baseSource = options.persistedSource || persisted?.source || (hasMetadata ? 'session-metadata' : 'none');
  if (hasOperationLogReplayEvidence(options.pendingActionSummary)) {
    if (baseSource === 'replay-summary-record') return 'replay-summary-record+operation-log';
    if (baseSource === 'replay-snapshot-log') return 'replay-snapshot-log+operation-log';
    if (baseSource === 'agent-run-log') return 'agent-run-log+operation-log';
    return 'session-metadata+operation-log';
  }
  return baseSource;
};

const buildGovernanceReplayProfile = (metadata = {}, options = {}) => {
  const persisted = getPersistedGovernanceReplayProfile(metadata, options);
  const summary = buildGovernanceReplaySummary(metadata, options);
  const runtimeEvidence = buildGovernanceReplayEvidence(options.pendingActionSummary);
  const persistedEvidence = persisted?.evidence || {};
  const evidence = {
    operationLogEvents: Math.max(Number(persistedEvidence.operationLogEvents || 0), runtimeEvidence.operationLogEvents),
    actionLifecycleCount: Math.max(Number(persistedEvidence.actionLifecycleCount || 0), runtimeEvidence.actionLifecycleCount),
  };
  return {
    available: typeof persisted?.available === 'boolean' ? persisted.available : hasGovernanceReplayMetadata(metadata),
    source: buildGovernanceReplaySource(metadata, options),
    level: persisted?.level || buildGovernanceReplayLevel(summary),
    evidence,
    summary,
    counts: buildGovernanceReplayCounts(metadata, options),
  };
};

module.exports = {
  hasGovernanceReplayMetadata,
  buildGovernanceReplaySummary,
  buildGovernanceReplayCounts,
  buildGovernanceReplayLevel,
  buildGovernanceReplaySource,
  buildGovernanceReplayProfile,
  hasOperationLogReplayEvidence,
  buildGovernanceReplayEvidence,
  getPersistedGovernanceReplayProfile,
};
