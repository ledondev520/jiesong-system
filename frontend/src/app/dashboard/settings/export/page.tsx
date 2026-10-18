/**
 * Input: system.service 导出接口
 * Output: 数据导入导出页面（嵌入设置布局）
 * Pos: 系统设置 > 数据导入导出
 */

"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { DataImportTab } from "../components/tabs/DataImportTab";
import { DataExportTab } from "../components/tabs/DataExportTab";

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="数据导入导出"
        description="下载导入模板、校验迁移数据，或按业务模块导出 CSV"
      />
      <DataImportTab />
      <DataExportTab />
    </div>
  );
}
