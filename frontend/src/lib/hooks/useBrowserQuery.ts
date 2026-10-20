/**
 * Input: Next 服务端查询快照、原生浏览器历史与应用内查询提交
 * Output: 浏览器权威查询快照和同步浅历史提交
 * Pos: 报关筛选、退税页签与经营中台筛选共享的查询同步边界
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

"use client";

import { useSyncExternalStore } from "react";

const QUERY_COMMIT_EVENT = "jiesong:browser-query-commit";

function subscribeToBrowserQuery(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(QUERY_COMMIT_EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(QUERY_COMMIT_EVENT, onChange);
  };
}

export function useBrowserQuery(serverQuery: string) {
  return useSyncExternalStore(
    subscribeToBrowserQuery,
    // 每次提交后重查地址，覆盖 Next insertion effect 才更新 canonical URL 的顺序。
    () => window.location.search.slice(1),
    () => serverQuery,
  );
}

export function replaceBrowserUrl(href: string) {
  // null 由 Next 的原生 history 补丁复制内部历史状态，并同步 ACTION_RESTORE。
  window.history.replaceState(null, "", href);
  // 原生 replaceState 不发 popstate；只通知本应用，不触发 Next 的历史遍历导航。
  window.dispatchEvent(new Event(QUERY_COMMIT_EVENT));
}

export function replaceBrowserQuery(
  updates: Record<string, string | undefined>,
) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  if (query === window.location.search.slice(1)) return;
  const href =
    window.location.pathname +
    (query ? `?${query}` : "") +
    window.location.hash;
  // 和报关筛选/退税页签共用同一原生提交及应用专用通知。
  replaceBrowserUrl(href);
}
