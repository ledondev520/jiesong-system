# docs/quality 目录

若本文件夹结构或内容变化，请更新本文件。

## 目的/边界/职责
- 目的：存放仍有效的质量契约。
- 边界：一次性验收与回归证据留在 PR 描述和队列报告中，不进本目录（A115 已删除历史证据文档，见 git 历史）。

## 文件清单
| 名字 | 地位 | 功能 |
|---|---|---|
| `README.md` | 索引文档 | 说明质量文档目录用途并维护导航。 |
| `lifecycle-contract.md` | 契约 | 生命周期契约（`lifecycle/*.json` 与 `scripts/check-lifecycle.cjs`）。 |
