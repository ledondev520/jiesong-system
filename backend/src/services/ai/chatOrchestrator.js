const prisma = require('../../utils/prisma');
const { getDbContext } = require('./contextService');
const { buildChatMessages, hasImageInHistory } = require('./messageBuilder');

const buildChatSession = async ({
  userId,
  sessionId,
  message,
  imageUrl,
  defaultModel,
  visionModel,
  thinkingModel,
  useThinkingModel = false,
}) => {
  const [history, dbContext] = await Promise.all([
    prisma.chatHistory.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'asc' },
      take: 10,
    }),
    getDbContext(message),
  ]);

  const messages = buildChatMessages({ message, imageUrl, history, dbContext });
  const needsVision = Boolean(imageUrl || hasImageInHistory(history));

  let model = needsVision ? visionModel : defaultModel;
  if (useThinkingModel) {
    model = needsVision ? visionModel : (thinkingModel || defaultModel);
  }

  return {
    history,
    messages,
    model,
    needsVision,
  };
};

module.exports = {
  buildChatSession,
};
