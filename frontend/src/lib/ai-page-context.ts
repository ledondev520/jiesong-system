/**
 * Input: 当前路径（不含查询参数）
 * Output: 随 AI 提问附带的页面上下文：路由与记录 id
 * Pos: AI 停靠面板；/dashboard/<模块>/<id> 形态的详情页取 id，new/create/edit 等动作页不取
 */
import type { AIPageContext } from "@/components/ai/AIAssistant";

// 只有这些模块的第三段是记录 id；finance/settings 等的第三段是子页面名
const DETAIL_MODULES = new Set([
  "purchases",
  "sales",
  "customs",
  "tax-refunds",
  "suppliers",
  "products",
  "customers",
]);
const ACTION_SEGMENTS = new Set(["new", "create", "edit"]);

export function getAiPageContext(pathname: string): AIPageContext {
  const segments = pathname.split("/").filter(Boolean);
  // ["dashboard", "<module>", "<id>", ...]
  const candidate =
    segments[0] === "dashboard" && DETAIL_MODULES.has(segments[1])
      ? segments[2]
      : undefined;
  const recordId =
    candidate && !ACTION_SEGMENTS.has(candidate)
      ? decodeURIComponent(candidate)
      : undefined;
  return recordId ? { route: pathname, recordId } : { route: pathname };
}
