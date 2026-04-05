/**
 * Input: migration repository rows、applied rows、repair plan
 * Output: Prisma migration 健康度报告
 * Pos: 后端服务层
 */

const buildMigrationHealthReport = ({
  repositoryMigrations = [],
  appliedRows = [],
  repairPlan = [],
} = {}) => {
  const appliedMap = new Map(appliedRows.map((row) => [row.migrationName, row]));
  const repairMap = new Map(repairPlan.map((step) => [step.migrationName, step]));

  const items = repositoryMigrations.map((migration) => {
    const applied = appliedMap.get(migration.migrationName);
    const repair = repairMap.get(migration.migrationName) || null;

    if (repair) {
      return {
        migrationName: migration.migrationName,
        status: 'repaired',
        repairAction: repair.type,
      };
    }

    if (applied?.finishedAt && !applied?.rolledBackAt) {
      return {
        migrationName: migration.migrationName,
        status: 'applied',
        repairAction: null,
      };
    }

    if (applied && !applied.finishedAt && !applied.rolledBackAt) {
      return {
        migrationName: migration.migrationName,
        status: 'blocking',
        repairAction: null,
      };
    }

    const isPending = !applied;
    return {
      migrationName: migration.migrationName,
      status: isPending ? 'pending' : 'blocking',
      repairAction: null,
    };
  });

  const summary = {
    totalRepositoryMigrations: items.length,
    appliedCount: items.filter((item) => item.status === 'applied').length,
    repairedCount: items.filter((item) => item.status === 'repaired').length,
    pendingCount: items.filter((item) => item.status === 'pending').length,
    blockingCount: items.filter((item) => item.status === 'blocking').length,
  };

  const status = summary.blockingCount > 0
    ? 'warning'
    : summary.pendingCount > 0
      ? 'pending'
      : 'healthy';

  return {
    status,
    summary,
    items,
  };
};

module.exports = {
  buildMigrationHealthReport,
};
