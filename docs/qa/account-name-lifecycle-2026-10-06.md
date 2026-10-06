# 普通用户显示姓名生命周期验收

基线为已部署提交 `9d95c71ec78da93b5fce396f8eb86d1cfc71be4d`。覆盖清单第31项 `/dashboard/users` 和第33项 `/dashboard/settings/users`，范围仅为已有普通用户的显示姓名编辑。

## 真实菜单来源与执行层级

- 第31项：`navigation.config.ts` 的 `ADMIN_TABS` 将「系统管理 → 账号管理」指向 `/dashboard/users`。
- 第33项：`SettingsLayout` 实际渲染 `SettingsNav`；宽屏左栏「通用 → 用户管理」以及手机/平板「设置菜单」均指向 `/dashboard/settings/users`。该入口仍然存在，不是仅凭旧文件推断的兼容地址。
- `settings/components/tabs/UsersTab.tsx` 的卡片指向第31项，但当前 `SettingsPageContent` 不渲染它。本轮没有新增、合并或修改菜单。
- 上述菜单关系由源码核对；实际交互检查在 React/jsdom 直接挂载两个页面完成，不声称经过浏览器菜单点击、Next 路由、真实视觉或 hosted 浏览器验收。

## 隔离资料与真实接口

`backend/src/testHelpers/account-name-server.js` 使用已提交迁移的 `prisma migrate deploy`，不运行 `db push`、`migrate diff` 或 client generate。每次测试独占0700临时目录和0600 SQLite，127.0.0.1随机端口，不继承生产数据库、外部邮件、AI或服务配置，并拒绝含 backend/.env 的运行目录。

只预置一个合成 ADMIN、两个合成 SALES 普通目标及100个普通占位身份。固定测试密码字段是不可用占位字符串，没有登录、改密、真实账号操作或持久访问配置。合成目标由不同 `createdAt` 独立定位：后页目标不在真实 API 第1页100条中，在第2页中。

用户 `userService`、共享分页读取器、页面、真实 `UserDialog` 和校验保持实际实现；测试只将 axios 传输适配到私有服务。人的列表、详情、更新均使用真实 HTTP、认证、控制器、Prisma 与 SQLite，响应未被模拟。第31项相邻 Agent 列表的客户端调用被隔离为拒绝，不发出 Agent HTTP；Agent 对话框及模块导航壳也不在本轮范围。没有检查 Agent/凭据表、密码、哈希或浏览器凭据存储，也不声称整页完全没有 mock 或 Agent 功能通过。

更新传输在发出请求前要求目标是当前合成普通用户；只允许显示姓名变动，用户名、角色、启用状态必须等于原值，密码只能空白或省略。Create、Delete及其他路径在夹具中拒绝。独立只读 SQLite 仅显式查询目标的 `id,username,name,role,isActive,updatedAt`，从不执行 `SELECT * FROM users` 或查询凭据字段。

## 复现与最小修复

同一组6项检查在修复前连续两次为4通过、2失败；第31项作为控制全部通过。

1. 第33项只读取第1页100条后做客户端分页，后页普通目标虽然真实 API 第2页存在，页面搜索仍无法找到。改为复用现有 `loadPaginatedCatalog` 逐页装载，保留当前搜索/排序/分页模式。
2. 第33项 `handleSubmit` 吞掉真实更新拒绝，使共用对话框误认为成功并 reset 草稿。私有 SQLite 名称更新触发器产生真实 PUT500；独立安全字段快照不变，但输入恢复为上次保存姓名且无保留草稿 alert。只新增异常继续抛出，使已有对话框保留当前姓名并提示用户明确重试。

第31项生产源码、用户后端、共用表单、权限矩阵、角色策略及启用/密码规则均未修改。

## 检查与结果

`frontend/src/app/dashboard/users/name-lifecycle.test.tsx` 共6项，两个页面分别覆盖：

- 搜索已有普通用户 → 编辑仅改姓名 → 关闭放弃，零 PUT 且独立安全字段不变；重开仍为保存值
- 明确保存 → API详情读回与独立安全字段核对 → 重开 → 卸载/重挂页面模拟重载，姓名一致，用户名/角色/启用状态保持不变，密码空白，仅一项姓名更新
- 真实 PUT500 → 保留姓名草稿及明确错误 → 解除夹具故障仍无自动重试 → 用户再次点击保存 → 成功读回/重开，两次请求保持相同安全字段
- 后页目标真实页1不存在/页2存在 → 页面搜索、名称保存、独立读回与模拟重载成功

最小修复后6项通过；与现有页面、共用表单和目录读取器的12项回归一起运行，共4文件18项通过。现有12项使用原有模拟服务，不计入新的真实名称生命周期证据。三个改动TS/TSX文件的聚焦ESLint、夹具 `node --check` 与 `git diff --check` 均通过。运行：

```bash
cd frontend
TZ=UTC npm test -- --run src/app/dashboard/users/name-lifecycle.test.tsx src/app/dashboard/users/page.test.tsx src/app/dashboard/users/components/UserDialog.test.tsx src/services/paginatedCatalog.test.ts
npm run lint -- src/app/dashboard/settings/users/page.tsx src/app/dashboard/users/name-lifecycle.test.tsx src/test/account-name-fixture.ts
```

本轮仅运行聚焦检查，完整构建/类型及 aggregate 由协调任务执行。没有启动本地浏览器、安装浏览器、改变启动参数、建立隧道或使用用户电脑。ByteRover查询和后续curate因 `brv` 不在 PATH 而不可用；没有为此安装工具。

## 集成后测试同步复核

协调任务的严重并发 coverage 日志记录本文件6项中2项失败：第33项同步门槛 `queryByText('加载中...')` 在页面同时渲染移动卡片和桌面表格的两个 loading 时抛多元素错误；另一项真实 fetch 为 `UND_ERR_SOCKET: other side closed`。此前聚焦通过不能代替该集成失败。未修改夹具的单文件串行对照仍为6/6通过（18.01秒），所以不能据此确认 Socket 的具体根因。

Node20.19.0 实测内置 Undici6.21.1，未设置的 HTTP server `keepAliveTimeout` 为5000ms，`headersTimeout` 为60000ms，`requestTimeout` 为300000ms。日志中的连接已经复用多次；高负载下客户端事件循环阻塞与空闲连接关闭的竞态只是候选解释。

仅修正测试：夹具记录进行中的真实HTTP Promise，给分页完成链一个I/O调度轮次，等待已触发的真实请求及后续页结算；`openTarget` 在 React `act` 中等待该门槛后直接定位目标row，移除单元素 loading 查询。每例清理同样先结算请求再重置下一例证据和故障；结算时观察到的请求拒绝继续抛出，业务与网络失败不会被当成成功。没有改变断言超时、测试超时、响应、自动重试或任何产品代码。

私有localhost测试传输增加 `Connection: close`，只移除普通名称测试对非目标 keep-alive 复用的依赖；它不是产品 Socket 修复，没有改变生产服务的连接设置。修改后6项串行通过，完整集成仍须由协调任务重验，不能把串行绿误记为 coverage 全套通过。
