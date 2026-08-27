'use strict';

const OpenAI = require('openai');
const config = require('../../config');
const { buildSummaryMessages } = require('./summaryPrompt');

const clampSummary = (value, maxChars = 3500) => {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error('summary model returned empty content');
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, maxChars - 1).trimEnd()}…`;
};

class WechatGroupSummaryService {
  constructor({
    client = null,
    model = process.env.WECHAT_GROUP_AGENT_MODEL || 'moonshot-v1-8k',
    allowRemote = process.env.WECHAT_GROUP_AGENT_ALLOW_REMOTE === 'true',
  } = {}) {
    this.client = client;
    this.model = model;
    this.allowRemote = allowRemote;
  }

  getClient() {
    if (this.client) return this.client;
    if (!this.allowRemote) {
      throw new Error('remote summary is disabled; group messages were not transmitted');
    }
    if (!config.kimi.apiKey) {
      throw new Error('KIMI_API_KEY is not configured; group messages were not transmitted');
    }
    this.client = new OpenAI({
      apiKey: config.kimi.apiKey,
      baseURL: config.kimi.baseUrl,
      timeout: 30_000,
    });
    return this.client;
  }

  async summarize({ groupName, messages, scope = 'recent' }) {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('no group messages available for summary');
    }
    const client = this.getClient();
    const result = await client.chat.completions.create({
      model: this.model,
      messages: buildSummaryMessages({ groupName, messages, scope }),
      temperature: 0.2,
      max_tokens: 1600,
    });
    return clampSummary(result.choices?.[0]?.message?.content);
  }
}

module.exports = {
  WechatGroupSummaryService,
  clampSummary,
};
