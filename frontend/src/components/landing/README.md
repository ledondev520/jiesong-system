# 落地页组件（Ink & Seal）

公开落地页 `/` 的各区块：`LandingPage`（服务端渲染，所有访客可见，无空白闪屏）→ `LandingTopBar`（吸顶，底部金色发丝线）、`LandingHero`（浅暖纸首屏 + 大标志，本页唯一 h1）、`FlowStrip`（八个环节）、`LandingFooter`。`AuthRedirect` 是唯一的客户端逻辑：已登录者 `router.replace('/dashboard')`，未登录什么也不做。

规则：没有客户名、数字、价格或真实界面截图；所有链接与资源都是站内地址（无外部字体/脚本/统计）；Montserrat 自托管（`app/fonts/`），仅用于拉丁字母/数字；品牌金与标记红只在公开页使用，不进入 `/dashboard`（`app/design-tokens.test.ts` 检查）。登录/申请账号入口只在顶栏、首屏、页脚三处（B28 去掉了页中重复的功能卡与收尾带）；页面上的任何功能说法必须对应已上线功能（财务汇总/应收应付/统计接口对所有已登录角色开放，不能写成「财务数据只对财务可见」）；文案需负责人确认。
