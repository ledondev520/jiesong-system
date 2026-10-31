/**
 * Input: 聊天消息文本（前端 withPageContext 可能在用户原文前附一行「【当前页面：…】」）
 * Output: stripPageContext —— 去掉开头那一行页面上下文，只保留用户原文
 * Pos: 会话预览等展示用途；存库的原始 content 不改，模型仍能看到页面上下文
 * 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
const PAGE_CONTEXT_PREFIX = /^【当前页面：[^】\n]*】\r?\n/;

const stripPageContext = (text) => (typeof text === 'string' ? text.replace(PAGE_CONTEXT_PREFIX, '') : text);

module.exports = { stripPageContext };
