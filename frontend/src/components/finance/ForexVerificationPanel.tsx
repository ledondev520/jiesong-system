'use client';

import { useCallback, useEffect, useState } from 'react';
import { forexVerificationService, type ForexVerification } from '@/services/forexVerification.service';
import { useAuthStore } from '@/store/auth.store';
import { clearApiGetCache } from '@/lib/axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/data-state';
import { toast } from 'sonner';

const statuses: Record<string, string> = { PENDING: '待核销', VERIFIED: '已核销', FAILED: '核销失败' };

export function ForexVerificationPanel({ salesContractId }: { salesContractId: string }) {
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = ['ADMIN', 'FINANCE', 'SALES'].includes(role || '');
  const [items, setItems] = useState<ForexVerification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<ForexVerification | null>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try {
      const response = await forexVerificationService.getAll({ salesContractId, keyword, page, pageSize: 20 });
      setItems(response.data?.items || []); setTotal(response.data?.pagination?.total || 0);
    } catch { setError(true); } finally { setLoading(false); }
  }, [salesContractId, keyword, page]);
  useEffect(() => { void load(); }, [load]);
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { bankName, receivedAmount, settledAmount, exchangeRate, status, verifiedAt, note } = editing;
      await forexVerificationService.update(editing.id, { bankName, receivedAmount, settledAmount, exchangeRate, status, verifiedAt, note });
      toast.success('核销跟进已保存'); setEditing(null); await load();
    } catch { toast.error('核销跟进保存失败，请重试'); } finally { setSaving(false); }
  };
  return <Card>
    <CardHeader><CardTitle>收汇核销跟进</CardTitle><CardDescription>查看三表生成的相关记录并维护银行回执进度；外部办理仍需财务核对。</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      <div className="flex gap-2"><Input value={keyword} placeholder="搜索核销单号或银行" onChange={(event) => { setKeyword(event.target.value); setPage(1); }} /><Button variant="outline" onClick={() => { clearApiGetCache(); void load(); }}>刷新</Button>{keyword && <Button variant="ghost" onClick={() => { setKeyword(''); setPage(1); }}>重置</Button>}</div>
      {error ? <ErrorState title="核销记录读取失败" action={<Button onClick={() => { clearApiGetCache(); void load(); }}>重试</Button>} /> : loading ? <p role="status">加载中...</p> : items.length === 0 ? <p className="text-sm text-muted-foreground">尚无匹配的核销记录；可从出口详情生成三表。</p> : items.map((record) => <div key={record.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
        <div className="min-w-0 space-y-1"><p className="break-all font-medium">{record.verificationNo} · {statuses[record.status] || record.status}</p><p className="text-xs text-muted-foreground">{record.bankName || '未登记银行'} · 到账 {record.currency} {record.receivedAmount.toLocaleString()} · 结汇 {record.settledAmount ?? '未登记'} · 汇率 {record.exchangeRate ?? '未登记'}</p><p className="break-words text-xs text-muted-foreground">{record.verifiedAt ? `核销日期 ${record.verifiedAt.slice(0,10)}` : '未登记核销日期'}{record.note ? ` · ${record.note}` : ''}</p></div>
        {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing({ ...record })}>维护跟进</Button>}
      </div>)}
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><span>共 {total} 条，第 {page} 页</span><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage(page + 1)}>下一页</Button></div>
    </CardContent>
    <Dialog open={!!editing} onOpenChange={(open) => !open && !saving && setEditing(null)}><DialogContent aria-describedby={undefined}><DialogHeader><DialogTitle>维护 {editing?.verificationNo}</DialogTitle></DialogHeader>
      {editing && <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <Label htmlFor="forex-bank">银行</Label><Input id="forex-bank" value={editing.bankName || ''} onChange={(event) => setEditing({ ...editing, bankName: event.target.value })} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="forex-received">到账金额（{editing.currency}）</Label><Input id="forex-received" type="number" min="0" step="0.01" required value={Number.isNaN(editing.receivedAmount) ? '' : editing.receivedAmount} onChange={(event) => setEditing({ ...editing, receivedAmount: event.target.valueAsNumber })} /></div>
          <div className="space-y-2"><Label htmlFor="forex-settled">结汇金额（CNY）</Label><Input id="forex-settled" type="number" min="0" step="0.01" value={editing.settledAmount == null || Number.isNaN(editing.settledAmount) ? '' : editing.settledAmount} onChange={(event) => setEditing({ ...editing, settledAmount: event.target.value ? event.target.valueAsNumber : null })} /></div>
          <div className="space-y-2"><Label htmlFor="forex-rate">结汇汇率</Label><Input id="forex-rate" type="number" min="0.000001" step="any" value={editing.exchangeRate == null || Number.isNaN(editing.exchangeRate) ? '' : editing.exchangeRate} onChange={(event) => setEditing({ ...editing, exchangeRate: event.target.value ? event.target.valueAsNumber : null })} /></div>
          <div className="space-y-2"><Label htmlFor="forex-date">核销日期</Label><Input id="forex-date" type="date" value={editing.verifiedAt?.slice(0,10) || ''} onChange={(event) => setEditing({ ...editing, verifiedAt: event.target.value || null })} /></div>
        </div>
        <Label>状态</Label><Select value={editing.status} onValueChange={(status) => setEditing({ ...editing, status })}><SelectTrigger aria-label="核销状态"><SelectValue /></SelectTrigger><SelectContent>{!statuses[editing.status] && <SelectItem value={editing.status}>{editing.status}</SelectItem>}{Object.entries(statuses).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
        <Label htmlFor="forex-note">回执 / 跟进备注</Label><Input id="forex-note" value={editing.note || ''} onChange={(event) => setEditing({ ...editing, note: event.target.value })} />
        <Button type="submit" disabled={saving}>{saving ? '保存中...' : '保存跟进'}</Button>
      </form>}
    </DialogContent></Dialog>
  </Card>;
}
