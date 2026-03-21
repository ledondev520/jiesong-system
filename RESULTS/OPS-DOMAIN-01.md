# OPS-DOMAIN-01 结果

## 结论

- 仓库工作树内未发现 `clawpi-v2.vercel.app` 明文字面量。
- 未发现 `cron`、`launchd`、`backup.sh`、`health-check.sh`、后端定时任务文件内存在 ClawPi 旧域名硬编码。
- 发现并修复一处会影响 API 域名迁移的运行时问题：前端请求入口与文档/构建入口使用的环境变量名不一致。

## 产出

- 新增：`frontend/src/lib/api-base-url.ts`
- 修改：`frontend/src/lib/axios.ts`
- 修改：`frontend/src/components/ai/AIAssistant.tsx`
- 修改：`frontend/src/lib/axios.test.ts`
- 新增：`docs/plans/2026-03-19-clawpi-domain-sweep.md`

## 验证结果

- `cd frontend && npm run test -- src/lib/axios.test.ts`
  - 结果：`1` 个测试文件、`5` 个测试全部通过。
- `grep ... 'clawpi-v2\.vercel\.app' .`
  - 结果：无命中。
- `grep ... 'NEXT_PUBLIC_API_URL\|NEXT_PUBLIC_API_BASE_URL' ...`
  - 结果：前端关键 API 入口已统一经共享解析逻辑处理；构建/部署文档仍以 `NEXT_PUBLIC_API_BASE_URL` 为规范变量。

## 保守未改项

- `frontend/Dockerfile`、`deploy.sh`、`frontend/next.config.ts` 中的 `/api/v1` / `NEXT_PUBLIC_API_BASE_URL` 保持不变。
- 原因：这些入口服务于本地或反向代理场景，不应被强行替换为外部绝对域名。
