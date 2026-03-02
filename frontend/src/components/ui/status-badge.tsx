/**
 * Input: 业务状态文本、语义色
 * Output: 统一状态徽章渲染组件
 * Pos: 前端UI 统一状态层，复用语义映射，减少页面重复函数
 */

import { type ComponentProps } from 'react';
import { SemanticBadge } from '@/components/ui/semantic-badge';

export type StatusBadgeConfig = {
  label: string;
  tone: ComponentProps<typeof SemanticBadge>['tone'];
};

type StatusMap = Record<string, StatusBadgeConfig>;

const DEFAULT_STATUS_MAP: StatusMap = {
  DRAFT: { label: '草稿', tone: 'neutral' },
  SIGNED: { label: '已签订', tone: 'info' },
  PENDING: { label: '待装柜', tone: 'neutral' },
  CONFIRMED: { label: '已确认', tone: 'neutral' },
  PRODUCING: { label: '生产中', tone: 'warning' },
  PACKING: { label: '装箱中', tone: 'warning' },
  LOADING: { label: '装柜中', tone: 'warning' },
  SHIPPING: { label: '运输中', tone: 'progress' },
  SHIPPED: { label: '已发运', tone: 'progress' },
  INBOUND: { label: '已入库', tone: 'secondary' },
  ARRIVED: { label: '已到达', tone: 'success' },
  OUTBOUND: { label: '已出库', tone: 'success' },
  COMPLETED: { label: '已完成', tone: 'secondary' },
  CANCELLED: { label: '已取消', tone: 'secondary' },
};

const normalizeStatus = (status: unknown): string =>
  typeof status === 'string' ? status.trim().toUpperCase() : 'UNKNOWN';

export const getStatusBadgeConfig = (
  status: unknown,
  overrides: StatusMap = {},
): StatusBadgeConfig => {
  const normalized = normalizeStatus(status);
  if (overrides[normalized]) {
    return overrides[normalized];
  }

  if (DEFAULT_STATUS_MAP[normalized]) {
    return DEFAULT_STATUS_MAP[normalized];
  }

  return {
    label: String(status),
    tone: 'neutral',
  };
};

export const StatusBadge = ({
  status,
  statusMap,
}: {
  status: unknown;
  statusMap?: StatusMap;
}) => {
  const config = getStatusBadgeConfig(status, statusMap);
  return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
};

export const registerStatusBadgeMap = (statusMap: StatusMap) => statusMap;
