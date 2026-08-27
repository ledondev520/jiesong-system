'use strict';

const SUMMARY_KEYWORDS = [
  '总结一下',
  '总结下',
  '帮我总结',
  '群聊总结',
  '需求总结',
];

const normalizeText = (value) => String(value || '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const detectSummaryTrigger = (text) => {
  const normalized = normalizeText(text);
  const keyword = SUMMARY_KEYWORDS.find((candidate) => normalized.includes(candidate));
  if (!keyword) {
    return { matched: false, normalized, keyword: null, scope: null };
  }

  let scope = 'recent';
  if (/(今天|今日|当天)/.test(normalized)) scope = 'today';
  if (/(全部|所有|完整)/.test(normalized)) scope = 'all';

  return { matched: true, normalized, keyword, scope };
};

module.exports = {
  SUMMARY_KEYWORDS,
  normalizeText,
  detectSummaryTrigger,
};
