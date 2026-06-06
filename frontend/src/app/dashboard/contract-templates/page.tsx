'use client';

/**
 * Input: contractTemplateService
 * Output: 合同配置模板管理页面
 * Pos: 合同模板列表入口
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, PROCUREMENT_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { contractTemplateService } from '@/services/contractTemplate.service';
import { ContractTemplate } from '@/types';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Trash2, FileText, Loader2, ShoppingCart, PackageOpen } from 'lucide-react';

export default function ContractTemplatesListPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await contractTemplateService.getAll();
      setTemplates(response.data?.items || []);
    } catch {
      toast.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('确定删除该模板吗？')) {
      return;
    }
    setDeletingId(id);
    try {
      await contractTemplateService.delete(id);
      toast.success('模板已删除');
      await loadTemplates();
    } catch {
      toast.error('删除模板失败');
    } finally {
      setDeletingId(null);
    }
  };

  const getTypeLabel = (type: string) => {
    return type === 'PURCHASE' ? '采购' : '销售';
  };

  const getTypeIcon = (type: string) => {
    return type === 'PURCHASE' ? (
      <ShoppingCart className="h-4 w-4 text-primary" />
    ) : (
      <PackageOpen className="h-4 w-4 text-sky-600" />
    );
  };

  return (
    <div className="space-y-6">
      <ModuleTabHeader tabs={PROCUREMENT_TABS} moduleName="采购" />
      <PageHeader
        title="合同模板"
        description="管理常用的采购/销售合同配置模板，快速创建新合同"
        backLabel="返回采购合同"
      />

      {/* 移动端卡片 */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              加载中...
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <Card className="border-dashed border-border/70">
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              暂无合同模板
            </CardContent>
          </Card>
        ) : (
          templates.map((template) => (
            <Card key={template.id} className="overflow-hidden border-border/70">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      {getTypeIcon(template.type)}
                      <span className="text-sm font-semibold">{template.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      明细项：{template.items?.length || 0} 条
                    </p>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {getTypeLabel(template.type)}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>创建时间：{format(new Date(template.createdAt), 'yyyy-MM-dd HH:mm')}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive"
                    onClick={() => handleDelete(template.id)}
                    disabled={deletingId === template.id}
                  >
                    {deletingId === template.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 桌面端卡片网格 */}
      <div className="hidden md:block">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">暂无合同模板</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {templates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer border-border/40 transition-all duration-300 hover:border-primary/20 hover:bg-card hover:shadow-md hover:-translate-y-0.5 hover:ring-1 hover:ring-primary/10"
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="truncate">{template.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        明细项：{template.items?.length || 0} 条
                        {template.taxRate ? ` | 税率：${template.taxRate}%` : ''}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {getTypeLabel(template.type)}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/30 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(template.createdAt), 'yyyy-MM-dd HH:mm')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs text-destructive hover:bg-destructive/5"
                      onClick={() => handleDelete(template.id)}
                      disabled={deletingId === template.id}
                    >
                      {deletingId === template.id ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="mr-1 h-3 w-3" />
                      )}
                      删除
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
