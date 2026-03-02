/**
 * Input: SalesContract, Store[], onSave callback
 * Output: 合同信息编辑表单组件
 * Pos: 出口合同详情页子组件，支持编辑合同基本信息
 * 
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

'use client';

import { useState, useEffect } from 'react';
import { SalesContract, Store, SalesStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge, type StatusBadgeConfig } from '@/components/ui/status-badge';
import { Loader2, Save, Pencil } from 'lucide-react';
import { formatDate } from '@/lib/date-format';

interface ContractInfoEditorProps {
  contract: SalesContract;
  stores: Store[];
  onSave: (data: Partial<SalesContract>) => Promise<void>;
}

/**
 * 职责：合同信息编辑表单
 * 思路：显示合同信息，支持编辑目的港、预计到达、签订日期、汇率
 */
export function ContractInfoEditor({ contract, stores, onSave }: ContractInfoEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    exchangeRate: contract.exchangeRate,
    signedAt: formatDate(contract.signedAt, ''),
    estimatedArrival: formatDate(contract.estimatedArrival, ''),
    portId: contract.portId || '',
  });

  // 当合同数据变化时同步表单
  useEffect(() => {
    setForm({
      exchangeRate: contract.exchangeRate,
      signedAt: formatDate(contract.signedAt, ''),
      estimatedArrival: formatDate(contract.estimatedArrival, ''),
      portId: contract.portId || '',
    });
  }, [contract]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave({
        exchangeRate: form.exchangeRate,
        signedAt: form.signedAt || undefined,
        estimatedArrival: form.estimatedArrival || undefined,
        portId: form.portId || undefined,
      });
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: SalesStatus) => {
    const statusMap: Record<SalesStatus, StatusBadgeConfig> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'info' },
      [SalesStatus.PACKING]: { label: '装箱中', tone: 'warning' },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress' },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success' },
      [SalesStatus.COMPLETED]: { label: '已完成', tone: 'secondary' },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    return <StatusBadge status={status} statusMap={statusMap} />;
  };

  // 从 stores 中获取唯一的港口列表
  const ports = stores
    .filter(s => s.port)
    .map(s => s.port!)
    .filter((port, index, self) => self.findIndex(p => p.id === port.id) === index);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>合同信息</CardTitle>
          <CardDescription>
            {isEditing ? '编辑合同基本信息' : '查看合同详情'}
          </CardDescription>
        </div>
        {!isEditing && (
          <Button variant="outline" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> 编辑
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        {/* 只读字段 */}
        <div>
          <div className="text-sm text-muted-foreground">合同编号</div>
          <div className="font-medium">{contract.contractNo}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">状态</div>
          <div>{getStatusBadge(contract.status)}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">总金额（自动计算）</div>
          <div className="font-medium text-chart-3">${contract.totalAmount.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">已收款</div>
          <div className="font-medium">${contract.receivedAmount.toLocaleString()}</div>
        </div>

        {/* 可编辑字段 */}
        <div>
          <div className="text-sm text-muted-foreground mb-1">汇率</div>
          {isEditing ? (
            <Input
              type="number"
              step="0.01"
              value={form.exchangeRate}
              onChange={(e) => setForm(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 0 }))}
            />
          ) : (
            <div className="font-medium">{contract.exchangeRate}</div>
          )}
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">目的港</div>
          {isEditing ? (
            <Select value={form.portId} onValueChange={(v) => setForm(prev => ({ ...prev, portId: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="选择目的港" />
              </SelectTrigger>
              <SelectContent>
                {ports.map(port => (
                  <SelectItem key={port.id} value={port.id}>{port.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="font-medium">{contract.port?.name || '-'}</div>
          )}
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">签订日期</div>
          {isEditing ? (
            <Input
              type="date"
              value={form.signedAt}
              onChange={(e) => setForm(prev => ({ ...prev, signedAt: e.target.value }))}
            />
          ) : (
            <div className="font-medium">
              {formatDate(contract.signedAt)}
            </div>
          )}
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">预计到达</div>
          {isEditing ? (
            <Input
              type="date"
              value={form.estimatedArrival}
              onChange={(e) => setForm(prev => ({ ...prev, estimatedArrival: e.target.value }))}
            />
          ) : (
            <div className="font-medium">
              {formatDate(contract.estimatedArrival)}
            </div>
          )}
        </div>

        {/* 编辑模式下的操作按钮 */}
        {isEditing && (
          <div className="md:col-span-2 flex gap-2 justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setIsEditing(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
