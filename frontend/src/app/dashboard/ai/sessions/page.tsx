/**
 * Input: AI 会话 API
 * Output: AI 会话管理页面
 * Pos: Dashboard AI 管理模块
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { aiService, type AiSessionItem } from '@/services/ai.service';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const getSessionCount = (item: AiSessionItem) => {
  if (typeof item._count === 'number') return item._count;
  if (item._count && typeof item._count === 'object') return item._count._all || 0;
  return 0;
};

const getSessionLastAt = (item: AiSessionItem) => {
  return item._max?.createdAt || null;
};

export default function AiSessionsPage() {
  const [sessions, setSessions] = useState<AiSessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await aiService.getSessions();
      setSessions(response.data || []);
    } catch {
      toast.error('加载 AI 会话失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('确定删除该会话记录吗？')) {
      return;
    }

    setDeletingSessionId(sessionId);
    try {
      await aiService.deleteSession(sessionId);
      toast.success('会话已删除');
      await loadSessions();
    } catch {
      toast.error('删除会话失败');
    } finally {
      setDeletingSessionId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="AI 会话列表"
        description="查看历史会话与消息规模，支持清理无效会话"
        actions={
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => void loadSessions()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>会话ID</TableHead>
              <TableHead>消息数</TableHead>
              <TableHead>最近消息时间</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : sessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">暂无 AI 会话记录。</TableCell>
              </TableRow>
            ) : (
              sessions.map((item) => {
                const lastAt = getSessionLastAt(item);
                const deleting = deletingSessionId === item.sessionId;
                return (
                  <TableRow key={item.sessionId}>
                    <TableCell className="font-medium">{item.sessionId}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{getSessionCount(item)}</Badge>
                    </TableCell>
                    <TableCell>{lastAt ? format(new Date(lastAt), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl border border-border/65 bg-background/55"
                        onClick={() => void handleDelete(item.sessionId)}
                        disabled={deleting}
                        aria-label={`删除会话-${item.sessionId}`}
                      >
                        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
