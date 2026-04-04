/**
 * Input: PrismaClient, 各业务服务, eventLedgerService, SystemConfig
 * Output: 定时巡检 + 事件驱动告警 + 可自动修复的执行器
 * Pos: 自进化Agent核心——业务数据巡检、系统健康检查、异常自动修复
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const prisma = require('../utils/prisma');

const PATROL_CATEGORIES = {
  BUSINESS: 'BUSINESS',
  SYSTEM: 'SYSTEM',
};

const SEVERITY = {
  INFO: 'INFO',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
};

const AUTO_FIX_POLICY = {
  AUTO: 'AUTO',
  CONFIRM: 'CONFIRM',
  REPORT_ONLY: 'REPORT_ONLY',
};

/**
 * 职责：运行所有业务巡检规则，返回发现列表
 * 思路：
 *   1. 应收账款超期检查
 *   2. 合同状态一致性检查
 *   3. 库存异常检查
 * @returns {Promise<Array<PatrolFinding>>}
 */
const runBusinessPatrol = async () => {
  const findings = [];
  const now = new Date();

  // 1. 应收账款超期检查（超过 90 天未回款的出口合同）
  try {
    const overdueContracts = await prisma.exportContract.findMany({
      where: {
        status: { in: ['SHIPPED', 'DELIVERED'] },
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        createdAt: { lt: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        contractNo: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        buyerName: true,
      },
    });

    for (const c of overdueContracts) {
      const outstanding = (Number(c.totalAmount) || 0) - (Number(c.paidAmount) || 0);
      const daysSince = Math.floor((now.getTime() - new Date(c.createdAt).getTime()) / (24 * 60 * 60 * 1000));
      findings.push({
        category: PATROL_CATEGORIES.BUSINESS,
        severity: daysSince > 180 ? SEVERITY.CRITICAL : SEVERITY.WARNING,
        rule: 'OVERDUE_RECEIVABLE',
        title: `应收账款超期：${c.contractNo}`,
        detail: `合同 ${c.contractNo}（${c.buyerName || ''}）已 ${daysSince} 天未完成回款，未收金额 $${outstanding.toFixed(2)}`,
        entityType: 'ExportContract',
        entityId: c.id,
        autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
      });
    }
  } catch (err) {
    findings.push({
      category: PATROL_CATEGORIES.BUSINESS,
      severity: SEVERITY.WARNING,
      rule: 'PATROL_ERROR',
      title: '应收账款巡检失败',
      detail: err.message,
      autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
    });
  }

  // 2. 合同状态一致性（已发货但无报关单的合同）
  try {
    const shippedWithoutDeclaration = await prisma.exportContract.findMany({
      where: {
        status: 'SHIPPED',
        customsDeclarations: { none: {} },
        updatedAt: { lt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, contractNo: true },
    });

    for (const c of shippedWithoutDeclaration) {
      findings.push({
        category: PATROL_CATEGORIES.BUSINESS,
        severity: SEVERITY.WARNING,
        rule: 'SHIPPED_NO_DECLARATION',
        title: `已发货但无报关单：${c.contractNo}`,
        detail: `合同 ${c.contractNo} 已标记发货超过 7 天，但未关联任何报关单`,
        entityType: 'ExportContract',
        entityId: c.id,
        autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
      });
    }
  } catch (err) {
    findings.push({
      category: PATROL_CATEGORIES.BUSINESS,
      severity: SEVERITY.WARNING,
      rule: 'PATROL_ERROR',
      title: '合同状态巡检失败',
      detail: err.message,
      autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
    });
  }

  // 3. 支付记录异常（已分配金额 > 合同总金额）
  try {
    const contracts = await prisma.exportContract.findMany({
      where: { totalAmount: { gt: 0 } },
      select: { id: true, contractNo: true, totalAmount: true, paidAmount: true },
    });

    for (const c of contracts) {
      const total = Number(c.totalAmount) || 0;
      const paid = Number(c.paidAmount) || 0;
      if (paid > total * 1.01) {
        findings.push({
          category: PATROL_CATEGORIES.BUSINESS,
          severity: SEVERITY.CRITICAL,
          rule: 'OVERPAYMENT',
          title: `超额支付：${c.contractNo}`,
          detail: `合同 ${c.contractNo} 已分配 $${paid.toFixed(2)} 超过合同金额 $${total.toFixed(2)}`,
          entityType: 'ExportContract',
          entityId: c.id,
          autoFixPolicy: AUTO_FIX_POLICY.CONFIRM,
        });
      }
    }
  } catch (err) {
    findings.push({
      category: PATROL_CATEGORIES.BUSINESS,
      severity: SEVERITY.WARNING,
      rule: 'PATROL_ERROR',
      title: '支付异常巡检失败',
      detail: err.message,
      autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
    });
  }

  return findings;
};

/**
 * 职责：运行系统健康巡检
 * 思路：
 *   1. 数据库连接检查
 *   2. 过期会话清理（可自动修复）
 *   3. 系统配置完整性检查
 * @returns {Promise<Array<PatrolFinding>>}
 */
const runSystemPatrol = async () => {
  const findings = [];

  // 1. 数据库连接检查
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const latencyMs = Date.now() - t0;
    if (latencyMs > 1000) {
      findings.push({
        category: PATROL_CATEGORIES.SYSTEM,
        severity: SEVERITY.WARNING,
        rule: 'DB_SLOW',
        title: '数据库响应缓慢',
        detail: `数据库查询延迟 ${latencyMs}ms（阈值 1000ms）`,
        autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
      });
    }
  } catch (err) {
    findings.push({
      category: PATROL_CATEGORIES.SYSTEM,
      severity: SEVERITY.CRITICAL,
      rule: 'DB_DOWN',
      title: '数据库连接失败',
      detail: err.message,
      autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
    });
  }

  // 2. 过期会话清理（30天前的聊天历史 token 碎片，可自动执行）
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const staleSessionCount = await prisma.chatHistory.count({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    if (staleSessionCount > 500) {
      findings.push({
        category: PATROL_CATEGORIES.SYSTEM,
        severity: SEVERITY.INFO,
        rule: 'STALE_SESSIONS',
        title: `存在 ${staleSessionCount} 条过期聊天记录`,
        detail: `30 天前的聊天记录有 ${staleSessionCount} 条，建议清理以优化性能`,
        autoFixPolicy: AUTO_FIX_POLICY.CONFIRM,
        autoFixAction: 'CLEANUP_STALE_SESSIONS',
      });
    }
  } catch {
    /* non-critical */
  }

  // 3. 系统配置完整性检查
  try {
    const requiredKeys = ['exchangeRate', 'profitRate'];
    const configs = await prisma.systemConfig.findMany({
      where: { key: { in: requiredKeys } },
      select: { key: true, value: true, updatedAt: true },
    });
    const configMap = Object.fromEntries(configs.map((c) => [c.key, c]));

    for (const key of requiredKeys) {
      if (!configMap[key]) {
        findings.push({
          category: PATROL_CATEGORIES.SYSTEM,
          severity: SEVERITY.CRITICAL,
          rule: 'MISSING_CONFIG',
          title: `缺失系统配置：${key}`,
          detail: `系统配置 ${key} 不存在，可能影响核心业务计算`,
          autoFixPolicy: AUTO_FIX_POLICY.CONFIRM,
        });
      }
    }

    if (configMap.exchangeRate) {
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(configMap.exchangeRate.updatedAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      if (daysSinceUpdate > 7) {
        findings.push({
          category: PATROL_CATEGORIES.SYSTEM,
          severity: SEVERITY.WARNING,
          rule: 'STALE_EXCHANGE_RATE',
          title: '汇率配置过期',
          detail: `系统汇率已 ${daysSinceUpdate} 天未更新，当前值：${configMap.exchangeRate.value}`,
          autoFixPolicy: AUTO_FIX_POLICY.CONFIRM,
        });
      }
    }
  } catch (err) {
    findings.push({
      category: PATROL_CATEGORIES.SYSTEM,
      severity: SEVERITY.WARNING,
      rule: 'PATROL_ERROR',
      title: '配置完整性巡检失败',
      detail: err.message,
      autoFixPolicy: AUTO_FIX_POLICY.REPORT_ONLY,
    });
  }

  return findings;
};

/**
 * 职责：将巡检结果写入通知 + 操作日志
 * @param {Array<PatrolFinding>} findings
 * @returns {Promise<{ total: number, notified: number }>}
 */
const persistPatrolFindings = async (findings) => {
  if (findings.length === 0) return { total: 0, notified: 0 };

  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', status: 'active' },
    select: { id: true },
  });

  const notifications = [];
  for (const finding of findings) {
    if (finding.severity === SEVERITY.INFO) continue;

    for (const admin of admins) {
      notifications.push({
        userId: admin.id,
        type: 'PATROL_ALERT',
        title: finding.title,
        content: finding.detail,
        metadata: JSON.stringify({
          category: finding.category,
          severity: finding.severity,
          rule: finding.rule,
          entityType: finding.entityType,
          entityId: finding.entityId,
          autoFixPolicy: finding.autoFixPolicy,
        }),
      });
    }
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }

  // 写入操作日志
  try {
    await prisma.operationLog.create({
      data: {
        action: 'PATROL_RUN',
        entity: 'System',
        entityId: 'patrol',
        userId: 'system',
        detail: JSON.stringify({
          totalFindings: findings.length,
          critical: findings.filter((f) => f.severity === SEVERITY.CRITICAL).length,
          warning: findings.filter((f) => f.severity === SEVERITY.WARNING).length,
          info: findings.filter((f) => f.severity === SEVERITY.INFO).length,
          rules: [...new Set(findings.map((f) => f.rule))],
        }),
      },
    });
  } catch {
    /* best effort */
  }

  return { total: findings.length, notified: notifications.length };
};

/**
 * 职责：自动修复执行器注册表
 * 思路：key = autoFixAction 名称，value = async (finding) => fixResult
 * 可自动执行的操作（AUTO policy）会直接运行；CONFIRM 的会创建通知等待管理员确认
 */
const AUTO_FIX_EXECUTORS = {
  CLEANUP_STALE_SESSIONS: async (_finding) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const { count } = await prisma.chatHistory.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    });
    return { success: true, detail: `已清理 ${count} 条过期聊天记录` };
  },
};

