/**
 * Input: 工作台专项单查询条件、后端 dashboard Interface
 * Output: 八阶段专项单主线路、阻塞原因与唯一下一动作
 * Pos: 工作台和专项单详情共享的前端数据 Module
 */

import api from '@/lib/axios';
import type { ApiResponse } from '@/types';

export type TradeWorkflowStageStatus = 'completed' | 'current' | 'blocked' | 'pending';

export interface TradeWorkflowAction {
  label: string;
  href: string;
}

export interface TradeWorkflowStage {
  key: string;
  label: string;
  status: TradeWorkflowStageStatus;
  reason: string;
  prepareOn?: string | null;
  action?: TradeWorkflowAction;
}

export interface ShipmentReadinessSummary {
  weightPct: number;
  volumePct: number;
  utilizationReady: boolean;
  overloaded: boolean;
  overloadReasons: string[];
  physicalFit: boolean;
  placedBoxCount: number;
  unplacedBoxCount: number;
  estimatedDimensionCount: number;
  missingBoxItemCount: number;
  blockers: string[];
  ready: boolean;
}

export interface TradeWorkflow {
  id: string;
  contractNo: string;
  status: string;
  purchaseContractNos: string[];
  stages: TradeWorkflowStage[];
  completedStageCount: number;
  stageCount: number;
  nextAction: TradeWorkflowAction;
  issues: string[];
  readiness: ShipmentReadinessSummary;
  finance: {
    purchaseTotal: number;
    purchasePaid: number;
    salesTotalUsd: number;
    receivedUsd: number;
    exchangeRate: number;
  };
}

export const tradeWorkflowService = {
  syncStatus: () => api.get<ApiResponse<WpsSyncStatus>, ApiResponse<WpsSyncStatus>>('/dashboard/wps-sync'),
  list: (limit = 6, scope: 'recent' | 'pending' | 'blocked' | 'risk' = 'recent') => api.get<ApiResponse<TradeWorkflow[]>, ApiResponse<TradeWorkflow[]>>(
    '/dashboard/trade-workflows',
    { params: { limit, scope } },
  ),
};

export interface WpsSyncStatus {
  state: 'never' | 'current' | 'needs_review' | 'running' | 'failed' | 'stale';
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  conflicts: number;
  message?: string | null;
}
