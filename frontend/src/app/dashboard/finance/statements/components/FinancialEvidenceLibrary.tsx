/**
 * Input: 财务资料库受限查询 Interface
 * Output: 分类/账期筛选、文档列表、Sheet 选择与脱敏行级下钻
 * Pos: 财务报表页资料证据分区，遵循 shadcn/ui 模式
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Database, FileSpreadsheet, Loader2, ShieldCheck } from 'lucide-react';
import {
  financialStatementsService,
  type FinancialEvidenceDocument,
  type FinancialEvidenceDocumentDetail,
  type FinancialEvidenceSummary,
} from '@/services/financialStatements.service';

const ALL = 'ALL';

function periodLabel(document: FinancialEvidenceDocument) {
  if (!document.periodYear) return '未识别账期';
  return document.periodMonth ? `${document.periodYear}-${String(document.periodMonth).padStart(2, '0')}` : `${document.periodYear} 年`;
}

function displayCell(value: string | number | boolean | null) {
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

export function FinancialEvidenceLibrary() {
  const [summary, setSummary] = useState<FinancialEvidenceSummary | null>(null);
  const [documents, setDocuments] = useState<FinancialEvidenceDocument[]>([]);
  const [category, setCategory] = useState(ALL);
  const [period, setPeriod] = useState(ALL);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<FinancialEvidenceDocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filters = useCallback(() => {
    const [year, month] = period === ALL ? [] : period.split('-').map(Number);
    return {
      category: category === ALL ? undefined : category,
      year,
      month,
      pageSize: 100,
    };
  }, [category, period]);

  useEffect(() => {
    let active = true;
    Promise.all([
      financialStatementsService.getEvidenceSummary(),
      financialStatementsService.listEvidenceDocuments(filters()),
    ]).then(([summaryData, page]) => {
      if (!active) return;
      setSummary(summaryData);
      setDocuments(page.items);
      setSelectedId((current) => page.items.some((item) => item.id === current) ? current : (page.items[0]?.id || ''));
      setError('');
    }).catch(() => {
      if (active) setError('资料库仅对财务和管理员角色开放，或当前查询暂不可用。');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [filters]);

  const loadDetail = useCallback(async (id: string, sheetId?: string, page = 1) => {
    const next = id
      ? await financialStatementsService.getEvidenceDocument(id, { sheetId, page, pageSize: 50 })
      : null;
    setDetail(next);
  }, []);

  useEffect(() => {
    let active = true;
    if (selectedId) {
      financialStatementsService.getEvidenceDocument(selectedId, { page: 1, pageSize: 50 })
        .then((next) => { if (active) setDetail(next); })
        .catch(() => { if (active) setError('资料明细暂时无法读取。'); });
    }
    return () => { active = false; };
  }, [selectedId]);

  if (loading) {
    return <Card><CardContent className="flex items-center justify-center gap-2 py-12 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />正在加载财务资料库</CardContent></Card>;
  }
  if (error && !summary) {
    return <Card className="border-dashed"><CardContent className="py-8 text-center text-sm text-muted-foreground">{error}</CardContent></Card>;
  }
  if (!summary || summary.totals.documentCount === 0) return null;

  const maxColumns = Math.max(0, ...((detail?.rows || []).map((row) => row.values.length)));

  return (
    <section className="space-y-4" data-testid="financial-evidence-library">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" />财务分析资料库</CardTitle>
              <CardDescription className="mt-1">工资、税务、凭证和日记账等来源已结构化；个人标识在入库前脱敏，原文件未归档。</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{summary.totals.documentCount} 份资料</Badge>
              <Badge variant="secondary">{summary.totals.sheetCount} 个 Sheet</Badge>
              <Badge variant="secondary">{summary.totals.rowCount.toLocaleString('zh-CN')} 行</Badge>
              <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" />{summary.totals.redactionCount} 处脱敏</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="资料分类" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>全部分类</SelectItem>{summary.categories.map((item) => <SelectItem key={item.category} value={item.category}>{item.categoryLabel}（{item.documentCount}）</SelectItem>)}</SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="账期" /></SelectTrigger>
            <SelectContent><SelectItem value={ALL}>全部账期</SelectItem>{summary.periods.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,2.2fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">来源资料</CardTitle><CardDescription>当前筛选 {documents.length} 份</CardDescription></CardHeader>
          <CardContent className="max-h-[520px] space-y-2 overflow-auto">
            {documents.map((document) => (
              <Button key={document.id} variant={selectedId === document.id ? 'secondary' : 'ghost'} className="h-auto w-full justify-start px-3 py-3 text-left" onClick={() => setSelectedId(document.id)}>
                <FileSpreadsheet className="mr-2 h-4 w-4 shrink-0" />
                <span className="min-w-0"><span className="block truncate font-medium">{document.categoryLabel}</span><span className="block text-xs text-muted-foreground">{periodLabel(document)} · {document.importedSheetCount} Sheet · {document.rowCount} 行</span></span>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="truncate text-base">{detail?.fileName || '选择资料查看明细'}</CardTitle>
            {detail && <CardDescription>{detail.categoryLabel} · {periodLabel(detail)} · 仅显示已脱敏结构化数据</CardDescription>}
          </CardHeader>
          {detail?.selectedSheet && (
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">{detail.sheets.map((sheet) => <Button key={sheet.id} size="sm" variant={detail.selectedSheet?.id === sheet.id ? 'default' : 'outline'} onClick={() => void loadDetail(detail.id, sheet.id)}>{sheet.sheetName}（{sheet.rowCount}）</Button>)}</div>
              <div className="overflow-auto rounded-md border">
                <Table className="min-w-max">
                  <TableHeader><TableRow><TableHead className="sticky left-0 bg-background">源行</TableHead>{Array.from({ length: maxColumns }, (_, index) => <TableHead key={index}>列 {index + 1}</TableHead>)}</TableRow></TableHeader>
                  <TableBody>{detail.rows.map((row) => <TableRow key={row.id}><TableCell className="sticky left-0 bg-background font-mono text-xs">{row.sourceRow}</TableCell>{Array.from({ length: maxColumns }, (_, index) => <TableCell key={index} className="max-w-80 whitespace-normal">{displayCell(row.values[index] ?? null)}</TableCell>)}</TableRow>)}</TableBody>
                </Table>
              </div>
              {detail.pagination && detail.pagination.totalPages > 1 && <div className="flex items-center justify-between text-sm text-muted-foreground"><span>第 {detail.pagination.page} / {detail.pagination.totalPages} 页</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={detail.pagination.page <= 1} onClick={() => void loadDetail(detail.id, detail.selectedSheet?.id, detail.pagination!.page - 1)}>上一页</Button><Button size="sm" variant="outline" disabled={detail.pagination.page >= detail.pagination.totalPages} onClick={() => void loadDetail(detail.id, detail.selectedSheet?.id, detail.pagination!.page + 1)}>下一页</Button></div></div>}
            </CardContent>
          )}
        </Card>
      </div>
    </section>
  );
}
