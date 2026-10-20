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

const normalizeTitleKey = (value) => String(value || '')
  .normalize('NFKC')
  .toLocaleLowerCase('zh-CN')
  .replace(/[^\p{L}\p{N}]/gu, '');

const assertSnapshotMatchesGroup = (snapshot, groupName) => {
  const observations = Array.isArray(snapshot?.observations) ? snapshot.observations : [];
  const expected = normalizeTitleKey(groupName);
  if (expected.length < 6) throw new Error('allowed group title anchor is too short');
  const titleLine = observations
    .filter((item) => {
      const box = item.boundingBox || item.box || {};
      return Number(box.x ?? item.x ?? 0) >= 0.25 && Number(box.y ?? item.y ?? 0) >= 0.92;
    })
    .sort((a, b) => {
      const aBox = a.boundingBox || a.box || {};
      const bBox = b.boundingBox || b.box || {};
      return Number(aBox.x ?? a.x ?? 0) - Number(bBox.x ?? b.x ?? 0);
    })
    .map((item) => item.text || item.value || '')
    .join(' ');
  const matched = normalizeTitleKey(titleLine).includes(expected);
  if (!matched) throw new Error('visible WeChat title does not match the allowed group');
  return true;
};

module.exports = {
  parseGroupAllowlist,
  assertAllowedGroup,
  assertSnapshotMatchesGroup,
  normalizeTitleKey,
};
