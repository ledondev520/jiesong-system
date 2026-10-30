/**
 * Input: AI 助手模块根路由
 * Output: 统一 AI 对话工作区
 * Pos: AI 助手模块主入口，直接承载日常问答；会话治理下沉到会话记录页
 */

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { AIAssistant } from '@/components/ai/AIAssistant';
import { PageHeader } from '@/components/layout/PageHeader';

export default function AiAssistantModulePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 助手"
        description="直接查询采购、出口、财务与系统数据；内部草稿按请求直接生成，付款、实物状态与异常操作确认一次。"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/ai/sessions">会话记录</Link>
          </Button>
        }
      />
      <AIAssistant presentation="workspace" />
    </div>
  );
}
