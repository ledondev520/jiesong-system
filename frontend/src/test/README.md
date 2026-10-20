若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 前端测试初始化与隔离夹具
- 真实接口夹具只允许合成资料和localhost
- 不继承生产配置、不查询凭据字段

## 文件清单
| 名字 | 地位 | 功能 |
|---|---|---|
| setup.ts | 初始化 | jsdom交互兼容与各测试清理 |
| account-name-fixture.ts | 真实接口夹具 | 启动私有名称服务、限制姓名写入、记录HTTP状态和独立安全字段读回 |

`account-name-fixture.ts` 只允许合成普通目标姓名更新，姓名之外的原值与空白密码在HTTP前检查；真实失败由私有SQLite触发器产生。真实请求/后续分页在I/O结算门槛后才进入DOM定位或下一例，拒绝继续抛出；私有传输每次关闭连接，不依赖非目标keep-alive，也不更改超时或自动重试。没有业务响应mock或测试HTTP故障端点。

运行名称测试前在同一checkout的backend目录执行 `npm ci` 与现有 `npm run db:generate`，并确保backend/.env不存在；无需创建默认业务数据库。三个运行Vitest的CI job已提供该前置，详见 `.github/workflows/README.md`。夹具自行使用0700目录/0600数据库和已提交迁移，禁止复制其他环境的生成client或改为跳过测试。
