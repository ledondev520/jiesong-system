# 导航与用户操作

Header/MobileTabBar退出登录先等待服务端撤销当前浏览器会话，失败保留状态并提示重试。重复退出共用请求，晚到响应不得清理较新的登录。HeaderUserMenu保持可访问的“用户菜单”入口。

仪表盘布局在Cookie会话验证完成前不呈现保护内容或使用旧角色导航。业务授权继续由实时后端认证和角色校验决定。

`PageHeader` 未传 `onBack` 时保持原有 `backHref → router.push` 和显式 `showBack → router.back`。只有调用方显式提供 `onBack` 才执行该动作；目前仅报关详情明确返回使用它，按钮样式、可访问名称与显示规则不变。`PageHeader.test.tsx` 同时覆盖默认导航和显式动作优先级。
