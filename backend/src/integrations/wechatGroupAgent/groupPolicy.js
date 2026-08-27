'use strict';

const parseGroupAllowlist = (value = process.env.WECHAT_GROUP_AGENT_GROUP_ALLOWLIST || '') => (
  String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean)
);

const assertAllowedGroup = (groupName, allowedGroups = parseGroupAllowlist()) => {
  const normalized = String(groupName || '').trim();
  if (!normalized) throw new Error('groupName is required');
  if (!allowedGroups.includes(normalized)) {
    throw new Error('group is not in WECHAT_GROUP_AGENT_GROUP_ALLOWLIST');
  }
  return normalized;
};

const normalizeTitle = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const assertSnapshotMatchesGroup = (snapshot, groupName) => {
  const observations = Array.isArray(snapshot?.observations) ? snapshot.observations : [];
  const matched = observations.some((item) => {
    const box = item.boundingBox || item.box || {};
    const x = Number(box.x ?? item.x ?? 0);
    const y = Number(box.y ?? item.y ?? 0);
    const text = normalizeTitle(item.text || item.value);
    if (x < 0.25 || y < 0.88) return false;
    return text === groupName || text.startsWith(`${groupName}(`) || text.startsWith(`${groupName}（`);
  });
  if (!matched) throw new Error('visible WeChat title does not match the allowed group');
  return true;
};

module.exports = {
  parseGroupAllowlist,
  assertAllowedGroup,
  assertSnapshotMatchesGroup,
};
