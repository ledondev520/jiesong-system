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
import { SemanticBadge } from '@/components/ui/semantic-badge';
import { Loader2, Save, Pencil, DollarSign, Scale, Container, Calendar, MapPin, Ship, CheckCircle2 } from 'lucide-react';
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
    const statusMap: Record<SalesStatus, { label: string; tone: React.ComponentProps<typeof SemanticBadge>['tone'] }> = {
      [SalesStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
      [SalesStatus.CONFIRMED]: { label: '已确认', tone: 'info' },
      [SalesStatus.PACKING]: { label: '装箱中', tone: 'warning' },
      [SalesStatus.SHIPPED]: { label: '已发运', tone: 'progress' },
      [SalesStatus.ARRIVED]: { label: '已到达', tone: 'success' },
      [SalesStatus.COMPLETED]: { label: '已完成', tone: 'secondary' },
      [SalesStatus.CANCELLED]: { label: '已取消', tone: 'danger' },
    };
    const config = statusMap[status] || { label: status, tone: 'neutral' as const };
    return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
  };

  // 从 stores 中获取唯一的港口列表
  const ports = stores
    .filter(s => s.port)
    .map(s => s.port!)
    .filter((port, index, self) => self.findIndex(p => p.id === port.id) === index);

  const infoItems = [
    {
      icon: <Ship className="h-4 w-4 text-muted-foreground" />,
      label: '合同编号',
      value: contract.contractNo,
      editable: false,
    },
    {
      icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />,
      label: '状态',
      value: getStatusBadge(contract.status),
      editable: false,
      isElement: true,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: '总金额',
      value: `$${contract.totalAmount.toLocaleString()}`,
      editable: false,
      highlight: true,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: '已收款',
      value: `$${contract.receivedAmount.toLocaleString()}`,
      editable: false,
      highlight: contract.receivedAmount > 0,
    },
    {
      icon: <Container className="h-4 w-4 text-muted-foreground" />,
      label: '货物归属',
      value: contract.hasThirdPartyCargo ? '含第三方拼柜' : '仅捷淞货物',
      editable: false,
    },
    {
      icon: <Scale className="h-4 w-4 text-muted-foreground" />,
      label: '第三方来源',
      value: contract.sourceParties && contract.sourceParties.length > 0
        ? contract.sourceParties.join(', ')
        : '—',
      editable: false,
    },
    {
      icon: <DollarSign className="h-4 w-4 text-muted-foreground" />,
      label: '汇率',
      value: isEditing ? undefined : String(contract.exchangeRate),
      editable: true,
      editRender: (
        <Input
          type="number"
          step="0.01"
          value={form.exchangeRate}
          onChange={(e) => setForm(prev => ({ ...prev, exchangeRate: parseFloat(e.target.value) || 0 }))}
          className="h-8"
        />
      ),
    },
    {
      icon: <MapPin className="h-4 w-4 text-muted-foreground" />,
      label: '目的港',
      value: isEditing ? undefined : (contract.port?.name || '-'),
      editable: true,
      editRender: (
        <Select value={form.portId} onValueChange={(v) => setForm(prev => ({ ...prev, portId: v }))}>
          <SelectTrigger className="h-8">
            <SelectValue placeholder="选择目的港" />
          </SelectTrigger>
          <SelectContent>
            {ports.map(port => (
              <SelectItem key={port.id} value={port.id}>{port.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
    {
      icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
      label: '签订日期',
      value: isEditing ? undefined : formatDate(contract.signedAt),
      editable: true,
      editRender: (
        <Input
          type="date"
          value={form.signedAt}
          onChange={(e) => setForm(prev => ({ ...prev, signedAt: e.target.value }))}
          className="h-8"
        />
      ),
    },
    {
      icon: <Calendar className="h-4 w-4 text-muted-foreground" />,
      label: '预计到达',
      value: isEditing ? undefined : formatDate(contract.estimatedArrival),
      editable: true,
      editRender: (
        <Input
          type="date"
          value={form.estimatedArrival}
          onChange={(e) => setForm(prev => ({ ...prev, estimatedArrival: e.target.value }))}
          className="h-8"
        />
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-primary" />
            合同信息
          </CardTitle>
          <CardDescription>
            {isEditing ? '编辑合同基本信息' : '查看合同详情'}
          </CardDescription>
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" /> 编辑
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2">
          {infoItems.map((item, idx) => (
            <div key={idx} className="flex items-start gap-3 rounded-lg border border-border/50 p-3">
              <div className="mt-0.5">{item.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{item.label}</p>
                {isEditing && item.editable && item.editRender ? (
                  <div className="mt-1">{item.editRender}</div>
                ) : item.isElement ? (
                  <div className="mt-1">{item.value as React.ReactNode}</div>
                ) : (
                  <p className={`text-sm font-medium truncate ${item.highlight ? 'text-primary' : ''}`}>
                    {item.value as string}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 编辑模式下的操作按钮 */}
        {isEditing && (
          <div className="flex gap-2 justify-end pt-5 border-t mt-5">
            <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
              取消
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
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
