/**
 * Input: Next.js 页面的 searchParams（字符串或数组值）
 * Output: withQuery —— 把查询参数原样拼到重定向目标后面
 * Pos: 旧路由兼容 stub 共用，避免书签里的查询参数在重定向时丢失
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */
export type RedirectSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function withQuery(target: string, searchParams: RedirectSearchParams) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) {
      query.append(key, item);
    }
  }
  const queryString = query.toString();
  return queryString ? `${target}?${queryString}` : target;
}
