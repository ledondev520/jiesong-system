/**
 * Input: SystemConfig, User, Notification
 * Output: 经营执行中台任务提醒处理器
 * Pos: 定时扫描到期任务提醒并生成通知
 */

const prisma = require('../utils/prisma');
const { NOTIFICATION_TYPE } = require('../config/constants');

const TASK_CONFIG_KEY = 'ops_execution_tasks';

const safeParseTasks = (value) => {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveTasks = async (tx, tasks) => {
  await tx.systemConfig.upsert({
    where: { key: TASK_CONFIG_KEY },
    create: {
      key: TASK_CONFIG_KEY,
      value: JSON.stringify(tasks),
      note: '经营执行中台任务提醒引擎任务数据',
    },
    update: {
      value: JSON.stringify(tasks),
      note: '经营执行中台任务提醒引擎任务数据',
    },
  });
};

const buildNotificationRows = (task, users, stage, now) => (
  users.map((user) => ({
    userId: user.id,
    type: NOTIFICATION_TYPE.TASK_REMINDER,
    title: `任务提醒：${task.title}`,
    content: [
      `责任人：${task.assigneeName}`,
      `优先级：${task.priority}`,
      `阶段：${stage === 'first' ? '首次提醒' : '二次提醒'}`,
      `截止时间：${task.dueAt}`,
    ].join('\n'),
    metadata: JSON.stringify({
      taskId: task.id,
      stage,
      assigneeName: task.assigneeName,
      dueAt: task.dueAt,
      sentAt: now.toISOString(),
    }),
  }))
);

const processDueTaskReminders = async (tx = prisma, options = {}) => {
  const now = options.now instanceof Date ? options.now : new Date();
  const config = await tx.systemConfig.findUnique({
    where: { key: TASK_CONFIG_KEY },
  });
  const tasks = safeParseTasks(config?.value);

  if (tasks.length === 0) {
    return {
      processed: 0,
      created: 0,
    };
  }

  let processed = 0;
  let created = 0;
  const nextTasks = tasks.slice();

  for (let index = 0; index < nextTasks.length; index += 1) {
    const task = nextTasks[index];
    if (task.status === 'DONE') {
      continue;
    }

    const dueStages = [];
    if (!task.firstReminderSentAt && task.remindAt && new Date(task.remindAt) <= now) {
      dueStages.push('first');
    }
    if (!task.secondReminderSentAt && task.secondRemindAt && new Date(task.secondRemindAt) <= now) {
      dueStages.push('second');
    }

    if (dueStages.length === 0) {
      continue;
    }

    const users = await tx.user.findMany({
      where: {
        isActive: true,
        OR: [
          { name: task.assigneeName },
          { username: task.assigneeName },
        ],
      },
      select: {
        id: true,
        name: true,
        username: true,
      },
    });

    for (const stage of dueStages) {
      if (users.length > 0) {
        const rows = buildNotificationRows(task, users, stage, now);
        await tx.notification.createMany({ data: rows });
        created += rows.length;
      }

      if (stage === 'first') {
        nextTasks[index] = { ...nextTasks[index], firstReminderSentAt: now.toISOString(), updatedAt: now.toISOString() };
      } else {
        nextTasks[index] = { ...nextTasks[index], secondReminderSentAt: now.toISOString(), updatedAt: now.toISOString() };
      }
      processed += 1;
    }
  }

  await saveTasks(tx, nextTasks);

  return {
    processed,
    created,
  };
};

module.exports = {
  processDueTaskReminders,
};
