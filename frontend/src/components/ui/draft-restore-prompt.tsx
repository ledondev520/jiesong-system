/**
 * 职责：草稿恢复提示卡片
 * 思路：检测到有草稿时显示提示，提供恢复或丢弃选项
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, RotateCcw, X } from 'lucide-react';

interface DraftRestorePromptProps {
  /** 草稿时间 */
  draftDate: Date;
  /** 恢复回调 */
  onRestore: () => void;
  /** 丢弃回调 */
  onDiscard: () => void;
  /** 延迟显示（毫秒） */
  delay?: number;
}

export function DraftRestorePrompt({
  draftDate,
  onRestore,
  onDiscard,
  delay = 500,
}: DraftRestorePromptProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!visible) return null;

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes} 分钟前`;
    if (hours < 24) return `${hours} 小时前`;
    return `${days} 天前`;
  };

  return (
    <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-amber-600" />
          发现未提交的草稿
        </CardTitle>
        <CardDescription>
          系统检测到您有 {formatTime(draftDate)} 保存的草稿，是否恢复？
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex gap-2 pt-0">
        <Button
          variant="default"
          size="sm"
          onClick={onRestore}
          className="bg-amber-600 hover:bg-amber-700"
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          恢复草稿
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setVisible(false);
            onDiscard();
          }}
        >
          <X className="mr-1.5 h-3.5 w-3.5" />
          丢弃
        </Button>
      </CardFooter>
    </Card>
  );
}
