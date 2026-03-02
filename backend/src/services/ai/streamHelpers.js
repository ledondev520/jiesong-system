const collectStreamedChat = async ({
  client,
  model,
  messages,
  onChunk,
  onThinking,
  isThinkingModel = false,
}) => {
  const stream = await client.chat.completions.create({
    model,
    messages,
    temperature: isThinkingModel ? 1.0 : 0.6,
    max_tokens: isThinkingModel ? 16000 : undefined,
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
