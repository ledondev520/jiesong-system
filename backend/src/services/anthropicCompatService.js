/**
 * Input: Anthropic 兼容请求、当前 provider 的 OpenAI 兼容客户端、管理员模型配置
 * Output: Anthropic 兼容响应；配置模型不可用时仅降级一次到稳定模型
 * Pos: Open Agent SDK 与当前 provider 的协议适配层，保留思考/工具回合与图像、共用 profile/deadline
 */

const crypto = require('node:crypto');
const aiService = require('./aiService');
const { createError } = require('../middleware/errorHandler');

const normalizeText = (value) => (typeof value === 'string' ? value : '');

const mapContentToOpenAI = (content) => {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    const blocks = content.flatMap((block) => {
      if (block?.type === 'image_url') return [block];
      if (block?.type === 'image' && block.source?.type === 'base64') {
        return [{ type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } }];
      }
      if (block?.type === 'image' && block.source?.type === 'url') {
        return [{ type: 'image_url', image_url: { url: block.source.url } }];
      }
      const text = normalizeText(block?.text || block?.content || '');
      return text ? [{ type: 'text', text }] : [];
    });
    return blocks.some((block) => block.type === 'image_url') ? blocks : blocks.map((block) => block.text).join('\n');
  }
  return '';
};

const mapAnthropicMessagesToOpenAI = ({ system, messages = [] }, modelOptions = {}) => {
  const result = [];
  // 旧 Kimi 会话没有思考记录；DeepSeek tools 请求要求字段存在，空串不伪造内容。
  const legacyReasoning = modelOptions.model === 'deepseek-flash' ? { reasoning_content: '' } : {};

  if (typeof system === 'string' && system.trim()) {
    result.push({ role: 'system', content: system.trim() });
  }

  for (const message of messages) {
    const role = message?.role;
    const content = message?.content;

    if (typeof content === 'string') {
      result.push({ role, content, ...(role === 'assistant' ? legacyReasoning : {}), ...(role === 'assistant' && typeof message.reasoning_content === 'string' ? { reasoning_content: message.reasoning_content } : {}) });
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
      const thinking = content.filter((block) => block?.type === 'thinking');

      if (text || toolCalls.length > 0 || thinking.length > 0) {
        result.push({
          role: 'assistant',
          content: text || null,
          ...legacyReasoning,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
          ...(thinking.length > 0 ? { reasoning_content: thinking.map((block) => normalizeText(block.thinking)).join('') } : {}),
        });
      }
      continue;
    }

    const userContent = mapContentToOpenAI(content.filter((block) => block?.type !== 'tool_result'));
    if (userContent.length) {
      result.push({ role: 'user', content: typeof userContent === 'string' ? userContent.trim() : userContent });
    }

    const toolResults = content.filter((block) => block?.type === 'tool_result');
    for (const toolResult of toolResults) {
      result.push({
        role: 'tool',
        tool_call_id: toolResult.tool_use_id,
        content: mapContentToOpenAI(toolResult.content),
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
  if (typeof message.reasoning_content === 'string') {
    content.push({ type: 'thinking', thinking: message.reasoning_content, signature: '' });
  }
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

const isModelUnavailableError = (error) => {
  const status = Number(error?.status || error?.statusCode);
  return status === 404 || (!status && /not found the model|model[^\n]*not found|permission denied/i.test(String(error?.message || '')));
};

const createMessageWithClient = async ({
  payload,
  client,
  defaultModel,
  fallbackModel,
  temperature = 0.2,
  modelOptions = aiService.getAIModelOptions(),
}) => {
  const requestedModel = modelOptions.model || payload?.model || defaultModel;
  const messages = mapAnthropicMessagesToOpenAI(payload || {}, modelOptions);
  const tools = mapAnthropicToolsToOpenAI(payload?.tools);
  const candidates = Array.from(new Set([requestedModel, modelOptions.model || fallbackModel].filter(Boolean)));
  const requestOptions = aiService.getAIRequestOptions();

  let lastError;
  for (const [index, model] of candidates.entries()) {
    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: tools?.length ? 'auto' : undefined,
        ...(modelOptions.thinking ? {} : { temperature }),
        max_tokens: payload?.max_tokens || 4096,
        stream: false,
        ...modelOptions,
      }, requestOptions);

      return mapKimiResponseToAnthropic({ response, model });
    } catch (error) {
      lastError = error;
      const canTryFallback = index < candidates.length - 1 && isModelUnavailableError(error);
      if (!canTryFallback) throw error;
      console.warn(`AI 模型不可用，自动切换稳定模型（${model} -> ${candidates[index + 1]}）`);
    }
  }

  throw lastError || new Error('未配置可用的 AI 模型');
};

const createMessage = async (payload) => {
  const { defaultModel, temperature } = await aiService.getConfiguredModels();

  const client = await aiService.getOpenAIClient();
  if (!client) throw createError('AI 服务未配置或当前运行环境禁用外部调用', 503);
  return createMessageWithClient({
    payload,
    client,
    defaultModel,
    temperature,
    fallbackModel: aiService.MODELS.fast,
  });
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
  createMessageWithClient,
  countTokens,
  mapAnthropicMessagesToOpenAI,
  mapKimiResponseToAnthropic,
  isModelUnavailableError,
};
