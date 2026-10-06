若本文件夹结构或内容变化，请更新本文件。

目的：保存聚焦流程的可复核验收证据。
边界：隔离HTTP/SQLite、合成API和实际浏览器结果各自说明，不等同生产验收。
职责：记录真实缺陷、最小修复、验证命令和剩余限制。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| supplier-editor-sessions.md | 编辑回归 | 供应商档案编辑、取消与迟到保存的证据 |
| sales-role-exceptions-2026-10-05.md | 角色回归 | 真实SALES流程异常和现有角色权限证据 |
| purchase-json-import-boundaries-2026-10-05.md | 导入回归 | 采购JSON导入校验和隔离写入边界 |
| purchase-excel-import-2026-10-06.md | 导入回归 | 采购Excel无缓存/非法值、重传和结果恢复 |
| carrier-pdf-edges-2026-10-06.md | PDF回归 | 合成多页、数量差异、图片及损坏PDF的HTTP/归档证据 |
| financial-library-source-readbacks-2026-10-06.md | 资料库回归 | 现有CLI真实合成来源入库和独立行/来源读回；空筛选及旧Sheet请求修复 |
