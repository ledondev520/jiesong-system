/** 采购详情分批到货、累计验货与完整验货历史；只允许已发货新批次写入。 */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthStore } from '@/store/auth.store';
import { clearApiGetCache } from '@/lib/axios';
import { formatDate, formatDateTime } from '@/lib/date-format';
import { purchaseReceiptService, type PurchaseReceipt, type PurchaseReceiptList, type PurchaseReceiptInspectionHistoryItem } from '@/services/purchaseReceipt.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorState } from '@/components/ui/data-state';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { toast } from 'sonner';

// 与后端数量上限容差一致，避免0.1+0.2误报超过0.3。
const EPSILON = 1e-9;

interface Props { purchaseContractId: string; readOnly?: boolean; onChanged?: () => void | Promise<void> }
interface ArrivalForm { requestId: string; date: string; note: string; quantities: Record<string, number> }
interface InspectionForm { requestId: string; receipt: PurchaseReceipt; note: string; quantities: Record<string, { accepted: number; reinspection: number }> }

export function PurchaseReceiptPanel({ purchaseContractId, readOnly = false, onChanged }: Props) {
  const role = useAuthStore((state) => state.user?.role);
  const [data, setData] = useState<PurchaseReceiptList | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [arrival, setArrival] = useState<ArrivalForm | null>(null);
  const [inspection, setInspection] = useState<InspectionForm | null>(null);
  const [historyReceipt, setHistoryReceipt] = useState<PurchaseReceipt | null>(null);
  const [history, setHistory] = useState<PurchaseReceiptInspectionHistoryItem[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const canWrite = !readOnly && ['ADMIN', 'PURCHASE', 'WAREHOUSE'].includes(role || '') && !!data && data.status === 'SHIPPED' && data.summary.canReceive && !data.summary.legacy && !loading && !error;
  const remainingItems = data?.summary.items.filter((item) => item.remainingQuantity > 0) || [];

  const load = useCallback(async () => {
    setLoading(true); setError(false);
    try { const response = await purchaseReceiptService.list(purchaseContractId, { page, pageSize }); setData(response.data); }
    catch { setError(true); } finally { setLoading(false); }
  }, [purchaseContractId, page, pageSize]);
  useEffect(() => { void load(); }, [load]);
  const loadHistory = useCallback(async () => {
    if (!historyReceipt) return;
    setHistoryLoading(true); setHistoryError(false);
    try { const response = await purchaseReceiptService.inspections(purchaseContractId, historyReceipt.id, { page: historyPage, pageSize: 20 }); setHistory(response.data?.items || []); setHistoryTotal(response.data?.pagination?.total || 0); }
    catch { setHistoryError(true); } finally { setHistoryLoading(false); }
  }, [purchaseContractId, historyReceipt, historyPage]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const changeArrival = (patch: Partial<ArrivalForm>) => setArrival((current) => current && ({ ...current, ...patch, requestId: crypto.randomUUID() }));
  const changeInspection = (patch: Partial<InspectionForm>) => setInspection((current) => current && ({ ...current, ...patch, requestId: crypto.randomUUID() }));
  const afterSave = () => {
    setArrival(null); setInspection(null); toast.success('记录已保存'); void load();
    void Promise.resolve().then(() => onChanged?.()).catch(() => toast.error('记录已保存，合同摘要刷新失败，请刷新页面'));
  };
  const saveArrival = async () => {
    if (!arrival || !canWrite || saving) return;
    setFormError('');
    const items = remainingItems.map((item) => ({ purchaseItemId: item.purchaseItemId, arrivedQuantity: arrival.quantities[item.purchaseItemId] ?? 0 }));
    if (remainingItems.some((item) => { const quantity = arrival.quantities[item.purchaseItemId] ?? 0; return !Number.isFinite(quantity) || quantity < 0 || quantity > item.remainingQuantity + EPSILON; })) { setFormError('本批到货量不得为负或超过剩余采购量'); return; }
    const arrivedAt = new Date(`${arrival.date}T00:00:00+08:00`); // 到货日按公司北京时间保存。
    if (!items.some((item) => item.arrivedQuantity > 0) || !Number.isFinite(arrivedAt.getTime())) { setFormError('请选择到货日期，并填写至少一项本批到货量'); return; }
    setSaving(true);
    try { await purchaseReceiptService.create(purchaseContractId, { requestId: arrival.requestId, arrivedAt: arrivedAt.toISOString(), note: arrival.note.trim() || undefined, items: items.filter((item) => item.arrivedQuantity > 0) }); afterSave(); }
    catch (error) { setFormError((error as { message?: string })?.message || '到货登记失败，请原样重试'); } finally { setSaving(false); }
  };
  const saveInspection = async () => {
    if (!inspection || !canWrite || saving) return;
    setFormError('');
    if (!inspection.note.trim()) { setFormError('请填写验货说明；问题数量须说明原因与后续处理'); return; }
    const items = inspection.receipt.items.map((item) => ({ receiptItemId: item.id, acceptedQuantity: inspection.quantities[item.id].accepted, reinspectionQuantity: inspection.quantities[item.id].reinspection }));
    if (inspection.receipt.items.some((original) => { const quantity = inspection.quantities[original.id]; return !Number.isFinite(quantity.accepted) || !Number.isFinite(quantity.reinspection) || quantity.accepted < original.acceptedQuantity || quantity.reinspection < 0 || quantity.accepted + quantity.reinspection > original.arrivedQuantity + EPSILON; })) { setFormError('合格量不可下调；合格与待复验合计不得超过本批到货量'); return; }
    setSaving(true);
    try { await purchaseReceiptService.inspect(purchaseContractId, inspection.receipt.id, { requestId: inspection.requestId, note: inspection.note.trim(), items }); afterSave(); }
    catch (error) { setFormError((error as { message?: string })?.message || '验货登记失败，请原样重试'); } finally { setSaving(false); }
  };

  return <Card>
    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div><CardTitle>分批到货与验货</CardTitle><CardDescription className="mt-2">到货先待验，明确合格的数量才可入库；待验、待复验均不可出库。</CardDescription></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { clearApiGetCache(); void load(); }}>刷新到货记录</Button>{canWrite && remainingItems.length > 0 && <Button onClick={() => { setFormError(''); setArrival({ requestId: crypto.randomUUID(), date: formatDate(new Date()), note: '', quantities: Object.fromEntries(remainingItems.map((item) => [item.purchaseItemId, 0])) }); }}>登记分批到货</Button>}</div>
    </CardHeader>
    <CardContent className="space-y-4">
      {error ? <ErrorState title="到货验货记录读取失败" action={<Button variant="outline" onClick={() => { clearApiGetCache(); void load(); }}>重试</Button>} /> : loading ? <p role="status" className="text-sm text-muted-foreground">加载到货验货记录...</p> : data && <>
        {data.summary.legacy ? <p className="rounded-md border p-3 text-sm text-muted-foreground">历史收货缺少分批验货记录，保留既有库存，请核对历史记录，不能重复登记入库</p> : <p className="text-sm text-muted-foreground">{data.summary.complete ? '全数到齐且合格，可完成采购' : '全数到齐且合格后才能完成采购'}</p>}
        <div className="grid gap-2 sm:grid-cols-2">{data.summary.items.map((item) => <div key={item.purchaseItemId} className="min-w-0 rounded-md border p-3 text-sm"><p className="break-words font-medium">{item.productName}（{item.unit}）</p><p className="mt-1 text-muted-foreground">采购 {item.orderedQuantity} · 已到 {item.arrivedQuantity} · 剩余 {item.remainingQuantity}</p><p className="text-muted-foreground">合格 {item.acceptedQuantity} · 待验 {item.pendingQuantity} · 待复验 {item.reinspectionQuantity}</p></div>)}</div>
        {data.items.length === 0 ? <p className="text-sm text-muted-foreground">尚无分批到货记录</p> : data.items.map((receipt) => <div key={receipt.id} className="space-y-3 rounded-md border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-medium">到货批次 · {receipt.id.slice(-8)}</p><p className="text-xs text-muted-foreground">到货 {formatDate(receipt.arrivedAt)} · 登记 {formatDateTime(receipt.createdAt)} · <span>{receipt.createdBy?.displayName || '未知操作者'}</span></p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { setHistory([]); setHistoryLoading(true); setHistoryTotal(0); setHistoryPage(1); setHistoryReceipt(receipt); }}>全部验货记录</Button>{canWrite && receipt.items.some((item) => item.acceptedQuantity < item.arrivedQuantity) && <Button variant="outline" size="sm" onClick={() => { setFormError(''); setInspection({ requestId: crypto.randomUUID(), receipt, note: '', quantities: Object.fromEntries(receipt.items.map((item) => [item.id, { accepted: item.acceptedQuantity, reinspection: item.reinspectionQuantity }])) }); }}>登记验货</Button>}</div></div>
          {receipt.note && <p className="break-words text-sm text-muted-foreground">{receipt.note}</p>}
          {receipt.items.map((item) => <div key={item.id} className="min-w-0 space-y-1 text-sm"><p className="break-words font-medium">{item.productName} <Badge variant="outline">{item.unit}</Badge></p><p>本批到货 {item.arrivedQuantity} · 合格 {item.acceptedQuantity} · 待验 {item.pendingQuantity} · 待复验 {item.reinspectionQuantity}</p>{item.inspections?.length > 0 && <div className="space-y-1 border-l pl-3 text-xs text-muted-foreground"><p>最近 {item.inspections.length} 次验货 / 共 {item.inspectionCount ?? item.inspections.length} 次</p>{item.inspections.map((record) => <p key={record.id} className="break-words">{formatDateTime(record.inspectedAt)} · <span>{record.inspectedBy?.displayName || '未知操作者'}</span> · 合格 {record.acceptedQuantity} · 待验 {record.pendingQuantity} · 待复验 {record.reinspectionQuantity} · <span>{record.note}</span></p>)}</div>}</div>)}
        </div>)}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>共 {data.pagination?.total ?? data.items.length} 批，第 {page} 页</span><PageSizeSelect value={pageSize} onChange={(value) => { setPageSize(value); setPage(1); }} /><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={page * pageSize >= (data.pagination?.total ?? 0)} onClick={() => setPage(page + 1)}>下一页</Button></div>
      </>}
    </CardContent>
    <Dialog open={!!arrival && canWrite} onOpenChange={(open) => { if (!open && !saving) setArrival(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>登记本批到货</DialogTitle><DialogDescription>这里只登记实际到货；合格量默认为0，需要另行验货。</DialogDescription></DialogHeader>{arrival && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveArrival(); }}><fieldset disabled={saving} className="space-y-4"><Label htmlFor="receipt-date">到货日期</Label><Input id="receipt-date" type="date" required value={arrival.date} onChange={(event) => changeArrival({ date: event.target.value })} />{remainingItems.map((item) => <div key={item.purchaseItemId} className="space-y-2"><Label htmlFor={`arrived-${item.purchaseItemId}`}>{item.productName} 本批到货量</Label><Input id={`arrived-${item.purchaseItemId}`} type="number" min="0" max={item.remainingQuantity + EPSILON} step="any" value={Number.isNaN(arrival.quantities[item.purchaseItemId]) ? '' : arrival.quantities[item.purchaseItemId]} onChange={(event) => changeArrival({ quantities: { ...arrival.quantities, [item.purchaseItemId]: event.target.valueAsNumber } })} /><p className="text-xs text-muted-foreground">当前剩余 {item.remainingQuantity} {item.unit}</p></div>)}<Label htmlFor="receipt-note">到货备注</Label><Textarea id="receipt-note" value={arrival.note} onChange={(event) => changeArrival({ note: event.target.value })} />{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<Button type="submit">{saving ? '保存中...' : '保存到货'}</Button></fieldset></form>}</DialogContent></Dialog>
    <Dialog open={!!inspection && canWrite} onOpenChange={(open) => { if (!open && !saving) setInspection(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>登记本批验货</DialogTitle><DialogDescription>填写本批累计合格和待复验量；已入库合格量不可下调。</DialogDescription></DialogHeader>{inspection && <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void saveInspection(); }}><fieldset disabled={saving} className="space-y-4"><Button type="button" variant="outline" onClick={() => changeInspection({ quantities: Object.fromEntries(inspection.receipt.items.map((item) => [item.id, { accepted: item.arrivedQuantity, reinspection: 0 }])) })}>全数合格</Button>{inspection.receipt.items.map((item) => <div key={item.id} className="space-y-3 rounded-md border p-3"><p className="break-words font-medium">{item.productName} · 本批到货 {item.arrivedQuantity} {item.unit}</p><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor={`accepted-${item.id}`}>{item.productName} 累计合格量</Label><Input id={`accepted-${item.id}`} type="number" min={item.acceptedQuantity} max={item.arrivedQuantity + EPSILON} step="any" required value={Number.isNaN(inspection.quantities[item.id].accepted) ? '' : inspection.quantities[item.id].accepted} onChange={(event) => changeInspection({ quantities: { ...inspection.quantities, [item.id]: { ...inspection.quantities[item.id], accepted: event.target.valueAsNumber } } })} /></div><div className="space-y-2"><Label htmlFor={`reinspect-${item.id}`}>{item.productName} 待复验量</Label><Input id={`reinspect-${item.id}`} type="number" min="0" max={Math.max(0, item.arrivedQuantity - inspection.quantities[item.id].accepted) + EPSILON} step="any" required value={Number.isNaN(inspection.quantities[item.id].reinspection) ? '' : inspection.quantities[item.id].reinspection} onChange={(event) => changeInspection({ quantities: { ...inspection.quantities, [item.id]: { ...inspection.quantities[item.id], reinspection: event.target.valueAsNumber } } })} /></div></div><p className="text-xs text-muted-foreground">待验 {Math.max(0, item.arrivedQuantity - inspection.quantities[item.id].accepted - inspection.quantities[item.id].reinspection)} · 本次新增合格 {Math.max(0, inspection.quantities[item.id].accepted - item.acceptedQuantity)}</p></div>)}<Label htmlFor="inspection-note">验货说明</Label><Textarea id="inspection-note" required placeholder="记录验货依据；待验或待复验的问题数量需说明原因和后续处理" value={inspection.note} onChange={(event) => changeInspection({ note: event.target.value })} />{formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}<Button type="submit">{saving ? '保存中...' : '保存验货'}</Button></fieldset></form>}</DialogContent></Dialog>
    <Dialog open={!!historyReceipt} onOpenChange={(open) => !open && setHistoryReceipt(null)}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>本批全部验货记录</DialogTitle><DialogDescription>每次验货的数量、说明、时间与操作者。</DialogDescription></DialogHeader>{historyError ? <ErrorState title="验货历史读取失败" action={<Button onClick={() => { clearApiGetCache(); void loadHistory(); }}>重试</Button>} /> : historyLoading ? <p role="status">加载验货历史...</p> : history.length === 0 ? <p className="text-sm text-muted-foreground">尚无验货记录</p> : history.map((record) => <div key={record.id} className="space-y-1 rounded-md border p-3 text-sm"><p className="break-words font-medium">{record.productName}（{record.unit}）</p><p className="text-xs text-muted-foreground">{formatDateTime(record.inspectedAt)} · {record.inspectedBy?.displayName}</p><p>合格 {record.acceptedQuantity} · 待验 {record.pendingQuantity} · 待复验 {record.reinspectionQuantity}</p><p className="break-words text-muted-foreground">{record.note}</p></div>)}<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>共 {historyTotal} 次，第 {historyPage} 页</span><Button variant="outline" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage(historyPage - 1)}>上一页</Button><Button variant="outline" size="sm" disabled={historyPage * 20 >= historyTotal} onClick={() => setHistoryPage(historyPage + 1)}>下一页</Button></div></DialogContent></Dialog>
  </Card>;
}
