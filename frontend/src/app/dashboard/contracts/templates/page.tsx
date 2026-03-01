/**
 * Input: 合同模板服务
 * Output: 合同模板管理页面
 * Pos: 合同管理子页面
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contractDocService } from '@/services/contractDoc.service';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Trash2, Upload } from 'lucide-react';

interface TemplateInfoItem {
  exists: boolean;
  filename?: string;
  size?: number;
  updatedAt?: string;
}

export default function ContractTemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<TemplateInfoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const response = await contractDocService.getTemplates();
      setItems(response.data?.items || []);
    } catch {
      toast.error('加载模板列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const currentTemplate = useMemo(() => items[0] || null, [items]);

  const handleDelete = async () => {
    if (!window.confirm('确定删除当前模板吗？删除后将无法生成购销合同。')) {
      return;
    }

    setDeleting(true);
    try {
      await contractDocService.deleteTemplate();
      toast.success('模板已删除');
      await loadTemplates();
    } catch {
      toast.error('删除模板失败');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="模板管理"
        description="查看当前生效模板并支持替换/删除"
        backHref="/dashboard/contracts"
        backLabel="返回合同列表"
        actions={
          <Button className="h-10 rounded-xl" onClick={() => router.push('/dashboard/contracts/template')}>
            <Upload className="mr-2 h-4 w-4" />
            去上传模板
          </Button>
        }
      />

      <div className="surface-panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>文件名</TableHead>
              <TableHead>大小</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-[100px]">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">加载中...</TableCell>
              </TableRow>
            ) : !currentTemplate ? (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-muted-foreground">暂无模板，请先上传。</TableCell>
              </TableRow>
            ) : (
              <TableRow>
                <TableCell className="font-medium">{currentTemplate.filename || '-'}</TableCell>
                <TableCell>{typeof currentTemplate.size === 'number' ? `${(currentTemplate.size / 1024).toFixed(1)} KB` : '-'}</TableCell>
                <TableCell>{currentTemplate.updatedAt ? format(new Date(currentTemplate.updatedAt), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => void handleDelete()} disabled={deleting}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
