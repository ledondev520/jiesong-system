若本文件夹结构或内容变化，请更新本文件。

目的：使用合成 API 数据验收生产构建的页面和客户端交互。
边界：不发送真实验证码，不提交真实业务记录；真实后端权限与事务另由后端测试验证。
职责：夹具遵循服务 DTO，界面变动后同步断言，保留页面异常和视口检查。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| helpers.ts | 合成夹具 | 认证、业务 API 与状态；采购 receipts 必须返回 typed summary，邮箱注册仅返回待审核结果 |
| mobile.spec.ts | 移动验收 | 320/390/430px 页面及延迟财务明细滚动、邮箱验证码注册申请、登录退出、表单及错误恢复 |
| button-coverage.spec.ts | 交互验收 | 主要页面按钮、弹窗与无运行时异常检查 |
| smoke.spec.ts | 冒烟验收 | 主要页面与业务入口 |
| visual.spec.ts / snapshots | 可选视觉验收 | 平台相关截图，仅在 VISUAL_REGRESSION=1 时运行 |

运行：`CI=1 npm run test:e2e -- --reporter=list,html`（先 `npx playwright install chromium`）。注册验收验证合成发送请求、冷却按钮、待审核提示及无自动登录令牌；后端 `emailRegistration.test.js` 验证真实校验和限流。采购夹具保持 SIGNED/无到货事实，汇总与明细不得伪造已验收库存。
