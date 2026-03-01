/**
 * Input: AI Token 统计 API
 * Output: Token 用量统计页面
 * Pos: Dashboard AI 管理模块
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { aiService, type AiTokenStats } from '@/services/ai.service';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

const dayOptions = [7, 30, 90];

export default function AiTokenStatsPage() {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AiTokenStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async (targetDays: number) => {
    setLoading(true);
    try {
      const response = await aiService.getTokenStats(targetDays);
      setStats(response.data || null);
    } catch {
      toast.error('加载 Token 统计失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats(days);
  }, [days, loadStats]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Token 用量统计"
        description="监控 AI 请求量、输入输出 Token 与模型分布"
        actions={
          <div className="flex items-center gap-2">
            {dayOptions.map((option) => (
              <Button
                key={option}
                variant={days === option ? 'default' : 'outline'}
                size="sm"
                className="rounded-xl"
                onClick={() => setDays(option)}
              >
                {option}天
              </Button>
            ))}
            <Button variant="outline" className="h-9 rounded-xl" onClick={() => void loadStats(days)}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">请求总数</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{stats?.totalRequests ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">总 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(stats?.totalTokens ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">输入 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(stats?.promptTokens ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">输出 Token</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{(stats?.outputTokens ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模型</TableHead>
              <TableHead className="text-right">请求数</TableHead>
              <TableHead className="text-right">Token</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : !stats?.byModel?.length ? (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-muted-foreground">暂无模型统计数据。</TableCell>
              </TableRow>
            ) : (
              stats.byModel.map((item) => (
                <TableRow key={item.model}>
                  <TableCell className="font-medium">{item.model}</TableCell>
                  <TableCell className="text-right">{item.requests}</TableCell>
                  <TableCell className="text-right">{item.tokens.toLocaleString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
