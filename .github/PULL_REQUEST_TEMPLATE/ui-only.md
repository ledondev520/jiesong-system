<!-- 仅限纯 UI PR(带 `ui-only` 标签,scripts/check-ui-only.cjs 通过)。用法:新建 PR 时在地址后加 ?template=ui-only.md,或直接粘贴下面一行。
     涉及 backend、schema、定价、财务、报关/退税、.github/、依赖的 PR 不得使用本模板,请用 pull_request_template.md。 -->

UI-only (two-way door) · blast radius: <页面/路由列表> · rollback: revert

<!-- 前后对比截图(Playwright 或线上站点 GET 浏览): -->

| 之前 | 之后 |
|---|---|
|  |  |

复核标记仍然必需(见 pull_request_template.md "复核标记"):合并前本地运行 `node scripts/check-review-freshness.cjs --repo <owner/name> --pr <N>` 并确认退出码 0。
