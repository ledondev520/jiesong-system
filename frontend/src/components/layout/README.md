若本文件夹结构或内容变化，请更新本文件。

# 导航与用户操作

目的：提供共用导航、Header 用户操作和页面布局。
边界：个人设置沿用浏览器本地偏好和资料状态；HTTP 认证与业务授权不由菜单更改。
职责：保持取消、重开、保存失败重试等已有交互的可访问入口和回归证据。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| HeaderUserMenu.tsx / HeaderProfileDialog.tsx | 用户设置组件 | 打开既有个人设置草稿，保存本地资料/偏好并显示同步写入失败 |
| HeaderUserMenu.lifecycle.test.tsx | 菜单生命周期回归 | jsdom 覆盖取消、最新保存值重开、偏好或回调失败重试 |
| HeaderUserMenu.auth-profile.test.tsx | 真实本地资料持久化回归 | 使用实际 Zustand updateProfile 验证部分写入、草稿保留、恢复已有用户值与明确重试 |

Header/MobileTabBar退出登录先等待服务端撤销当前浏览器会话，失败保留状态并提示重试。重复退出共用请求，晚到响应不得清理较新的登录。HeaderUserMenu保持可访问的“用户菜单”入口。

仪表盘布局在Cookie会话验证完成前不呈现保护内容或使用旧角色导航。业务授权继续由实时后端认证和角色校验决定。

`HeaderNotifications` 对同一通知的待完成已读请求按 ID 去重，成功只减少一次未读计数；其他通知可独立处理，失败后可重试。组件回归覆盖重复点击、失败重试、不同通知并发完成、重新挂载读取，以及全部已读响应丢失后重试。

`PageHeader` 未传 `onBack` 时保持原有 `backHref → router.push` 和显式 `showBack → router.back`。只有调用方显式提供 `onBack` 才执行该动作；目前仅报关详情明确返回使用它，按钮样式、可访问名称与显示规则不变。`PageHeader.test.tsx` 同时覆盖默认导航和显式动作优先级。

`HeaderProfileDialog` 捕获同步本地保存失败，显示可访问的“保存未完成”提示并保留显示名称和个人偏好草稿，用户可重试；取消或重新打开仍由 `HeaderUserMenu` 重新加载保存值。原保存顺序保持为先写偏好、再调用资料回调、成功后关闭；偏好写入失败不调用资料回调，资料回调失败时偏好可能已保存，不保证原子保存。`HeaderUserMenu.lifecycle.test.tsx` 在 jsdom 隔离存储中覆盖取消丢弃、重开读取、存储/资料回调失败重试及保存后重开，不代表真实 HTTP、生产浏览器存储或偏好对其他页面的应用效果。

`HeaderUserMenu.auth-profile.test.tsx` 使用与 Header 相同的真实 `useAuthStore.updateProfile` 装配菜单，不替换资料回调：sessionStorage 写入失败前内存姓名已更新且偏好已保存；仓库 rehydrate 读回旧保存姓名，表单仍保留草稿；明确重试成功后再次 rehydrate/重开读回规范化姓名与备注。测试不读出认证存储、令牌或 cookies。真实整页重载证据由 `frontend/e2e/profile-preference-lifecycle.spec.ts` 四项 hosted 定义负责；新增定义和 jsdom 通过不等于浏览器执行通过。
