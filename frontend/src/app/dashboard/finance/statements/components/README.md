若本文件夹结构或内容变化，请更新本文件。

目的：承载既有月度报表、对账和受限财务资料库组件。
边界：月度三文件预览/确认独立于只读资料库；资料库原始来源不经网页上传。
职责：资料筛选、来源选择、Sheet与页读取只显示当前有效请求，空筛选清除旧明细。

| 名字 | 地位 | 功能 |
| --- | --- | --- |
| FinancialStatementsPageContent.tsx | 页面组合 | 账期读取、导入弹窗和各分析分区 |
| FinancialStatementsOverview.tsx | 报表概览 | 账期、指标、异常及导入入口 |
| FinancialStatementsTabsSection.tsx | 账期下钻 | 资产负债、利润、现金流和账簿页签 |
| FinancialStatementsShared.tsx | 共享界面 | 财务加载、指标及表格基础组件 |
| FinancialStatementsUploadDialog.tsx | 月度导入 | 原有三文件预览和明确确认 |
| FinancialEvidenceLibrary.tsx | 资料库下钻 | 分类/账期、来源/Sheet及行分页；撤销旧来源请求和清除空筛选明细 |
| ReceivableReconciliationCard.tsx | 应收对账 | 当前账期的独立应收对账分区 |
| financialStatementsFormatting.ts | 显示工具 | 月度金额和百分比格式 |
| *.test.ts / *.test.tsx | 组件回归 | 可空/零金额、导入交互、资料隐私说明、空筛选及迟到旧Sheet不会恢复旧来源 |
