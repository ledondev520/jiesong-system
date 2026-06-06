/**
 * Input: system.service 导出接口
 * Output: 数据导出独立页面（嵌入设置布局）
 * Pos: 系统设置 > 数据导出
 */

'use client';

import { PageHeader } from '@/components/layout/PageHeader';
import { DataExportTab } from '../components/tabs/DataExportTab';

export default function ExportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="数据导出"
        description="按业务模块导出系统数据为 CSV 格式"
      />
      <DataExportTab />
    </div>
  );
}
