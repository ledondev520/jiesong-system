/**
 * Input: 合同模板服务、SortableTableHead、useTableSort
 * Output: 合同模板管理页面（模板列表列排序）
 * Pos: 合同管理子页面
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { ModuleTabHeader, ADMIN_TABS } from '@/components/layout/ModuleTabHeader';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { contractDocService } from '@/services/contractDoc.service';
import { cachedFetch, invalidateCache } from '@/lib/api-cache';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Trash2, Upload, FileText } from 'lucide-react';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/hooks/useTableSort';

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
      const response = await cachedFetch('contract-templates', () => contractDocService.getTemplates());
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

  const templateSort = useTableSort<TemplateInfoItem, string>(
    items,
    useCallback((row, key) => {
      switch (key) {
        case 'filename':
          return row.filename ?? '';
        case 'size':
          return row.size ?? null;
        case 'updatedAt':
          return row.updatedAt ? new Date(row.updatedAt).getTime() : null;
        default:
          return null;
      }
    }, [])
  );

  const currentTemplate = useMemo(() => templateSort.sortedData[0] || null, [templateSort.sortedData]);

  const handleDelete = async () => {
    if (!window.confirm('确定删除当前模板吗？删除后将无法生成购销合同。')) {
      return;
    }

    setDeleting(true);
    try {
      await contractDocService.deleteTemplate();
      invalidateCache('contract-templates');
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
      <ModuleTabHeader tabs={ADMIN_TABS} moduleName="系统管理" />
      <PageHeader
        title="模板管理"
        description="查看当前生效模板并支持替换/删除"
        
        backLabel="返回合同列表"
        actions={
          <Button className="h-10 rounded-xl" onClick={() => router.push('/dashboard/contracts/template')}>
            <Upload className="mr-2 h-4 w-4" />
            去上传模板
          </Button>
        }
      />

      {/* 移动端卡片 */}
      <div className="md:hidden">
        {loading ? (
          <div className="surface-panel py-10 text-center text-sm text-muted-foreground">加载中...</div>
        ) : !currentTemplate ? (
          <div className="surface-panel py-10 text-center text-sm text-muted-foreground">暂无模板，请先上传。</div>
        ) : (
          <div className="surface-panel space-y-3 p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-sm">{currentTemplate.filename || '-'}</div>
                <div className="mt-1 flex gap-4 text-xs text-muted-foreground">
                  <span>{typeof currentTemplate.size === 'number' ? `${(currentTemplate.size / 1024).toFixed(1)} KB` : '-'}</span>
                  <span>{currentTemplate.updatedAt ? format(new Date(currentTemplate.updatedAt), 'yyyy-MM-dd HH:mm') : '-'}</span>
                </div>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-10 w-full rounded-xl text-destructive border-destructive/30 hover:bg-destructive/5"
              onClick={() => void handleDelete()}
              disabled={deleting}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {deleting ? '删除中...' : '删除模板'}
            </Button>
          </div>
        )}
      </div>

      {/* 桌面端表格 */}
      <div className="surface-panel hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead
                sortKey="filename"
                currentSortKey={templateSort.sortKey}
                currentSortDir={templateSort.sortDir}
                onSort={templateSort.onSort}
              >
                文件名
              </SortableTableHead>
              <SortableTableHead
                sortKey="size"
                currentSortKey={templateSort.sortKey}
                currentSortDir={templateSort.sortDir}
                onSort={templateSort.onSort}
              >
                大小
              </SortableTableHead>
              <SortableTableHead
                sortKey="updatedAt"
                currentSortKey={templateSort.sortKey}
                currentSortDir={templateSort.sortDir}
                onSort={templateSort.onSort}
              >
                更新时间
              </SortableTableHead>
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
              templateSort.sortedData.map((row) => (
                <TableRow key={row.filename || 'template'}>
                  <TableCell className="font-medium">{row.filename || '-'}</TableCell>
                  <TableCell>{typeof row.size === 'number' ? `${(row.size / 1024).toFixed(1)} KB` : '-'}</TableCell>
                  <TableCell>{row.updatedAt ? format(new Date(row.updatedAt), 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="rounded-xl border border-border/65 bg-background/55" onClick={() => void handleDelete()} disabled={deleting}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
