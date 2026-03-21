/**
 * Input: module root href, pathname
 * Output: last visited URL per module (localStorage)
 * Pos: 辅助 Sidebar 实现模块 Tab 记忆功能
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

const PREFIX = 'tab_memory_';

/**
 * 职责：保存某模块最后访问的 URL
 */
export function saveModuleTab(moduleRoot: string, pathname: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${PREFIX}${moduleRoot}`, pathname);
  } catch {
    // ignore storage errors (private mode etc.)
  }
}

/**
 * 职责：读取某模块最后访问的 URL；若无记录则返回 moduleRoot 本身
 */
export function getModuleTab(moduleRoot: string): string {
  if (typeof window === 'undefined') return moduleRoot;
  try {
    return localStorage.getItem(`${PREFIX}${moduleRoot}`) || moduleRoot;
  } catch {
    return moduleRoot;
  }
}
