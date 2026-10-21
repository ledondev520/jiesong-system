## 改了什么 / 为什么

<!-- 一两句话说明目标和主要改动 -->

## 门型

- [ ] 双向门:可以干净回滚(回退提交即可恢复,不留数据痕迹)
- [ ] 单向门:含数据库迁移、删数据、不可逆的数据改写、对外发布等回滚后仍留痕迹的改动

理由:

<!-- 单向门:即使 CI 全绿、复审通过,合并前也必须先报负责人批准;写明不可逆的部分和备份方案 -->

## 影响范围

<!-- 受影响的模块、数据、用户;大 / 中 / 小 -->

## 回滚方式

<!-- 例如:revert 本 PR 的 merge commit;单向门写明数据如何恢复 -->

## 测试

<!-- 实际跑过的检查及结果(命令、退出码);未跑的不要写成通过 -->

## 复核标记

<!-- 独立复核通过后，由 PR 作者或仓库 owner 在 PR 评论中单独写一行（不要把占位符当作有效标记）：
review-freshness/v1 pass head=<40位小写hex> base=<40位小写hex>
head 为复核时 PR head，base 为复核使用的 origin/main SHA。最新标记评论格式错误或写 review-freshness/v1 revoke 即撤销。
新标记后在 Actions re-run review-freshness job；head 变化或 main 后续改动碰到 PR 文件时，更新分支、重跑 CI、重新独立复核并写新标记。
合并前必须本地运行 node scripts/check-review-freshness.cjs --repo <owner/name> --pr <N> 并确认退出码 0；已绿的 GitHub 检查不会因 main 前进自动变红。
-->

## 部署交接(合并后需要部署时填写)

- [ ] 基线 = 生产环境当前实际运行的 commit(在服务器上核对,不用"上次说没问题"的 commit):`<生产 sha>..<待部署 sha>`
- [ ] 已列出区间内每个 PR 及其门型
- [ ] 已单独标出所有非前端改动(backend、scripts、迁移、删文件逻辑);无则写"无"

---
评审会按根目录 `CODING_STANDARDS.md` 逐条核对 diff。
