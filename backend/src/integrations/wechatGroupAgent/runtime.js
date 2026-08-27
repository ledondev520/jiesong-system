'use strict';

const crypto = require('node:crypto');
const { detectSummaryTrigger } = require('./triggerPolicy');
const { parseOcrSnapshot } = require('./ocrSnapshotParser');

const oneDayAgoIso = () => new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

class WechatGroupAgentRuntime {
  constructor({ store, summaryService, outputAdapter, messageLimit = 120 }) {
    this.store = store;
    this.summaryService = summaryService;
    this.outputAdapter = outputAdapter;
    this.messageLimit = messageLimit;
  }

  async ingest(input) {
    const result = this.store.append(input);
    if (!result.created || !result.message.isOwn) return { ...result, triggered: false };

    const trigger = detectSummaryTrigger(result.message.text);
    if (!trigger.matched) return { ...result, triggered: false };
    return {
      ...result,
      triggered: true,
      summaryResult: await this.summarize({
        groupName: result.message.groupName,
        trigger,
        excludeFingerprint: result.message.fingerprint,
      }),
    };
  }

  async ingestSnapshot({ groupName, snapshot }) {
    const candidates = parseOcrSnapshot(snapshot, { groupName });
    const state = this.store.readState();
    const stateKey = crypto.createHash('sha256').update(groupName).digest('hex').slice(0, 16);
    const hasBaseline = Array.isArray(state.snapshots?.[stateKey]);
    const previous = new Set(state.snapshots?.[stateKey] || []);
    const current = candidates.map((item) => item.sourceFingerprint);
    const results = [];
    if (hasBaseline) {
      for (const candidate of candidates) {
        if (!previous.has(candidate.sourceFingerprint)) {
          results.push(await this.ingest(candidate));
        }
      }
    }
    this.store.writeState({
      ...state,
      snapshots: { ...(state.snapshots || {}), [stateKey]: current },
      updatedAt: new Date().toISOString(),
    });
    return results;
  }

  async summarize({ groupName, trigger = { keyword: 'manual', scope: 'recent' }, excludeFingerprint = null }) {
    const since = trigger.scope === 'today' ? oneDayAgoIso() : null;
    const messages = this.store.list({ groupName, limit: this.messageLimit, since })
      .filter((message) => message.fingerprint !== excludeFingerprint);
    const summary = await this.summaryService.summarize({
      groupName,
      messages,
      scope: trigger.scope,
    });
    const delivery = await this.outputAdapter.deliver({ groupName, summary, trigger });
    return { summary, delivery, messageCount: messages.length };
  }
}

module.exports = {
  WechatGroupAgentRuntime,
};
