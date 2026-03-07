/**
 * Input: 报关单状态值
 * Output: 统一状态徽章与状态选项
 * Pos: 报关单管理共享展示组件
 *
 * Note: 我被更新时，必须同步更新本头注释 + 所属目录 README/INDEX。
 */

import { SemanticBadge } from '@/components/ui/semantic-badge';
import { CustomsDeclarationStatus } from '@/types';

const statusConfig: Record<
  CustomsDeclarationStatus,
  {
    label: string;
    tone: React.ComponentProps<typeof SemanticBadge>['tone'];
  }
> = {
  [CustomsDeclarationStatus.DRAFT]: { label: '草稿', tone: 'neutral' },
  [CustomsDeclarationStatus.SUBMITTED]: { label: '已申报', tone: 'info' },
  [CustomsDeclarationStatus.INSPECTING]: { label: '查验中', tone: 'warning' },
  [CustomsDeclarationStatus.RELEASED]: { label: '已放行', tone: 'success' },
  [CustomsDeclarationStatus.COMPLETED]: { label: '已归档', tone: 'secondary' },
  [CustomsDeclarationStatus.CANCELLED]: { label: '已作废', tone: 'danger' },
};

export const customsDeclarationStatusOptions = [
  { value: 'ALL', label: '全部状态' },
  ...Object.entries(statusConfig).map(([value, config]) => ({
    value,
    label: config.label,
  })),
];

interface CustomsDeclarationStatusBadgeProps {
  status: CustomsDeclarationStatus;
}

export function CustomsDeclarationStatusBadge({
  status,
}: CustomsDeclarationStatusBadgeProps) {
  const config = statusConfig[status] ?? statusConfig[CustomsDeclarationStatus.DRAFT];

  return <SemanticBadge tone={config.tone}>{config.label}</SemanticBadge>;
}
