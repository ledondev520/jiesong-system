# RBAC-04 Result

## 交付内容
- 新增后端中间件：`backend/src/middleware/roleAuth.js`。
- 角色扩展：后端 Prisma/常量/校验与前端 `Role` 枚举同步新增 `FINANCE`、`WAREHOUSE`。
- 写路由鉴权：补齐 `sales` 所有写路由，并统一扩展业务写路由角色白名单。
- 鉴权语义：无权限访问继续返回 `403`（由 `roleAuth` 统一保证）。
- 回归测试：新增 `backend/src/routes/rbac-write-routes.test.js`，防止未来写路由漏加角色校验。

## 验证
- 通过：`cd backend && node --test src/middleware/auth.test.js src/config/constants.test.js src/utils/validators.test.js src/routes/rbac-write-routes.test.js`
- 通过：`cd frontend && npx vitest run src/app/dashboard/users/page.test.tsx`
- 受限：`cd backend && npx prisma validate` 在当前 `provider=sqlite` + `enum Role` 组合下失败（历史环境约束，详见 `RISKS.md` R-015）
