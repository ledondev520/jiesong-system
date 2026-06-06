/**
 * Input: -
 * Output: 系统配置页面（参数 + AI API Key）
 * Pos: 系统管理 > 系统配置 Tab，仅展示核心系统参数，其他功能已独立为直接导航页
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { Suspense } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SystemConfigTab } from './tabs/SystemConfigTab';

/**
 * 职责：渲染系统配置页（参数设置 + AI API Key）
 */
export default function SettingsPageContent() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="系统配置"
        description="全局运营参数与 AI 集成配置"
      />
      <Suspense>
        <SystemConfigTab />
      </Suspense>
    </div>
  );
}
