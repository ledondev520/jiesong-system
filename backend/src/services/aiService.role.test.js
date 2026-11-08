/**
 * Input: 桩化的 chatOrchestrator.buildChatSession / prisma（不触网）
 * Output: aiService.chat 与 chatStream 把调用方 role 逐跳传到 buildChatSession 的回归
 * Pos: PR #210 re-review P2-A（hop 2/3）：chat→resolveChatResult→runChatSession→buildChatSession，以及 chatStream 的同一链
 *
 * Note: 默认 role=null 即显示金额，丢任何一跳都会让 WAREHOUSE 聊天重新看到金额；这里用哨兵异常在 buildChatSession 处截断。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');

// 必须在加载 aiService 之前桩化：aiService 在加载时解构 buildChatSession。
const orchestrator = require('./ai/chatOrchestrator');
const seen = [];
orchestrator.buildChatSession = async (args) => { seen.push(args.role); throw new Error('stop-after-role-capture'); };
prisma.systemConfig.findMany = async () => [];
prisma.systemConfig.findUnique = async () => null;
const aiService = require('./aiService');

test('aiService.chat / chatStream: role 到达 buildChatSession', async () => {
  for (const role of ['WAREHOUSE', 'SALES']) {
    seen.length = 0;
    await assert.rejects(() => aiService.chat('u1', 's1', '应付', null, role), /stop-after-role-capture/);
    await assert.rejects(() => aiService.chatStream('u1', 's1', '应付', null, () => {}, () => {}, role), /stop-after-role-capture/);
    assert.deepEqual(seen, [role, role], role);
  }
});
