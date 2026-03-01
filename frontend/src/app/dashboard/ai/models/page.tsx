/**
 * Input: AI 模型 API
 * Output: 模型列表页面
 * Pos: Dashboard AI 管理模块
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { aiService, type AiModelsResponse } from '@/services/ai.service';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';

export default function AiModelsPage() {
  const [data, setData] = useState<AiModelsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const response = await aiService.getModels();
      setData(response.data || null);
    } catch {
      toast.error('加载模型列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const rows = Object.entries(data?.models || {});

  return (
    <div className="space-y-6">
      <PageHeader
        title="模型列表"
        description="查看后端配置的 AI 模型与用途说明"
        actions={
          <Button variant="outline" className="h-10 rounded-xl" onClick={() => void loadModels()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2">
        {loading ? (
          <Card className="md:col-span-2">
            <CardContent className="py-12 text-center text-muted-foreground">加载中...</CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="md:col-span-2">
            <CardContent className="py-12 text-center text-muted-foreground">暂无可用模型。</CardContent>
          </Card>
        ) : (
          rows.map(([key, model]) => (
            <Card key={key}>
              <CardHeader>
                <CardTitle className="text-base">{key}</CardTitle>
                <CardDescription>{data?.description?.[key] || '暂无描述'}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-sm text-primary break-all">{model}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
