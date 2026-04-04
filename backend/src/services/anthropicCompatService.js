const crypto = require('node:crypto');
const OpenAI = require('openai');
const config = require('../config');
const aiService = require('./aiService');

const normalizeText = (value) => (typeof value === 'string' ? value : '');

const buildKimiClient = () => new OpenAI({
  apiKey: config.kimi.apiKey,
  baseURL: config.kimi.baseUrl,
});

const flattenToolResultContent = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((block) => normalizeText(block?.text || block?.content || ''))
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const mapAnthropicMessagesToOpenAI = ({ system, messages = [] }) => {
  const result = [];

  if (typeof system === 'string' && system.trim()) {
    result.push({ role: 'system', content: system.trim() });
  }

  for (const message of messages) {
    const role = message?.role;
    const content = message?.content;

    if (typeof content === 'string') {
      result.push({ role, content });
      continue;
    }

    if (!Array.isArray(content)) {
      continue;
    }

    if (role === 'assistant') {
      const text = content
        .filter((block) => block?.type === 'text')
        .map((block) => normalizeText(block.text))
        .join('\n')
        .trim();
      const toolCalls = content
        .filter((block) => block?.type === 'tool_use')
        .map((block) => ({
          id: block.id || `toolu_${crypto.randomUUID()}`,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        }));

      if (text || toolCalls.length > 0) {
        result.push({
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        });
      }
      continue;
    }

    const text = content
      .filter((block) => block?.type === 'text')
      .map((block) => normalizeText(block.text))
      .join('\n')
      .trim();
    if (text) {
      result.push({ role: 'user', content: text });
    }

    const toolResults = content.filter((block) => block?.type === 'tool_result');
    for (const toolResult of toolResults) {
      result.push({
        role: 'tool',
        tool_call_id: toolResult.tool_use_id,
        content: flattenToolResultContent(toolResult.content),
      });
    }
  }

  return result;
};

const mapAnthropicToolsToOpenAI = (tools = []) => {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema || tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }));
};

const mapKimiResponseToAnthropic = ({ response, model }) => {
  const choice = response?.choices?.[0] || {};
  const message = choice.message || {};
  const text = normalizeText(message.content).trim();
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  const content = [];
  if (text) {
    content.push({ type: 'text', text });
  }
  for (const toolCall of toolCalls) {
    let parsedInput = {};
    try {
      parsedInput = JSON.parse(toolCall.function?.arguments || '{}');
    } catch {
      parsedInput = { raw: toolCall.function?.arguments || '' };
    }
    content.push({
      type: 'tool_use',
      id: toolCall.id || `toolu_${crypto.randomUUID()}`,
      name: toolCall.function?.name || 'unknown_tool',
      input: parsedInput,
    });
  }

  return {
    id: response?.id || `msg_${crypto.randomUUID()}`,
    type: 'message',
    role: 'assistant',
    model,
    stop_reason: toolCalls.length > 0
      ? 'tool_use'
      : choice.finish_reason === 'length'
        ? 'max_tokens'
        : 'end_turn',
    stop_sequence: null,
    content,
    usage: {
      input_tokens: Number(response?.usage?.prompt_tokens || 0),
      output_tokens: Number(response?.usage?.completion_tokens || 0),
    },
  };
};

const createMessage = async (payload) => {
  const { defaultModel } = await aiService.getConfiguredModels();
  const model = payload?.model || defaultModel;
  const messages = mapAnthropicMessagesToOpenAI(payload || {});
  const tools = mapAnthropicToolsToOpenAI(payload?.tools);

  const client = buildKimiClient();
  const response = await client.chat.completions.create({
    model,
    messages,
    tools,
    tool_choice: tools?.length ? 'auto' : undefined,
    temperature: 0.2,
    max_tokens: payload?.max_tokens || 4096,
    stream: false,
  });

  return mapKimiResponseToAnthropic({ response, model });
};

const countTokens = async (payload) => {
  const { defaultModel } = await aiService.getConfiguredModels();
  const model = payload?.model || defaultModel;
  const messages = mapAnthropicMessagesToOpenAI(payload || {});
  const result = await aiService.estimateTokens(messages, model);
  return {
    input_tokens: Number(result?.data?.total_tokens || 0),
  };
};

module.exports = {
  createMessage,
  countTokens,
  mapAnthropicMessagesToOpenAI,
  mapKimiResponseToAnthropic,
};