/**
 * 职责：对 AUTO policy 的 finding 执行自动修复
 * @param {Array<PatrolFinding>} findings
 * @returns {Promise<Array<{ rule: string, success: boolean, detail: string }>>}
 */
const executeAutoFixes = async (findings) => {
  const results = [];
  const autoFixable = findings.filter(
    (f) => f.autoFixPolicy === AUTO_FIX_POLICY.AUTO && f.autoFixAction
  );

  for (const finding of autoFixable) {
    const executor = AUTO_FIX_EXECUTORS[finding.autoFixAction];
    if (!executor) continue;

    try {
      const result = await executor(finding);
      results.push({ rule: finding.rule, ...result });

      await prisma.operationLog.create({
        data: {
          action: 'PATROL_AUTO_FIX',
          entity: finding.entityType || 'System',
          entityId: finding.entityId || 'patrol',
          userId: 'system',
          detail: JSON.stringify({
            rule: finding.rule,
            autoFixAction: finding.autoFixAction,
            result,
          }),
        },
      });
    } catch (err) {
      results.push({ rule: finding.rule, success: false, detail: err.message });
    }
  }

  return results;
};

/**
 * 职责：执行完整巡检周期（业务 + 系统 -> 自动修复 -> 持久化 -> 返回摘要）
 * @returns {Promise<PatrolRunResult>}
 */
const runFullPatrol = async () => {
  const t0 = Date.now();
  const [bizFindings, sysFindings] = await Promise.all([
    runBusinessPatrol(),
    runSystemPatrol(),
  ]);
  const allFindings = [...bizFindings, ...sysFindings];

  // 自动修复可以直接处理的问题
  const fixResults = await executeAutoFixes(allFindings);

  const { total, notified } = await persistPatrolFindings(allFindings);
  const durationMs = Date.now() - t0;

  console.log(
    `[patrol-service] run completed: findings=${total}, notified=${notified}, autoFixes=${fixResults.length}, duration=${durationMs}ms`
  );

  return {
    findings: allFindings,
    total,
    notified,
    autoFixes: fixResults,
    durationMs,
  };
};

module.exports = {
  PATROL_CATEGORIES,
  SEVERITY,
  AUTO_FIX_POLICY,
  AUTO_FIX_EXECUTORS,
  runBusinessPatrol,
  runSystemPatrol,
  persistPatrolFindings,
  executeAutoFixes,
  runFullPatrol,
};
