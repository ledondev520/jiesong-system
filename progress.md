# Progress Log

## Session Start
- Analyzed existing docs and file structure.
- Identified architecture mismatch (Docs says Fullstack, actual is Separated).
- Created Plan (`task_plan.md`).
- Next step: Initialize Next.js project.

## 2026-01-16
- 增加测试先行文档 `docs/测试样例.md`，覆盖PRD/技术方案核心规则。
- 新增后端单元测试（响应工具与常量枚举），加入 `npm run test` 脚本。
- 更新文档索引与后端README，记录测试执行方式与目录说明。
- 扩展测试样例覆盖到报关/财务/通知/日志/报表/非功能需求。
- 新增后端单元测试覆盖配置加载、错误处理与授权校验、参数校验。
- 进一步补齐测试样例用例细节与权限/边界场景。
- 汇总全项目模拟数据标记并形成文档 `docs/模拟数据汇总.md`。
- 补充前端单元测试与Vitest配置，完善测试命令与文档说明。
- 新增前端服务层与HTTP客户端单元测试覆盖。
- 新增前端UI与布局组件测试覆盖（Header/Sidebar/Button/Badge）。
- 修复前端开发服务锁文件导致无法启动的问题，重启dev server。
- 调整后端默认端口与前端API默认地址，避免端口冲突导致404。
