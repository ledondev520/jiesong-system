/**
 * Input: module root href、pathname、子路由前缀列表
 * Output: last visited URL per module (localStorage) + 模块归属校验（getModuleTabOrRoot）
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

/**
 * 职责：判断 path 是否属于某顶级模块（入口 href + 子路由前缀）
 * 思路：`/dashboard` 仅精确匹配工作台首页，避免前缀误匹配所有 `/dashboard/*`（与 Sidebar / Header 一致）
 * @param moduleRoot 模块入口路径（如 /dashboard、/dashboard/contracts）
 * @param childPrefixes 该模块子页面路径前缀列表
 * @param path 待校验路径
 */
export function isPathInModule(moduleRoot: string, childPrefixes: string[], path: string): boolean {
  return [moduleRoot, ...childPrefixes].some((prefix) => {
    if (prefix === '/dashboard') return path === '/dashboard';
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

/**
 * 职责：读取模块 Tab 记忆；若存储路径已不属于该模块（脏数据或旧版 key），回退到模块入口
 * @param moduleRoot 模块入口路径
 * @param childPrefixes 子路由前缀（与 Sidebar moduleNavItems 一致）
 */
export function getModuleTabOrRoot(moduleRoot: string, childPrefixes: string[]): string {
  const stored = getModuleTab(moduleRoot);
  if (isPathInModule(moduleRoot, childPrefixes, stored)) return stored;
  return moduleRoot;
}
