/**
 * Input: 根相对的报关列表地址或详情 returnTo 查询值
 * Output: 安全的规范报关返回地址及明确返回的新文档导航
 * Pos: 报关列表/详情的有限返回上下文与原生导航边界
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const CUSTOMS_LIST_PATH = "/dashboard/tax-refunds";
export const CUSTOMS_RETURN_FALLBACK = `${CUSTOMS_LIST_PATH}?view=customs`;
const LEGACY_LIST_PATHS = [
  "/customs-declarations",
  "/dashboard/customs-declarations",
];

export function resolveCustomsReturnTo(returnTo: string | null) {
  if (!returnTo) return CUSTOMS_RETURN_FALLBACK;
  const hashIndex = returnTo.indexOf("#");
  const hash = hashIndex < 0 ? "" : returnTo.slice(hashIndex);
  const pathAndQuery = hashIndex < 0 ? returnTo : returnTo.slice(0, hashIndex);
  const queryIndex = pathAndQuery.indexOf("?");
  const pathname =
    queryIndex < 0 ? pathAndQuery : pathAndQuery.slice(0, queryIndex);
  // 精确比较未经再次解码的路径，拒绝外部/协议相对地址、编码路径、反斜线与路径别名。
  if (pathname !== CUSTOMS_LIST_PATH && !LEGACY_LIST_PATHS.includes(pathname)) {
    return CUSTOMS_RETURN_FALLBACK;
  }
  const params = new URLSearchParams(
    queryIndex < 0 ? "" : pathAndQuery.slice(queryIndex + 1),
  );
  const views = params.getAll("view");
  if (
    (pathname === CUSTOMS_LIST_PATH && views.length !== 1) ||
    views.length > 1 ||
    (views.length === 1 && views[0] !== "customs")
  ) {
    return CUSTOMS_RETURN_FALLBACK;
  }
  // 旧列表入口会重定向并丢掉查询；直接规范到同一报关页签，避免嵌套 returnTo。
  params.delete("returnTo");
  params.set("view", "customs");
  return `${CUSTOMS_LIST_PATH}?${params.toString()}${hash}`;
}

export function navigateToCustomsList(returnTo: string | null) {
  // Next 缓存的 canonical 查询可能过时；明确返回只加载已验证的报关列表新文档。
  window.location.assign(resolveCustomsReturnTo(returnTo));
}
