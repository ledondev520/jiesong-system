/**
 * Input: messageBuilder
 * Output: AI 消息构造工具测试
 * Pos: 后端 AI 服务测试
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getSystemPrompt,
  buildMessageFromHistory,
  buildUserMessage,
  buildChatMessages,
  hasImageInHistory,
} = require('./messageBuilder');

test('getSystemPrompt: 包含核心业务提示词', () => {
  const prompt = getSystemPrompt();
  assert.equal(prompt.includes('捷淞进销存系统'), true);
  assert.equal(prompt.includes('售价(USD)'), true);
});

test('buildMessageFromHistory: 用户含图片历史转换为多模态消息', () => {
  const message = buildMessageFromHistory({
    role: 'user',
    content: '这是图片内容',
    imageUrl: 'https://img.test/demo.png',
  });

  assert.equal(message.role, 'user');
  assert.equal(Array.isArray(message.content), true);
  assert.deepEqual(message.content[1], {
    type: 'image_url',
    image_url: { url: 'https://img.test/demo.png' },
  });
});

test('buildUserMessage: 有图与无图场景', () => {
  const withImage = buildUserMessage('请识别', 'https://img.test/a.png');
  const withoutImage = buildUserMessage('仅文本');

  assert.equal(Array.isArray(withImage.content), true);
  assert.equal(withoutImage.content, '仅文本');
});

test('buildChatMessages / hasImageInHistory: 组装完整消息序列', () => {
  const history = [
    { role: 'assistant', content: '上次回复' },
    { role: 'user', content: '历史图片', imageUrl: 'https://img.test/old.png' },
  ];
  const messages = buildChatMessages({
    message: '本次提问',
    imageUrl: '',
    history,
    dbContext: '\n【数据库参考信息】\n测试',
  });

  assert.equal(hasImageInHistory(history), true);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[0].content.includes('数据库参考信息'), true);
  assert.equal(messages[messages.length - 1].content, '本次提问');
});
