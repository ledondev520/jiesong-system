/**
 * 职责：流式调用聊天补全并聚合正文与推理分片
 * 参数：temperature / maxTokens 可选；未传时非思考模型 temperature=0.6，思考模型 temperature=1.0
 * 思考模型 max_tokens 取 max(16000, 配置的 maxTokens)，非思考模型仅在有 maxTokens 时传入
 */
const collectStreamedChat = async ({
  client,
  model,
  messages,
  onChunk,
  onThinking,
  isThinkingModel = false,
  temperature: temperatureOverride,
  maxTokens: maxTokensOverride,
}) => {
  const temperature = isThinkingModel
    ? (temperatureOverride !== undefined ? temperatureOverride : 1.0)
    : (temperatureOverride !== undefined ? temperatureOverride : 0.6);

  let max_tokens;
  if (isThinkingModel) {
    const base = maxTokensOverride !== undefined && Number.isFinite(Number(maxTokensOverride))
      ? Number(maxTokensOverride)
      : 16000;
    max_tokens = Math.max(16000, base);
  } else if (maxTokensOverride !== undefined && Number.isFinite(Number(maxTokensOverride))) {
    max_tokens = Number(maxTokensOverride);
  }

  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature,
    ...(max_tokens !== undefined ? { max_tokens } : {}),
    stream: true,
  });

  let fullContent = '';
  let thinkingContent = '';

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;

    if (delta && Object.prototype.hasOwnProperty.call(delta, 'reasoning_content')) {
      const reasoning = delta.reasoning_content;
      if (reasoning) {
        thinkingContent += reasoning;
        if (onThinking) {
          onThinking(reasoning);
        }
      }
    }

    if (delta?.content) {
      fullContent += delta.content;
      if (onChunk) {
        onChunk(delta.content);
      }
    }
  }

  return {
    fullContent,
    thinkingContent,
  };
};

module.exports = {
  collectStreamedChat,
};
