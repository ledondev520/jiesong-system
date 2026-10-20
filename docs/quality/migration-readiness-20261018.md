# 迁移就绪度修复验收

本轮基于 `178c0a5`，仅在本地 `fix/migration-readiness` 分支实施。范围是用户指定的七项，不包含定价统一或真实迁移。

| 步骤 | 通过条件 | 本轮证据 |
| --- | --- | --- |
| 1 路径配置 | 删除个人路径，CLI 优先于环境变量和仓库默认 | 12 个 Python 回归；CLI help |
| 2 xlsx | 真实 multipart 复现 500，修复后返回 200；错误输入 400 | `dataImport.upload.test.js`；19 项相关检查 |
| 3 模板与期初 | 八份可解析下载；dry-run 全库不变；执行重验、整批新增、重复拒绝 | `catalogImport.database.test.js`、设置页组件测试；合成 JSON 读回 |
| 4 管理员 | 无配置不创建弱密码；旧默认密码阻止启动；修复后会话撤销；seed 不覆盖安全密码 | `bootstrapAdmin.database.test.js` 的真实子进程与 `/health` |
| 5 文档 | README 对齐实际 SQLite、脚本和功能；无错误阶段表 | Prisma validate；schema diff 为空 |
| 6 测试环境 | 无 sqlite3 CLI 依赖；Blob/Response 可兼容；财务测试不误连 DB | 21 个后端相关检查和 4 个下载检查 |
| 7 恢复 | 在线 WAL 快照，校验后恢复到新库，读回与原快照相同 | `drill_sqlite_restore.py`、7 个快照测试与 docs/operations 演练回执 |

基线与最终完整结果、所有提交哈希和命令记录在工作区报告 `/workspace/brain/projects/jiesong-fix-report.md`。本机原始日志、八份模板及临时库位于 `/tmp/jiesong-fix-evidence/`，临时目录可能被系统清理。请用已提交测试和演练脚本复跑，勿把临时库当生产备份。

使用了 poteto-mode 的 Model the Domain，四类导入共用注册表；Sequence work into verifiable units，每项通过相关检查后小提交；Prove It Works，以下载文件、独立 SQL 和真实进程验证。架构对比选择共享导入边界及启动门禁。AGENTS.md 要求用户明确授权子代理，本轮未启动子代理，未进行跨模型独立评审。ByteRover query/curate 因本机缺少 brv CLI 失败，代码与文档保留了对应规则。

全量前端首次与多个后端套件同时运行时，两条原有用例超过20秒。单独串行复跑31项通过。第一次失败日志保留，没有调整产品代码或放宽超时。最终全量前端结果见工作区报告。

最终完整检查通过。后端783/783、DB集成211/211、船司PDF5/5、根脚本38/38、Python19/19、前端1038/1038。TypeScript与变更前端格式检查通过。前端最终命令为 `npm test -- --maxWorkers=1`，207文件。初次并行全量超时记录保留。
