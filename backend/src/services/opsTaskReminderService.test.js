/**
 * Input: opsTaskReminderService、prisma
 * Output: 任务提醒引擎服务测试
 * Pos: 验证到期提醒会生成通知并回写发送状态
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const prisma = require('../utils/prisma');
const { processDueTaskReminders } = require('./opsTaskReminderService');

test('processDueTaskReminders: 命中到期提醒后创建通知并更新发送时间', async () => {
  const originalSystemConfigFindUnique = prisma.systemConfig.findUnique;
  const originalSystemConfigUpsert = prisma.systemConfig.upsert;
  const originalUserFindMany = prisma.user.findMany;
  const originalNotificationCreateMany = prisma.notification.createMany;

  let capturedUpsertArgs = null;
  let capturedCreateManyArgs = null;

  prisma.systemConfig.findUnique = async () => ({
    key: 'ops_execution_tasks',
    value: JSON.stringify([
      {
        id: 'task-1',
        title: '跟进 EXP001 未发货',
        assigneeName: '小周',
        priority: 'HIGH',
        status: 'TODO',
        dueAt: '2026-03-16T10:00:00.000Z',
        remindAt: '2026-03-16T08:00:00.000Z',
        secondRemindAt: '2026-03-16T11:00:00.000Z',
        firstReminderSentAt: null,
        secondReminderSentAt: null,
        createdAt: '2026-03-15T10:00:00.000Z',
        updatedAt: '2026-03-15T10:00:00.000Z',
      },
    ]),
  });
  prisma.systemConfig.upsert = async (args) => {
    capturedUpsertArgs = args;
    return args.update;
  };
  prisma.user.findMany = async () => ([
    { id: 'user-1', name: '小周', username: 'xiaozhou' },
  ]);
  prisma.notification.createMany = async (args) => {
    capturedCreateManyArgs = args;
    return { count: args.data.length };
  };

  try {
    const result = await processDueTaskReminders(prisma, {
      now: new Date('2026-03-16T08:30:00.000Z'),
    });

    assert.equal(result.processed, 1);
    assert.equal(result.created, 1);
    assert.ok(capturedCreateManyArgs);
    assert.equal(capturedCreateManyArgs.data[0].userId, 'user-1');
    assert.match(capturedCreateManyArgs.data[0].title, /任务提醒/);

    const updatedTasks = JSON.parse(capturedUpsertArgs.update.value);
    assert.ok(updatedTasks[0].firstReminderSentAt);
  } finally {
    prisma.systemConfig.findUnique = originalSystemConfigFindUnique;
    prisma.systemConfig.upsert = originalSystemConfigUpsert;
    prisma.user.findMany = originalUserFindMany;
    prisma.notification.createMany = originalNotificationCreateMany;
  }
});
