# SYS-10 结果

## 交付
- 实现“功能归位”而非“菜单嵌套”：
  - 移除“系统管理”一级菜单。
  - 系统运维入口归入“基础设置 -> 运维中心”。
  - HSCode 查询归入“基础设置 -> 基础档案”。
- 旧入口 `/dashboard/system` 保留兼容跳转，防止历史链接失效。

## 变更文件
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/components/layout/Sidebar.test.tsx`
- `frontend/src/app/dashboard/settings/components/SettingsPageContent.tsx`
- `frontend/src/app/dashboard/system/page.tsx`
- `frontend/src/app/dashboard/system/page.test.tsx`
- `frontend/e2e/smoke.spec.ts`
- `PLAN.md`
- `TASKS.md`

## 验证结论
- 定向 Vitest：21/21 通过
- 定向 ESLint：通过
- 前端 build（webpack）：通过
