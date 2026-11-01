/**
 * Input: 聊天消息文本（前端 withPageContext 可能在用户原文前附一行「【当前页面：…】」）
 * Output: stripPageContext —— 去掉开头那一行页面上下文，只保留用户原文
 * Pos: AI 面板恢复历史与会话记录页共用；后端会话预览有同样规则（backend/src/utils/pageContext.js）。页面上下文本身的生成见 ai-page-context.ts
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export const stripPageContext = (content: string) =>
  content.replace(/^【当前页面：[^】\n]*】\r?\n/, "");
