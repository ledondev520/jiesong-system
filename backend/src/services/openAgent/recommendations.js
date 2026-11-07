/**
 * Input: 工具或诊断产出的建议项
 * Output: 规范化、去重并限量的操作建议
 * Pos: openAgentService 的建议子模块；诊断与门面共用，避免循环依赖
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const ACTION_RECOMMENDATIONS_LIMIT = 20;

const normalizeActionRecommendation = (item, fallback = {}) => {
  if (!item || typeof item !== 'object') return null;
  const priority = ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium';
  const executionMode = item.executionMode === 'confirmable_write' ? 'confirmable_write' : 'manual';
  const normalized = {
    code: String(item.code || fallback.code || '').trim(),
    title: String(item.title || fallback.title || '').trim(),
    domain: String(item.domain || fallback.domain || 'ops').trim(),
    priority,
    executionMode,
    reason: String(item.reason || fallback.reason || '').trim(),
    actionType: item.actionType ? String(item.actionType).trim() : null,
    params: item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : null,
    sourceTool: String(item.sourceTool || fallback.sourceTool || '').trim() || null,
  };
  if (!normalized.code || !normalized.title) return null;
  return normalized;
};

const summarizeActionRecommendations = (items = []) => {
  const deduped = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const normalized = normalizeActionRecommendation(item);
    if (!normalized) return;
    const key = [normalized.code, normalized.actionType || '', normalized.reason || ''].join('::');
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  });
  return Array.from(deduped.values()).slice(0, ACTION_RECOMMENDATIONS_LIMIT);
};

const buildActionRecommendation = (item) => normalizeActionRecommendation(item);

module.exports = { normalizeActionRecommendation, summarizeActionRecommendations, buildActionRecommendation };
