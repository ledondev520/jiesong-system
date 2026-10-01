/**
 * 职责：流式调用聊天补全并聚合正文、推理分片与上游 usage，转交 SDK deadline
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
  requestOptions,
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
    stream_options: { include_usage: true },
  }, requestOptions);

  let fullContent = '';
  let thinkingContent = '';
  let tokenUsage = null;

  try {
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta;
      if (chunk.usage) {
        tokenUsage = { promptTokens: chunk.usage.prompt_tokens, outputTokens: chunk.usage.completion_tokens };
      }

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
    // SDK 会吞掉 AbortError，不能把 deadline 中断的半截结果当作完成。
    requestOptions?.signal?.throwIfAborted();
  } catch (error) {
    stream.controller?.abort();
    throw error;
  }

  return {
    fullContent,
    thinkingContent,
    tokenUsage,
  };
};

module.exports = {
  collectStreamedChat,
};
