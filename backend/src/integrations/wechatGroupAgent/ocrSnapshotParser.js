'use strict';

const crypto = require('node:crypto');

const DEFAULT_IGNORED = new Set([
  '搜索', '聊天', '通讯录', '收藏', '朋友圈', '视频号', '公众号', '服务号',
]);

const observationText = (item) => String(item.text || item.value || '').replace(/\s+/g, ' ').trim();

const toMessageCandidate = (item, { groupName, capturedAt }) => {
  const text = observationText(item);
  const box = item.boundingBox || item.box || {};
  const x = Number(box.x ?? item.x ?? 0);
  const y = Number(box.y ?? item.y ?? 0);
  const width = Number(box.width ?? item.width ?? 0);
  const centerX = x + (width / 2);
  const isOwn = centerX >= 0.68;
  return {
    groupName,
    sender: isOwn ? '我' : '待识别成员',
    kind: 'text',
    text,
    isOwn,
    capturedAt,
    source: 'macos-vision-ocr',
    sourceFingerprint: crypto.createHash('sha256')
      .update(`${text}\0${x.toFixed(2)}\0${y.toFixed(2)}`)
      .digest('hex'),
  };
};

const parseOcrSnapshot = (snapshot, {
  groupName,
  capturedAt = snapshot?.capturedAt || new Date().toISOString(),
  minChatX = 0.30,
  minY = 0.10,
  maxY = 0.87,
} = {}) => {
  if (!groupName) throw new Error('groupName is required');
  const observations = Array.isArray(snapshot) ? snapshot : snapshot.observations;
  if (!Array.isArray(observations)) throw new Error('snapshot observations are required');

  return observations
    .map((item) => ({ item, text: observationText(item) }))
    .filter(({ text }) => text && !DEFAULT_IGNORED.has(text))
    .filter(({ item }) => {
      const box = item.boundingBox || item.box || {};
      const x = Number(box.x ?? item.x ?? 0);
      const y = Number(box.y ?? item.y ?? 0);
      return x >= minChatX && y >= minY && y <= maxY;
    })
    .sort((a, b) => {
      const ay = Number((a.item.boundingBox || a.item.box || {}).y ?? a.item.y ?? 0);
      const by = Number((b.item.boundingBox || b.item.box || {}).y ?? b.item.y ?? 0);
      return by - ay;
    })
    .map(({ item }) => toMessageCandidate(item, { groupName, capturedAt }));
};

module.exports = {
  parseOcrSnapshot,
  observationText,
};
